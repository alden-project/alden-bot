import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AldenBot } from '@/core/AldenBot';
import { PluginManager } from '@/core/plugin/PluginManager';
import type { Logger } from '@/shared/logger';

let tempRoot: string | undefined;

function createLoggerStub(): Logger {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);
	return logger as unknown as Logger;
}

function createBotStub() {
	const logger = createLoggerStub();
	const permissionManager = {
		registerPermission: vi.fn(),
		unregisterPermission: vi.fn(),
	};

	const bot = {
		logger,
		config: {
			version: '1.0.0',
		},
		permissionManager,
		schedulerManager: {
			clearTasks: vi.fn(),
			schedule: vi.fn(),
		},
		commandManager: {
			register: vi.fn(() => true),
			unregister: vi.fn(),
		},
		eventManager: {
			on: vi.fn(() => vi.fn()),
		},
		registerService: vi.fn(() => true),
		unregisterService: vi.fn(() => true),
		getService: vi.fn(),
	} as unknown as AldenBot;

	return { bot, logger, permissionManager };
}

async function createPluginDir(
	name: string,
	mainSource: string,
	options: { depend?: string[]; locales?: boolean; root?: string; manifestName?: string } = {},
): Promise<string> {
	tempRoot = options.root ?? (await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-plugin-')));
	const pluginPath = path.join(tempRoot, name);
	await fsp.mkdir(pluginPath, { recursive: true });
	await fsp.writeFile(
		path.join(pluginPath, 'plugin.json'),
		JSON.stringify(
			{
				name: options.manifestName ?? name,
				version: '1.0.0',
				description: 'Plugin under test',
				author: 'alden',
				main: 'main.ts',
				depend: options.depend,
				permissions: {
					'alden.test': 3,
				},
			},
			null,
			2,
		),
	);
	await fsp.writeFile(path.join(pluginPath, 'main.ts'), mainSource);
	if (options.locales) {
		const localesDir = path.join(pluginPath, 'resources', 'locales');
		await fsp.mkdir(localesDir, { recursive: true });
		await fsp.writeFile(
			path.join(localesDir, 'vi.json'),
			JSON.stringify({ hello: 'Xin chao' }),
		);
	}
	return pluginPath;
}

describe('PluginManager lifecycle handling', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('rolls back plugin state when onLoad fails', async () => {
		const { bot, permissionManager } = createBotStub();
		const manager = new PluginManager(bot);
		const pluginPath = await createPluginDir(
			'broken-load',
			`
import { PluginBase } from '@/api';

export default class BrokenLoadPlugin extends PluginBase {
	async onLoad() {
		throw new Error('onLoad failed');
	}
}
`,
		);

		await expect(manager.loadPlugin(pluginPath)).resolves.toBe(false);
		expect(manager.getPlugin('broken-load')).toBeUndefined();
		expect(permissionManager.registerPermission).toHaveBeenCalledWith('alden.test', 3);
		expect(permissionManager.unregisterPermission).toHaveBeenCalledWith('alden.test');
	});

	it('cleans registry state even when onDisable fails', async () => {
		const { bot, permissionManager } = createBotStub();
		const manager = new PluginManager(bot);
		const pluginPath = await createPluginDir(
			'broken-disable',
			`
import { PluginBase } from '@/api';

export default class BrokenDisablePlugin extends PluginBase {
	async onLoad() {}
	async onDisable() {
		throw new Error('onDisable failed');
	}
}
`,
		);

		await expect(manager.loadPlugin(pluginPath)).resolves.toBe(true);
		await expect(manager.unloadPlugin('broken-disable')).resolves.toBe(false);

		expect(manager.getPlugin('broken-disable')).toBeUndefined();
		expect(permissionManager.unregisterPermission).toHaveBeenCalledWith('alden.test');
	});

	it('leaves plugin locale resources under developer control', async () => {
		const { bot } = createBotStub();
		const manager = new PluginManager(bot);
		const pluginPath = await createPluginDir(
			'manual-i18n',
			`
import { PluginBase } from '@/api';

export default class ManualI18nPlugin extends PluginBase {
	async onLoad() {}
}
`,
			{ locales: true },
		);

		await expect(manager.loadPlugin(pluginPath)).resolves.toBe(true);

		const plugin = manager.getPlugin('manual-i18n') as { i18n?: unknown } | undefined;
		expect(plugin?.i18n).toBeUndefined();
	});

	it('skips plugin classes that do not extend PluginBase', async () => {
		const { bot, logger } = createBotStub();
		const manager = new PluginManager(bot);
		const pluginPath = await createPluginDir(
			'not-plugin',
			`
export default class NotPlugin {
	async onLoad() {}
	async onEnable() {}
	async onDisable() {}
	dispose() {}
}
`,
		);

		await expect(manager.loadPlugin(pluginPath)).resolves.toBe(false);
		expect(manager.getPlugin('not-plugin')).toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('must extend PluginBase'),
		);
	});

	it('keeps the first plugin when manifest names collide', async () => {
		const { bot, logger } = createBotStub();
		const manager = new PluginManager(bot);
		const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-plugin-dupes-'));
		tempRoot = root;
		const mainSource = `
import { PluginBase } from '@/api';

export default class DuplicatePlugin extends PluginBase {}
`;

		await createPluginDir('first', mainSource, { root, manifestName: 'duplicate' });
		await createPluginDir('second', mainSource, { root, manifestName: 'duplicate' });

		await manager.loadAll(root);

		expect(manager.getPlugins().size).toBe(1);
		expect(manager.getPlugin('duplicate')).toBeDefined();
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Duplicate plugin name'));
	});

	it('unloads dependents when a hard dependency fails to enable', async () => {
		const { bot, logger } = createBotStub();
		const manager = new PluginManager(bot);
		const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-plugin-enable-deps-'));
		tempRoot = root;

		await createPluginDir(
			'core',
			`
import { PluginBase } from '@/api';

export default class CorePlugin extends PluginBase {
	async onEnable() {
		throw new Error('enable failed');
	}
}
`,
			{ root },
		);
		await createPluginDir(
			'addon',
			`
import { PluginBase } from '@/api';

export default class AddonPlugin extends PluginBase {}
`,
			{ root, depend: ['core'] },
		);

		await manager.loadAll(root);
		await manager.enableAll();

		expect(manager.getPlugin('core')).toBeUndefined();
		expect(manager.getPlugin('addon')).toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('dependency "core" is not enabled'),
		);
	});

	it('unloads dependents before their dependencies', async () => {
		const { bot } = createBotStub();
		const services = new Map<string, unknown>();
		bot.registerService = vi.fn((name: string, service: unknown) => {
			services.set(name, service);
			return true;
		});
		bot.unregisterService = vi.fn((name: string) => {
			return services.delete(name);
		});
		bot.getService = ((name: string) => services.get(name)) as AldenBot['getService'];

		const manager = new PluginManager(bot);
		const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-plugin-unload-order-'));
		tempRoot = root;

		await createPluginDir(
			'core',
			`
import { PluginBase } from '@/api';

export default class CorePlugin extends PluginBase {
	async onEnable() {
		this.registerService('core-service', { ready: true });
	}
}
`,
			{ root },
		);
		await createPluginDir(
			'addon',
			`
import { PluginBase } from '@/api';

export default class AddonPlugin extends PluginBase {
	async onDisable() {
		if (!this.getService('core-service')) {
			throw new Error('dependency service missing during disable');
		}
	}
}
`,
			{ root, depend: ['core'] },
		);

		await manager.loadAll(root);
		await manager.enableAll();

		await expect(manager.unloadAll()).resolves.toBeUndefined();
		expect(manager.getPlugins().size).toBe(0);
	});
});
