import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDirAsync, existsAsync } from '@/utils/file';
import { PATH } from '@/config/constants';
import type { Logger } from '@/shared/logger';
import type { AldenBot } from '@/core/AldenBot';
import type { CommandBase } from '@/core/command/Command';
import type { I18nManager } from '@/i18n/I18nManager';
import type { Event } from '@/core/event/Event';
import type {
	EventListenerOptions,
	EventConstructor,
	EventHandler,
} from '@/core/event/EventManager';
import type { PluginManifest } from './PluginManifest';
import type { PluginRuntime } from './PluginRuntime';
import type { ServiceRegistrationOptions } from '@/core/ServiceRegistry';

const DEFAULT_PLUGIN_EVENT_PRIORITY = 30;
const PLUGIN_BASE_BRAND = Symbol.for('alden-bot.PluginBase');

interface PluginBaseCandidate {
	[PLUGIN_BASE_BRAND]?: boolean;
	dispose?: unknown;
	onLoad?: unknown;
	onEnable?: unknown;
	onDisable?: unknown;
}

export abstract class PluginBase {
	private readonly _logger: Logger;

	public get logger(): Logger {
		return this._logger;
	}

	private readonly listeners: Array<() => void> = [];
	private readonly commands: Array<CommandBase> = [];
	private readonly registeredServices: string[] = [];
	private readonly coreBot: AldenBot;

	public i18n?: I18nManager;

	private static readonly SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

	public constructor(
		public readonly description: PluginManifest,
		bot: AldenBot,
		public readonly pluginPath: string,
	) {
		if (!description?.name) {
			throw new Error('Plugin description must have a name');
		}
		if (!PluginBase.SAFE_NAME_RE.test(description.name)) {
			throw new Error(`Invalid plugin name: ${description.name}`);
		}
		if (!bot) {
			throw new Error('Plugin requires an AldenBot instance');
		}
		Object.defineProperty(this, PLUGIN_BASE_BRAND, {
			value: true,
			enumerable: false,
		});
		this.coreBot = bot;
		this.bot = bot;
		this._logger = bot.logger.child('plugin/' + description.name);
	}

	public readonly bot: PluginRuntime;

	public get dataFolder(): string {
		return path.join(PATH.DATA_DIR, 'plugins', this.description.name);
	}

	public async saveResources(filenames: string | string[], replace = false): Promise<void> {
		const files = Array.isArray(filenames) ? filenames : [filenames];
		for (const filename of files) {
			const src = path.join(this.pluginPath, 'resources', filename);
			const dest = path.join(this.dataFolder, filename);

			if (!replace && (await existsAsync(dest))) continue;

			if (!(await existsAsync(src))) {
				this._logger.warn(`Failed to save resource: File not found at ${src}`);
				continue;
			}

			await ensureDirAsync(path.dirname(dest));
			await fsp.copyFile(src, dest);
		}
	}

	protected registerEvent<T extends Event>(
		eventClass: EventConstructor<T>,
		handler: EventHandler<T>,
		options?: EventListenerOptions | number,
	): () => void {
		const listenerOptions =
			typeof options === 'number'
				? options
				: { priority: DEFAULT_PLUGIN_EVENT_PRIORITY, ...options };
		const dispose = this.coreBot.eventManager.on(eventClass, handler, listenerOptions);
		this.listeners.push(dispose);
		return dispose;
	}

	protected registerCommand(command: CommandBase): boolean {
		if (this.i18n) {
			command.i18n = this.i18n;
		}
		if (this.coreBot.commandManager.register(command)) {
			this.commands.push(command);
			return true;
		}
		return false;
	}

	protected scheduleTask(cronExp: string, callback: () => void | Promise<void>): boolean {
		return this.coreBot.schedulerManager.schedule(this.description.name, cronExp, callback);
	}

	protected registerService<T>(
		name: string,
		service: T,
		options: Omit<ServiceRegistrationOptions, 'owner'> = {},
	): boolean {
		const registered = this.coreBot.registerService(name, service, {
			...options,
			owner: this.description.name,
		});
		if (registered) {
			this.registeredServices.push(name);
		}
		return registered;
	}

	protected getService<T>(name: string): T | undefined {
		return this.coreBot.getService<T>(name);
	}

	protected emitEvent<T extends Event>(event: T): Promise<T> {
		return this.coreBot.eventManager.call(event);
	}

	public dispose(): void {
		this.coreBot.schedulerManager.clearTasks(this.description.name);

		for (const unsubscribe of this.listeners) {
			try {
				unsubscribe();
			} catch (err) {
				this.logger.error('Error unsubscribing listener during dispose', err);
			}
		}
		this.listeners.length = 0;

		for (const command of this.commands) {
			try {
				this.coreBot.commandManager.unregister(command);
			} catch (err) {
				this.logger.error(
					`Error unregistering command /${command.name} during dispose`,
					err,
				);
			}
		}
		this.commands.length = 0;

		for (const name of this.registeredServices) {
			this.coreBot.unregisterService(name, { owner: this.description.name });
		}
		this.registeredServices.length = 0;
	}

	public onLoad(): void | Promise<void> {}

	public onEnable(): void | Promise<void> {}

	public onDisable(): void | Promise<void> {}
}

export function isPluginBaseInstance(value: unknown): value is PluginBase {
	if (typeof value !== 'object' || value === null) return false;

	const candidate = value as PluginBaseCandidate;
	return (
		candidate[PLUGIN_BASE_BRAND] === true &&
		typeof candidate.dispose === 'function' &&
		typeof candidate.onLoad === 'function' &&
		typeof candidate.onEnable === 'function' &&
		typeof candidate.onDisable === 'function'
	);
}
