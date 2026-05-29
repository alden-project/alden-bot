import type { Message } from 'zca-js';

import type { PollVoteData } from '@/parser/contentParser';

import { Event } from './Event';

export class PollVoteEvent extends Event {
	public static readonly eventType = 'alden-bot:poll-vote';

	constructor(
		public readonly message: Message,
		public readonly poll: PollVoteData,
	) {
		super();
	}
}
