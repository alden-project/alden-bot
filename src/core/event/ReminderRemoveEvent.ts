import type { Message } from 'zca-js';

import type { ReminderRemoveData } from '@/parser/contentParser';

import { Event } from './Event';

export class ReminderRemoveEvent extends Event {
	public static readonly eventType = 'alden-bot:reminder-remove';

	constructor(
		public readonly message: Message,
		public readonly reminder: ReminderRemoveData,
	) {
		super();
	}
}
