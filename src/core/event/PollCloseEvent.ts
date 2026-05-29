import type { Message } from 'zca-js';

import type { PollCloseData } from '@/parser/contentParser';

import { Event } from './Event';

export class PollCloseEvent extends Event {
	public static readonly eventType = 'alden-bot:poll-close';

	constructor(
		public readonly message: Message,
		public readonly poll: PollCloseData,
	) {
		super();
	}
}
