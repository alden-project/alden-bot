import type { API, MessageContent, ThreadType } from 'zca-js';

import type { CommandBase } from '@/core/command/Command';
import type {
	EventConstructor,
	EventHandler,
	EventListenerOptions,
} from '@/core/event/EventManager';
import type { Event } from '@/core/event/Event';
import type { Role } from '@/core/permission/PermissionManager';
import type { PluginBase } from '@/core/plugin/PluginBase';
import type { SessionError, SessionEvent, SessionValidator } from '@/core/session/SessionManager';
import type { ServiceRegistrationOptions, ServiceUnregisterOptions } from '@/core/ServiceRegistry';
import type { I18nManager } from '@/i18n/I18nManager';
import type { Logger } from '@/shared/logger';

export interface RuntimeConfig {
	readonly PREFIX: string;
	readonly ADMIN_IDS: readonly string[];
	readonly version: string;
	readonly LANGUAGE: string;
	readonly REPLY_UNKNOWN_COMMAND: boolean;
}

export interface CommandRegistryApi {
	getAll(): CommandBase[];
}

export interface EventBusApi {
	on<T extends Event>(
		eventClass: EventConstructor<T>,
		handler: EventHandler<T>,
		options?: EventListenerOptions | number,
	): () => void;
	onAll<T extends Event>(
		handler: EventHandler<T>,
		options?: EventListenerOptions | number,
	): () => void;
	call<T extends Event>(event: T): Promise<T>;
}

export interface SessionApi {
	waitFor<T extends SessionEvent>(
		eventClass: EventConstructor<T>,
		threadId: string,
		userId: string,
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T>;
	waitForAny<T extends SessionEvent>(
		eventClasses: Array<EventConstructor<T>>,
		threadId: string,
		userId: string,
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T>;
	waitForAll<T extends SessionEvent = SessionEvent>(
		threadId: string,
		userId: string,
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T>;
	cancelSession(threadId: string, userId: string): void;
	cancelSessionByUser(threadId: string, userId: string): boolean;
}

export interface PluginManagerApi {
	loadAll(pluginsDir: string): Promise<void>;
	enableAll(): Promise<void>;
	unloadAll(): Promise<void>;
	unloadPlugin(name: string): Promise<boolean>;
	getPlugin(name: string): PluginBase | undefined;
	getPlugins(): ReadonlyMap<string, PluginBase>;
	isPluginEnabled(name: string): boolean;
}

export interface PermissionApi {
	hasPermission(
		threadId: string,
		userId: string,
		isGroup: boolean,
		permission: string,
	): Promise<boolean>;
	getRoleLevel(threadId: string, userId: string, isGroup: boolean): Promise<Role>;
	grant(userId: string, permission: string): Promise<boolean>;
	revoke(userId: string, permission: string): Promise<boolean>;
	getUserPermissions(userId: string): string[];
	addVirtualDeputy(threadId: string, userId: string): Promise<boolean>;
	removeVirtualDeputy(threadId: string, userId: string): Promise<boolean>;
	isVirtualDeputy(threadId: string, userId: string): boolean;
	getAllPermissions(): string[];
	getPermissionRole(permission: string): Role;
}

export interface PluginRuntime {
	readonly api: API;
	readonly config: RuntimeConfig;
	readonly logger: Logger;
	readonly i18n: I18nManager;
	readonly commandManager: CommandRegistryApi;
	readonly eventManager: EventBusApi;
	readonly sessionManager: SessionApi;
	readonly pluginManager: PluginManagerApi;
	readonly permissionManager: PermissionApi;
	sendMessage(
		content: string | MessageContent,
		threadId: string,
		type: ThreadType,
	): Promise<void>;
	getUserLanguage(userId: string): string;
	setUserLanguage(userId: string, lang: string): Promise<void>;
	getAvailableLanguages(): string[];
	registerService<T>(name: string, service: T, options?: ServiceRegistrationOptions): boolean;
	getService<T>(name: string): T | undefined;
	unregisterService(name: string, options?: ServiceUnregisterOptions): boolean;
}
