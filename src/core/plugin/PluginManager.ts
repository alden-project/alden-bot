import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

import type { AldenBot } from '@/core/AldenBot';
import { isPluginBaseInstance, type PluginBase } from './PluginBase';
import { existsAsync } from '@/utils/file';
import { PluginInstaller } from './PluginInstaller';
import { type PluginMeta, resolvePluginLoadOrder } from './PluginDependencyResolver';
import { type PluginManifest, validatePluginManifest } from './PluginManifest';

export class PluginManager {
	private readonly plugins = new Map<string, PluginBase>();
	private readonly enabledPlugins = new Set<string>();
	private readonly pluginPermissions = new Map<string, string[]>();
	private readonly installer: PluginInstaller;

	public constructor(private readonly bot: AldenBot) {
		this.installer = new PluginInstaller(bot.logger);
	}

	public async loadAll(pluginsDir: string): Promise<void> {
		const metas = await this.scanPlugins(pluginsDir);
		if (metas.length > 0) {
			this.bot.logger.warn(
				'Plugins are trusted code and can access the same system resources as the bot. Install plugins only from sources you trust.',
			);
		}
		const sorted = resolvePluginLoadOrder(metas, this.bot.logger);
		const failed = new Set<string>();

		for (const meta of sorted) {
			const unmetDep = meta.description.depend?.find((dependency) => failed.has(dependency));
			if (unmetDep) {
				this.bot.logger.error(
					`PluginManager: Skipping "${meta.name}" because dependency "${unmetDep}" failed to load.`,
				);
				failed.add(meta.name);
				continue;
			}

			const loaded = await this.loadPlugin(meta.pluginPath);
			if (!loaded) {
				failed.add(meta.name);
			}
		}
	}

	public async enableAll(): Promise<void> {
		for (const [name, plugin] of Array.from(this.plugins)) {
			const unmetDep = plugin.description.depend?.find(
				(dependency) => !this.enabledPlugins.has(dependency),
			);
			if (unmetDep) {
				this.bot.logger.error(
					`PluginManager: Skipping "${name}" because dependency "${unmetDep}" is not enabled.`,
				);
				await this.unloadPlugin(name);
				continue;
			}

			try {
				await plugin.onEnable();
				this.enabledPlugins.add(name);
				this.bot.logger.debug(`PluginManager: Enabled plugin "${name}"`);
			} catch (error) {
				this.bot.logger.error(`PluginManager: Failed to enable plugin "${name}"`, error);
				await this.unloadPlugin(name);
			}
		}

		this.bot.logger.info(
			`Loaded ${this.plugins.size} plugin(s) and enabled ${this.enabledPlugins.size} plugin(s)`,
		);
	}

	public async unloadAll(): Promise<void> {
		const pluginNames = Array.from(this.plugins.keys()).reverse();
		for (const name of pluginNames) {
			await this.unloadPlugin(name);
		}
		this.bot.logger.info(`PluginManager: Disabled ${pluginNames.length} plugin(s)`);
	}

	public async loadPlugin(pluginPath: string): Promise<boolean> {
		const manifest = await this.readManifest(pluginPath);
		if (!manifest) return false;

		if (this.plugins.has(manifest.name)) {
			this.bot.logger.error(
				`PluginManager: Plugin "${manifest.name}" is already loaded. Skipping duplicate from "${pluginPath}".`,
			);
			return false;
		}

		if (!this.validateApiVersion(manifest)) return false;
		if (!this.validateDependencies(manifest)) return false;

		const dependenciesReady = await this.installer.installIfNeeded(pluginPath, manifest.name);
		if (!dependenciesReady) return false;

		const plugin = await this.importPluginModule(manifest, pluginPath);
		if (!plugin) return false;

		const registeredPermissions = this.registerPermissions(manifest);
		try {
			await plugin.onLoad();
		} catch (error) {
			this.bot.logger.error(
				`PluginManager: onLoad failed for "${manifest.name}". Skipping.`,
				error,
			);
			plugin.dispose();
			this.unregisterPermissions(registeredPermissions);
			return false;
		}

		this.plugins.set(manifest.name, plugin);
		this.pluginPermissions.set(manifest.name, registeredPermissions);
		this.bot.logger.debug(
			`PluginManager: Loaded plugin "${manifest.name}" v${manifest.version} by ${manifest.author}`,
		);
		return true;
	}

	public async unloadPlugin(name: string): Promise<boolean> {
		const plugin = this.plugins.get(name);
		if (!plugin) return false;

		let success = true;
		this.enabledPlugins.delete(name);
		try {
			await plugin.onDisable();
		} catch (error) {
			this.bot.logger.error(`PluginManager: Error disabling plugin "${name}"`, error);
			success = false;
		}

		plugin.dispose();
		this.unregisterPermissions(this.pluginPermissions.get(name) ?? []);
		this.pluginPermissions.delete(name);
		this.plugins.delete(name);
		this.bot.logger.debug(`PluginManager: Disabled plugin "${name}"`);
		return success;
	}

	public getPlugin(name: string): PluginBase | undefined {
		return this.plugins.get(name);
	}

	public getPlugins(): ReadonlyMap<string, PluginBase> {
		return this.plugins;
	}

	public isPluginEnabled(name: string): boolean {
		return this.enabledPlugins.has(name);
	}

	private async readManifest(pluginPath: string): Promise<PluginManifest | null> {
		const descPath = path.join(pluginPath, 'plugin.json');
		const dirName = path.basename(pluginPath);

		if (!(await existsAsync(descPath))) {
			this.bot.logger.warn(
				`PluginManager: Skipping "${dirName}" because plugin.json is missing`,
			);
			return null;
		}

		let parsed: unknown;
		try {
			const raw = await fsp.readFile(descPath, 'utf-8');
			parsed = JSON.parse(raw);
		} catch (error) {
			this.bot.logger.error(
				`PluginManager: Failed to parse plugin.json in "${dirName}"`,
				error,
			);
			return null;
		}

		const { manifest, errors } = validatePluginManifest(parsed);
		if (!manifest) {
			for (const error of errors) {
				this.bot.logger.error(
					`PluginManager: Invalid plugin.json in "${dirName}": ${error}`,
				);
			}
			return null;
		}

		return manifest;
	}

	private validateApiVersion(description: PluginManifest): boolean {
		if (!description.apiVersion) return true;

		if (!semver.satisfies(this.bot.config.version, `>=${description.apiVersion}`)) {
			this.bot.logger.error(
				`PluginManager: "${description.name}" requires apiVersion ${description.apiVersion}, ` +
					`but framework is ${this.bot.config.version}. Skipping.`,
			);
			return false;
		}

		return true;
	}

	private validateDependencies(description: PluginManifest): boolean {
		for (const dependency of description.depend ?? []) {
			if (!this.plugins.has(dependency)) {
				this.bot.logger.error(
					`PluginManager: "${description.name}" requires "${dependency}" which is not loaded. Skipping.`,
				);
				return false;
			}
		}

		return true;
	}

	private async importPluginModule(
		description: PluginManifest,
		pluginPath: string,
	): Promise<PluginBase | null> {
		const pluginRoot = path.resolve(pluginPath);
		const mainPath = path.resolve(pluginRoot, description.main);

		if (!mainPath.startsWith(pluginRoot + path.sep)) {
			this.bot.logger.error(
				`PluginManager: "${description.name}" main path escapes the plugin directory.`,
			);
			return null;
		}

		if (!(await existsAsync(mainPath))) {
			this.bot.logger.error(`PluginManager: Main file not found: "${mainPath}"`);
			return null;
		}

		try {
			const cacheBuster = Date.now().toString();
			const importUrl = `${pathToFileURL(mainPath).href}?t=${cacheBuster}`;
			const module = (await import(importUrl)) as Record<string, unknown>;

			const PluginClass = (module.default ?? module.Main) as
				| (new (desc: PluginManifest, bot: AldenBot, pluginPath: string) => unknown)
				| undefined;

			if (typeof PluginClass !== 'function') {
				this.bot.logger.error(
					`PluginManager: "${description.name}" main file must export a plugin class as default.`,
				);
				return null;
			}

			const plugin = new PluginClass(description, this.bot, pluginRoot);
			if (!isPluginBaseInstance(plugin)) {
				this.bot.logger.error(
					`PluginManager: "${description.name}" must extend PluginBase from the public API.`,
				);
				return null;
			}

			return plugin;
		} catch (error) {
			this.bot.logger.error(
				`PluginManager: Failed to load plugin "${description.name}"`,
				error,
			);
			return null;
		}
	}

	private registerPermissions(description: PluginManifest): string[] {
		const registered: string[] = [];
		for (const [node, level] of Object.entries(description.permissions ?? {})) {
			this.bot.permissionManager.registerPermission(node, level);
			registered.push(node);
		}
		return registered;
	}

	private unregisterPermissions(nodes: string[]): void {
		for (const node of nodes) {
			this.bot.permissionManager.unregisterPermission(node);
		}
	}

	private async scanPlugins(pluginsDir: string): Promise<PluginMeta[]> {
		const entries = (await fsp.readdir(pluginsDir, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		const metas: PluginMeta[] = [];
		const seenPluginNames = new Map<string, string>();

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const pluginPath = path.join(pluginsDir, entry.name);
			const manifest = await this.readManifest(pluginPath);
			if (manifest) {
				const existingPath = seenPluginNames.get(manifest.name);
				if (existingPath) {
					this.bot.logger.error(
						`PluginManager: Duplicate plugin name "${manifest.name}" in "${pluginPath}". Keeping "${existingPath}".`,
					);
					continue;
				}

				seenPluginNames.set(manifest.name, pluginPath);
				metas.push({ name: manifest.name, description: manifest, pluginPath });
			}
		}

		return metas;
	}
}
