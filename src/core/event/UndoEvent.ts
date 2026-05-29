import { Event } from './Event';
import type { Undo } from 'zca-js';

export class UndoEvent extends Event {
	public static readonly eventType = 'alden-bot:undo';

	constructor(public readonly undo: Undo) {
		super();
	}
}
