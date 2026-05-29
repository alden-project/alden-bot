import type { Message } from 'zca-js';

import type { PollCreateData } from '@/parser/contentParser';

import { Event } from './Event';

export class PollCreateEvent extends Event {
	public static readonly eventType = 'alden-bot:poll-create';

	constructor(
		public readonly message: Message,
		public readonly poll: PollCreateData,
	) {
		super();
	}
}
