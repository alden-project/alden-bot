import { ThreadType, type Message } from 'zca-js';

import type { AldenBot } from './AldenBot';
import { GroupEvent } from './event/GroupEvent';
import { ReactionEvent } from './event/ReactionEvent';
import { UndoEvent } from './event/UndoEvent';
import { createMessageEvent } from './event/MessageEventFactory';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;

export class BotListener {
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly bot: AldenBot) {}

	public start(): void {
		this.clearReconnectTimer();
		this.bot.logger.info('Registering event listeners...');

		this.bot.api.listener.on('message', (message) => {
			this.onMessage(message).catch((error) => {
				this.bot.logger.error('Unhandled error in message handler', error);
			});
		});

		this.bot.api.listener.on('reaction', (reaction) => {
			this.bot.eventManager.call(new ReactionEvent(reaction)).catch((error) => {
				this.bot.logger.error('Unhandled error in reaction handler', error);
			});
		});

		this.bot.api.listener.on('undo', (undo) => {
			this.bot.eventManager.call(new UndoEvent(undo)).catch((error) => {
				this.bot.logger.error('Unhandled error in undo handler', error);
			});
		});

		this.bot.api.listener.on('group_event', (groupEvent) => {
			this.bot.eventManager.call(new GroupEvent(groupEvent)).catch((error) => {
				this.bot.logger.error('Unhandled error in group_event handler', error);
			});
		});

		this.registerConnectionHandlers();
		this.bot.api.listener.start();
	}

	private registerConnectionHandlers(): void {
		this.bot.api.listener.on('error', (error) => {
			this.bot.logger.error('Listener error occurred', error);
		});

		this.bot.api.listener.on('connected', () => {
			this.reconnectAttempts = 0;
			this.bot.logger.info('Bot listener connected to Zalo successfully!');
		});

		this.bot.api.listener.on('closed', (code, reason) => {
			this.bot.logger.warn(`Bot listener closed. Code: ${code}, Reason: ${reason}`);
		});

		this.bot.api.listener.on('disconnected', (code, reason) => {
			this.bot.logger.warn(`Bot listener disconnected. Code: ${code}, Reason: ${reason}`);
			this.scheduleReconnect();
		});
	}

	private scheduleReconnect(): void {
		this.reconnectAttempts++;

		if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
			this.bot.logger.error(
				`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Shutting down.`,
			);
			process.emit('SIGTERM');
			setTimeout(() => process.exit(1), 10_000);
			return;
		}

		const delay = Math.min(
			BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
			MAX_DELAY_MS,
		);

		this.bot.logger.warn(
			`Reconnecting in ${(delay / 1000).toFixed(0)}s ` +
				`(attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
		);

		this.clearReconnectTimer();
		this.reconnectTimer = setTimeout(() => this.bot.api.listener.start(), delay);
	}

	private clearReconnectTimer(): void {
		if (!this.reconnectTimer) return;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private async onMessage(message: Message): Promise<void> {
		if (message.isSelf === true) return;

		this.bot.logger.info(
			`Message from ${message.data.dName} (${message.data.uidFrom}) ${
				message.type === ThreadType.Group ? `@ ${message.threadId}` : ''
			}:`,
			typeof message.data.content === 'string' ? message.data.content : '',
		);

		const event = createMessageEvent(message);
		const result = await this.bot.eventManager.call(event);
		if (result.isCancelled) {
			this.bot.logger.debug(`Message from ${message.data.uidFrom} was cancelled or handled.`);
		}
	}
}
