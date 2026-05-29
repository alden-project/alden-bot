import type { API, MessageContent, ThreadType } from 'zca-js';
import logger from '@/shared/logger';

interface MessageTask {
	content: string | MessageContent;
	threadId: string;
	type: ThreadType;
	resolve: () => void;
	reject: (reason?: unknown) => void;
}

export class MessageQueue {
	private readonly MAX_QUEUE_SIZE = 1000;
	private readonly queue: MessageTask[] = [];
	private isProcessing = false;
	private readonly delayMs: number;

	public constructor(
		private readonly api: API,
		delayMs = 500,
	) {
		this.delayMs = delayMs;
	}

	public send(
		content: string | MessageContent,
		threadId: string,
		type: ThreadType,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.queue.length >= this.MAX_QUEUE_SIZE) {
				const dropped = this.queue.shift();
				if (dropped) {
					dropped.reject(new Error('MessageQueue: Queue full, message dropped'));
					logger.warn('MessageQueue: Queue full, dropped oldest message');
				}
			}
			this.queue.push({ content, threadId, type, resolve, reject });
			this.processQueue().catch((err) => {
				logger.error('MessageQueue: Unhandled error in processQueue', err);
			});
		});
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) return;
		this.isProcessing = true;

		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (!task) continue;

			try {
				await this.api.sendMessage(task.content, task.threadId, task.type);
				task.resolve();
			} catch (error) {
				task.reject(error);
			}

			if (this.queue.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, this.delayMs));
			}
		}

		this.isProcessing = false;
	}
}
