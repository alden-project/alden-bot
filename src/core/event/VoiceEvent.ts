import type { Message } from 'zca-js';

import type { VoiceData } from '@/parser/contentParser';

import { Event } from './Event';

export class VoiceEvent extends Event {
	public static readonly eventType = 'alden-bot:voice';

	constructor(
		public readonly message: Message,
		public readonly voice: VoiceData,
	) {
		super();
	}
}
