import { Event } from './Event';
import type { Reaction } from 'zca-js';

export class ReactionEvent extends Event {
	public static readonly eventType = 'alden-bot:reaction';

	constructor(public readonly reaction: Reaction) {
		super();
	}
}
