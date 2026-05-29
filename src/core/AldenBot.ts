import type { API, MessageContent, ThreadType } from 'zca-js';

import {
	ADMIN_IDS,
	DEFAULT_LANGUAGE,
	ENABLE_EVAL_COMMAND,
	ENABLE_RELOAD_COMMAND,
	MESSAGE_QUEUE_DELAY,
	PATH,
	PREFIX,
	REPLY_UNKNOWN_COMMAND,
} from '@/config/constants';
import { CommandManager } from '@/core/command/CommandManager';
import { CancelCommand } from '@/core/command/builtins/CancelCommand';
import { EvalCommand } from '@/core/command/builtins/EvalCommand';
import { HelpCommand } from '@/core/command/builtins/HelpCommand';
import { LanguageCommand } from '@/core/command/builtins/LanguageCommand';
import { PermissionCommand } from '@/core/command/builtins/PermissionCommand';
import { PingCommand } from '@/core/command/builtins/PingCommand';
import { PluginsCommand } from '@/core/command/builtins/PluginsCommand';
import { ReloadCommand } from '@/core/command/builtins/ReloadCommand';
import { RestartCommand } from '@/core/command/builtins/RestartCommand';
import { StatusCommand } from '@/core/command/builtins/StatusCommand';
import { UpdateCommand } from '@/core/command/builtins/UpdateCommand';
import { EventManager } from '@/core/event/EventManager';
import { PermissionManager, Role } from '@/core/permission/PermissionManager';
import { PluginManager } from '@/core/plugin/PluginManager';
import { MessageQueue } from '@/core/queue/MessageQueue';
import { SchedulerManager } from '@/core/scheduler/SchedulerManager';
import {
	ServiceRegistry,
	type ServiceRegistrationOptions,
	type ServiceUnregisterOptions,
} from '@/core/ServiceRegistry';
import { SessionManager } from '@/core/session/SessionManager';
import { readJsonFileAsync, writeJsonFileAsync } from '@/utils/file';
import { I18nManager } from '@/i18n/I18nManager';
import logger, { type Logger } from '@/shared/logger';
import type { PluginRuntime } from '@/core/plugin/PluginRuntime';

export interface AppConfig {
	readonly PREFIX: string;
	readonly ADMIN_IDS: string[];
	readonly version: string;
	readonly LANGUAGE: string;
	readonly REPLY_UNKNOWN_COMMAND: boolean;
}

export class AldenBot implements PluginRuntime {
	public readonly eventManager: EventManager;
	public readonly commandManager: CommandManager;
	public readonly pluginManager: PluginManager;
	public readonly permissionManager: PermissionManager;
	public readonly sessionManager: SessionManager;
	public readonly schedulerManager: SchedulerManager;
	public readonly serviceRegistry: ServiceRegistry;
	public readonly i18n: I18nManager;
	public readonly messageQueue: MessageQueue;
	public readonly logger: Logger;
	public config: AppConfig = {
		PREFIX,
		ADMIN_IDS,
		version: 'unknown',
		LANGUAGE: DEFAULT_LANGUAGE,
		REPLY_UNKNOWN_COMMAND,
	};

	private readonly userLanguages = new Map<string, string>();

	public constructor(public readonly api: API) {
		this.logger = logger;

		this.eventManager = new EventManager();
		this.permissionManager = new PermissionManager(PATH.PERMISSIONS_PATH, ADMIN_IDS, this.api);
		this.sessionManager = new SessionManager(this);
		this.schedulerManager = new SchedulerManager();
		this.serviceRegistry = new ServiceRegistry(this.logger);
		this.i18n = new I18nManager(PATH.LOCALES_DIR, DEFAULT_LANGUAGE);
		this.commandManager = new CommandManager(this);
		this.pluginManager = new PluginManager(this);
		this.messageQueue = new MessageQueue(this.api, MESSAGE_QUEUE_DELAY);
	}

	public registerService<T>(
		name: string,
		service: T,
		options?: ServiceRegistrationOptions,
	): boolean {
		return this.serviceRegistry.register(name, service, options);
	}

	public getService<T>(name: string): T | undefined {
		return this.serviceRegistry.get<T>(name);
	}

	public unregisterService(name: string, options?: ServiceUnregisterOptions): boolean {
		return this.serviceRegistry.unregister(name, options);
	}

	public async initialize(version: string): Promise<void> {
		this.config = {
			PREFIX,
			ADMIN_IDS,
			version,
			LANGUAGE: DEFAULT_LANGUAGE,
			REPLY_UNKNOWN_COMMAND,
		};

		await this.i18n.loadLocales();
		await this.permissionManager.load();
		await this.loadUserLanguages();

		this.schedulerManager.start();
		this.registerDefaultCommands();
		this.registerCorePermissions();
	}

	public getUserLanguage(userId: string): string {
		return this.userLanguages.get(userId) ?? DEFAULT_LANGUAGE;
	}

	public async setUserLanguage(userId: string, lang: string): Promise<void> {
		this.userLanguages.set(userId, lang);
		await writeJsonFileAsync(PATH.USER_LANGUAGES_PATH, Object.fromEntries(this.userLanguages));
	}

	public getAvailableLanguages(): string[] {
		return this.i18n.getLoadedLocales();
	}

	public sendMessage(
		content: string | MessageContent,
		threadId: string,
		type: ThreadType,
	): Promise<void> {
		return this.messageQueue.send(content, threadId, type);
	}

	private async loadUserLanguages(): Promise<void> {
		const data = await readJsonFileAsync<Record<string, string>>(PATH.USER_LANGUAGES_PATH);
		if (!data) return;

		for (const [userId, lang] of Object.entries(data)) {
			this.userLanguages.set(userId, lang);
		}
	}

	private registerCorePermissions(): void {
		this.permissionManager.registerPermission('alden.command.plugins', Role.BotAdmin);
		this.permissionManager.registerPermission('alden.command.restart', Role.BotAdmin);
		this.permissionManager.registerPermission('alden.command.update', Role.BotAdmin);

		if (ENABLE_RELOAD_COMMAND) {
			this.permissionManager.registerPermission('alden.command.reload', Role.BotAdmin);
		}
		if (ENABLE_EVAL_COMMAND) {
			this.permissionManager.registerPermission('alden.command.eval', Role.BotAdmin);
		}

		this.permissionManager.registerPermission('alden.command.help', Role.Member);
		this.permissionManager.registerPermission('alden.command.ping', Role.Member);
		this.permissionManager.registerPermission('alden.command.status', Role.Member);
		this.permissionManager.registerPermission('alden.command.cancel', Role.Member);
		this.permissionManager.registerPermission('alden.command.language', Role.Member);
		this.permissionManager.registerPermission('alden.command.permission', Role.Leader);
	}

	private registerDefaultCommands(): void {
		this.commandManager.register(new HelpCommand());
		this.commandManager.register(new PluginsCommand());
		this.commandManager.register(new PingCommand());
		this.commandManager.register(new PermissionCommand());
		this.commandManager.register(new RestartCommand());
		this.commandManager.register(new StatusCommand());
		this.commandManager.register(new UpdateCommand());
		this.commandManager.register(new CancelCommand());
		this.commandManager.register(new LanguageCommand());

		if (ENABLE_RELOAD_COMMAND) {
			this.commandManager.register(new ReloadCommand());
		}
		if (ENABLE_EVAL_COMMAND) {
			this.commandManager.register(new EvalCommand());
		}
	}
}
