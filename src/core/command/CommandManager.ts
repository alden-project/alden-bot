import { ThreadType, type Message } from 'zca-js';

import { CommandContext, type CommandBase } from './Command';

import type { AldenBot } from '@/core/AldenBot';
import { Role } from '@/core/permission/PermissionManager';
import { MessageEvent } from '@/core/event/MessageEvent';
import { isAttachment } from '@/utils/guards';

export class CommandManager {
	private readonly commands = new Map<string, CommandBase>();
	private uniqueCommands: CommandBase[] = [];
	private readonly cooldowns = new Map<string, Map<string, number>>();
	private readonly cooldownTimers = new Map<string, Map<string, NodeJS.Timeout>>();

	public constructor(private readonly bot: AldenBot) {
		this.bot.eventManager.on(
			MessageEvent,
			async (event) => {
				if (event.isCancelled) return;

				const message = event.message;
				if (isAttachment(message.data.content)) return;

				const content = message.data.content;
				if (!content || typeof content !== 'string') return;

				const prefix = this.bot.config.PREFIX;
				if (!content.startsWith(prefix)) return;

				const withoutPrefix = content.slice(prefix.length).trim();
				if (!withoutPrefix) return;

				const [commandName = '', ...args] = withoutPrefix.split(/\s+/);

				const handled = await this.dispatch(message, commandName, args);

				if (!handled && this.bot.config.REPLY_UNKNOWN_COMMAND) {
					const lang = this.bot.getUserLanguage(message.data.uidFrom);
					await this.bot.sendMessage(
						this.bot.i18n.get('core.command.unknown', { prefix }, lang),
						message.threadId,
						message.type,
					);
				}
			},
			{ priority: 20 },
		);
	}

	public stopCooldownCleanup(): void {
		for (const timerMap of this.cooldownTimers.values()) {
			for (const timer of timerMap.values()) {
				clearTimeout(timer);
			}
		}
		this.cooldownTimers.clear();
		this.cooldowns.clear();
	}

	public register(command: CommandBase): boolean {
		if (command.name.length === 0 || !/^[^A-Z\s]+$/.test(command.name)) {
			this.bot.logger.error(
				`CommandManager: Command name "${command.name}" is invalid. Use a lowercase letters, non-empty name without whitespace.`,
			);
			return false;
		}
		const names = [command.name, ...command.aliases];
		const invalidAlias = command.aliases.find(
			(alias) => alias.length === 0 || !/^[^A-Z\s]+$/.test(alias),
		);
		if (invalidAlias) {
			this.bot.logger.error(
				`CommandManager: Alias "${invalidAlias}" for /${command.name} is invalid. Use a lowercase letters, non-empty name without whitespace.`,
			);
			return false;
		}

		const normalized = names.map((name) => name.toLowerCase());

		if (new Set(normalized).size !== normalized.length) {
			this.bot.logger.error(
				`CommandManager: Command "/${command.name}" has duplicate aliases.`,
			);
			return false;
		}

		for (const name of names) {
			const existing = this.commands.get(name.toLowerCase());
			if (existing) {
				this.bot.logger.error(
					`CommandManager: Command "/${name}" is already registered by /${existing.name}. Skipping /${command.name}.`,
				);
				return false;
			}
		}

		command.init(this.bot);
		for (const name of names) {
			this.commands.set(name.toLowerCase(), command);
		}
		this.uniqueCommands = [...new Set(this.commands.values())];

		this.bot.logger.debug(`CommandManager: Registered /${command.name}`);
		return true;
	}

	public getAll(): CommandBase[] {
		return this.uniqueCommands;
	}

	public unregister(commandOrName: CommandBase | string): void {
		const nameToLookup =
			typeof commandOrName === 'string'
				? commandOrName.toLowerCase()
				: commandOrName.name.toLowerCase();

		const command = this.commands.get(nameToLookup);
		if (!command) return;

		const names = [command.name, ...command.aliases];
		for (const name of names) {
			this.commands.delete(name.toLowerCase());
		}
		this.uniqueCommands = [...new Set(this.commands.values())];

		this.bot.logger.debug(`CommandManager: Unregistered /${command.name}`);
	}

	public async dispatch(message: Message, commandName: string, args: string[]): Promise<boolean> {
		const command = this.commands.get(commandName.toLowerCase());
		if (!command) return false;

		const senderId = message.data.uidFrom;
		const lang = this.bot.getUserLanguage(senderId);

		if (command.cooldown > 0) {
			const roleLevel = await this.bot.permissionManager.getRoleLevel(
				message.threadId,
				senderId,
				message.type === ThreadType.Group,
			);

			if (roleLevel !== Role.BotAdmin) {
				const now = Date.now();
				const userMap = this.cooldowns.get(senderId) ?? new Map<string, number>();
				const lastUsed = userMap.get(command.name) ?? 0;
				const remaining = lastUsed + command.cooldown * 1000 - now;

				if (remaining > 0) {
					const time = (remaining / 1000).toFixed(1);
					await this.bot.sendMessage(
						{
							msg: this.bot.i18n.get('core.cooldown.wait', { time }, lang),
						},
						message.threadId,
						message.type,
					);
					return true;
				}
			}
		}

		const permission = command.getPermission();
		if (permission) {
			const hasPerm = await this.bot.permissionManager.hasPermission(
				message.threadId,
				senderId,
				message.type === ThreadType.Group,
				permission,
			);
			if (!hasPerm) {
				const denyMsg =
					command.getPermissionMessage() ??
					this.bot.i18n.get('core.permission.denied', { permission }, lang);
				await this.bot.sendMessage({ msg: denyMsg }, message.threadId, message.type);
				return true;
			}
		}

		const ctx = new CommandContext(this.bot, message, args, lang, command);

		try {
			const result = await command.execute(ctx);
			if (result !== false && command.cooldown > 0) {
				this.commitCooldown(senderId, command);
			}
		} catch (error) {
			this.bot.logger.error(`CommandManager: Error executing /${command.name}`, error);
			await this.bot.sendMessage(
				{ msg: this.bot.i18n.get('core.command.error', { command: command.name }, lang) },
				message.threadId,
				message.type,
			);
		}

		return true;
	}

	private commitCooldown(senderId: string, command: CommandBase): void {
		const now = Date.now();
		const userMap = this.cooldowns.get(senderId) ?? new Map<string, number>();
		userMap.set(command.name, now);
		this.cooldowns.set(senderId, userMap);

		const timerMap = this.cooldownTimers.get(senderId) ?? new Map<string, NodeJS.Timeout>();
		if (timerMap.has(command.name)) {
			clearTimeout(timerMap.get(command.name));
		}
		const timer = setTimeout(() => {
			const uMap = this.cooldowns.get(senderId);
			if (uMap) {
				uMap.delete(command.name);
				if (uMap.size === 0) this.cooldowns.delete(senderId);
			}
			const tMap = this.cooldownTimers.get(senderId);
			if (tMap) {
				tMap.delete(command.name);
				if (tMap.size === 0) this.cooldownTimers.delete(senderId);
			}
		}, command.cooldown * 1000);
		timerMap.set(command.name, timer);
		this.cooldownTimers.set(senderId, timerMap);
	}
}
