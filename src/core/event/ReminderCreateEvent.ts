import type { Message } from 'zca-js';

import type { ReminderCreateData } from '@/parser/contentParser';

import { Event } from './Event';

export class ReminderCreateEvent extends Event {
	public static readonly eventType = 'alden-bot:reminder-create';

	constructor(
		public readonly message: Message,
		public readonly reminder: ReminderCreateData,
	) {
		super();
	}
}
