import { Event } from './Event';
import type { GroupEvent as ZcaGroupEvent } from 'zca-js';

export class GroupEvent extends Event {
	public static readonly eventType = 'alden-bot:group';

	constructor(public readonly groupEvent: ZcaGroupEvent) {
		super();
	}
}
