import { describe, expect, it, vi } from 'vitest';

import { Event } from '@/core/event/Event';
import { EventManager } from '@/core/event/EventManager';

const FirstPluginEvent = class PluginEvent extends Event {
	public static readonly eventType = 'plugin:first-event';
};

const SecondPluginEvent = class PluginEvent extends Event {
	public static readonly eventType = 'plugin:second-event';
};

describe('EventManager', () => {
	it('uses explicit eventType keys instead of class names when provided', async () => {
		const manager = new EventManager();
		const firstHandler = vi.fn();
		const secondHandler = vi.fn();

		manager.on(FirstPluginEvent, firstHandler);
		manager.on(SecondPluginEvent, secondHandler);

		await manager.call(new FirstPluginEvent());

		expect(firstHandler).toHaveBeenCalledTimes(1);
		expect(secondHandler).not.toHaveBeenCalled();
	});
});
