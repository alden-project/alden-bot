import type { Message } from 'zca-js';

import { Event } from './Event';

export class MessageEvent extends Event {
	public static readonly eventType = 'alden-bot:message';

	public constructor(public readonly message: Message) {
		super();
	}
}
