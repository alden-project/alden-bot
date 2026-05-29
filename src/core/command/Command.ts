import { ThreadType, type Message, type MessageContent } from 'zca-js';

import type { EventConstructor } from '@/core/event/EventManager';
import type { I18nManager } from '@/i18n/I18nManager';
import type { Logger } from '@/shared/logger';
import { Role } from '@/core/permission/PermissionManager';
import type { PluginRuntime } from '@/core/plugin/PluginRuntime';
import type { SessionError, SessionEvent, SessionValidator } from '@/core/session/SessionManager';
import { parseCommandArgs, extractUid, hasMention, type ParsedCommandArgs } from '@/utils/message';

export class CommandContext {
	public constructor(
		private readonly bot: PluginRuntime,
		public readonly message: Message,
		public readonly args: string[],
		public readonly lang: string,
		public readonly command?: CommandBase,
	) {}

	/**
	 * Parse command arguments position-safely by stripping out all mention tags.
	 * Returns target UIDs in order and clean non-mention arguments.
	 */
	public parseArgs(argOffset = 0): ParsedCommandArgs {
		return parseCommandArgs(this.message, this.args.slice(argOffset));
	}

	/**
	 * Send a message back to the current thread (automatically queued).
	 */
	public reply(content: string | MessageContent): Promise<void> {
		return this.bot.sendMessage(content, this.message.threadId, this.message.type);
	}

	/**
	 * Current command prefix.
	 */
	public get prefix(): string {
		return this.bot.config.PREFIX;
	}

	/**
	 * Check if a message is another command for the same bot prefix.
	 */
	public isCommandMessage(message: { data: { content?: unknown } } = this.message): boolean {
		const content = message.data.content;
		return typeof content === 'string' && content.trimStart().startsWith(this.prefix);
	}

	/**
	 * Extract target user ID from the context (either from mentions or falling back to arguments).
	 */
	public getTargetUid(argIndex = 0): string | undefined {
		return extractUid(this.message, this.args.slice(argIndex));
	}

	/**
	 * Check if the message has any mentions.
	 */
	public hasMention(): boolean {
		return hasMention(this.message);
	}

	/**
	 * Translate a key based on the context's current language.
	 * Automatically resolves plugin-specific translation if available on the command.
	 */
	public translate(key: string, variables?: Record<string, string | number>): string {
		if (this.command && this.command.i18n?.has(key, this.lang)) {
			return this.command.i18n.get(key, variables, this.lang);
		}
		return this.bot.i18n.get(key, variables, this.lang);
	}

	/**
	 * Shorthand translation alias.
	 */
	public t(key: string, variables?: Record<string, string | number>): string {
		return this.translate(key, variables);
	}

	/**
	 * Check if the sender has a specific permission.
	 */
	public hasPermission(permission: string): Promise<boolean> {
		return this.bot.permissionManager.hasPermission(
			this.message.threadId,
			this.message.data.uidFrom,
			this.message.type === ThreadType.Group,
			permission,
		);
	}

	/**
	 * Get the sender's role level.
	 */
	public getSenderRole(): Promise<Role> {
		return this.bot.permissionManager.getRoleLevel(
			this.message.threadId,
			this.message.data.uidFrom,
			this.message.type === ThreadType.Group,
		);
	}

	/**
	 * Check if the sender is a BotAdmin.
	 */
	public isBotAdmin(): boolean {
		return this.bot.permissionManager
			.getUserPermissions(this.message.data.uidFrom)
			.includes('*');
	}

	/**
	 * Retrieve a service registered in the bot's service registry.
	 */
	public getService<T>(name: string): T | undefined {
		return this.bot.getService<T>(name);
	}

	public waitFor<T extends SessionEvent>(
		eventClass: EventConstructor<T>,
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T> {
		return this.bot.sessionManager.waitFor(
			eventClass,
			this.message.threadId,
			this.message.data.uidFrom,
			timeoutMs,
			validator,
			onCancel,
		);
	}

	public waitForAny<T extends SessionEvent>(
		eventClasses: Array<EventConstructor<T>>,
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T> {
		return this.bot.sessionManager.waitForAny(
			eventClasses,
			this.message.threadId,
			this.message.data.uidFrom,
			timeoutMs,
			validator,
			onCancel,
		);
	}

	public waitForAll<T extends SessionEvent = SessionEvent>(
		timeoutMs: number,
		validator?: SessionValidator<T>,
		onCancel?: (reason: SessionError) => void,
	): Promise<T> {
		return this.bot.sessionManager.waitForAll(
			this.message.threadId,
			this.message.data.uidFrom,
			timeoutMs,
			validator,
			onCancel,
		);
	}

	public cancelSession(): void {
		this.bot.sessionManager.cancelSession(this.message.threadId, this.message.data.uidFrom);
	}

	public cancelSessionByUser(): boolean {
		return this.bot.sessionManager.cancelSessionByUser(
			this.message.threadId,
			this.message.data.uidFrom,
		);
	}
}

export interface CommandOptions {
	name: string;
	description: string;
	aliases?: string[];
	cooldown?: number;
	usage?: string;
	permission?: string;
	permissionMessage?: string;
}

export type CommandExecutionResult = void | false;

export abstract class CommandBase {
	public readonly name: string;
	public readonly description: string;
	public readonly aliases: string[];
	public readonly cooldown: number;
	public readonly usage: string;

	private readonly permission?: string;
	private readonly permissionMessage?: string;

	protected logger!: Logger;
	protected bot!: PluginRuntime;

	private _i18n?: I18nManager;

	public get i18n(): I18nManager | undefined {
		return this._i18n;
	}

	public set i18n(value: I18nManager | undefined) {
		this._i18n = value;
	}

	constructor(options: CommandOptions) {
		this.name = options.name;
		this.description = options.description;
		this.aliases = options.aliases ?? [];
		this.cooldown = options.cooldown ?? 0;
		this.usage = options.usage ?? '';
		this.permission = options.permission;
		this.permissionMessage = options.permissionMessage;
	}

	public getPermission(): string | undefined {
		return this.permission;
	}

	public getPermissionMessage(): string | undefined {
		return this.permissionMessage;
	}

	protected t(
		key: string,
		variables: Record<string, string | number> = {},
		locale?: string,
	): string {
		if (this.i18n?.has(key, locale)) {
			return this.i18n.get(key, variables, locale);
		}
		return this.bot.i18n.get(key, variables, locale);
	}

	public resolveDescription(lang?: string): string {
		return this.t(this.description, {}, lang);
	}

	public resolveUsage(lang?: string): string {
		if (!this.usage) return '';
		return this.t(this.usage, {}, lang);
	}

	public init(bot: PluginRuntime): void {
		this.bot = bot;
		this.logger = this.bot.logger.child(`/${this.name}`);
	}

	/**
	 * Retrieve a service registered in the bot's service registry.
	 */
	protected getService<T>(name: string): T | undefined {
		return this.bot.getService<T>(name);
	}

	public abstract execute(
		ctx: CommandContext,
	): CommandExecutionResult | Promise<CommandExecutionResult>;
}
