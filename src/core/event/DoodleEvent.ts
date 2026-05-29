import type { Message } from 'zca-js';

import type { DoodleData } from '@/parser/contentParser';

import { Event } from './Event';

export class DoodleEvent extends Event {
	public static readonly eventType = 'alden-bot:doodle';

	constructor(
		public readonly message: Message,
		public readonly doodle: DoodleData,
	) {
		super();
	}
}
