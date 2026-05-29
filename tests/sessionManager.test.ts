import type { Message } from 'zca-js';
import { describe, expect, it, vi } from 'vitest';

import type { AldenBot } from '@/core/AldenBot';
import { Event } from '@/core/event/Event';
import { EventManager } from '@/core/event/EventManager';
import { LiveLocationEvent } from '@/core/event/LiveLocationEvent';
import { LocationEvent } from '@/core/event/LocationEvent';
import { MessageEvent } from '@/core/event/MessageEvent';
import { SessionManager } from '@/core/session/SessionManager';

function createMessage(overrides: Partial<Message> = {}): Message {
	return {
		threadId: 'thread-1',
		type: 1,
		data: {
			uidFrom: 'user-1',
			dName: 'User',
			content: '',
		},
		...overrides,
	} as unknown as Message;
}

class RawEvent extends Event {}

function createSessionManager(): {
	eventManager: EventManager;
	sessionManager: SessionManager;
} {
	const eventManager = new EventManager();
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);

	const bot = {
		eventManager,
		logger,
		config: {
			PREFIX: '/',
		},
	} as unknown as AldenBot;

	return {
		eventManager,
		sessionManager: new SessionManager(bot),
	};
}

describe('SessionManager', () => {
	it('routes live location events to multi-event sessions', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();

		const pending = sessionManager.waitForAny<LocationEvent | LiveLocationEvent>(
			[LocationEvent, LiveLocationEvent],
			message.threadId,
			message.data.uidFrom,
			1000,
		);

		const event = new LiveLocationEvent(message, {
			latitude: 10.1,
			longitude: 106.2,
		});
		await eventManager.call(event);

		await expect(pending).resolves.toBe(event);
	});

	it('keeps single-event sessions scoped to the requested event class', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();

		const pending = sessionManager.waitFor(
			LocationEvent,
			message.threadId,
			message.data.uidFrom,
			1000,
		);

		await eventManager.call(
			new LiveLocationEvent(message, {
				latitude: 10.1,
				longitude: 106.2,
			}),
		);

		const location = new LocationEvent(message, {
			latitude: 10.1,
			longitude: 106.2,
			placeId: 'place-1',
			title: 'Home',
			description: 'District 1',
		});
		await eventManager.call(location);

		await expect(pending).resolves.toBe(location);
	});

	it('routes all message-backed events to waitForAll sessions', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();
		const seen: string[] = [];

		const pending = sessionManager.waitForAll(
			message.threadId,
			message.data.uidFrom,
			1000,
			(event) => {
				seen.push(event.constructor.name);
				return event instanceof LocationEvent;
			},
		);

		await eventManager.call(new RawEvent());
		await eventManager.call(new MessageEvent(createMessage({ threadId: 'thread-2' })));
		await eventManager.call(new MessageEvent(message));

		const location = new LocationEvent(message, {
			latitude: 10.1,
			longitude: 106.2,
			placeId: 'place-1',
			title: 'Home',
			description: 'District 1',
		});
		await eventManager.call(location);

		await expect(pending).resolves.toBe(location);
		expect(seen).toEqual(['MessageEvent', 'LocationEvent']);
	});

	it('ignores command prefix messages during waitForAll sessions', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();
		const seen: string[] = [];

		const pending = sessionManager.waitForAll(
			message.threadId,
			message.data.uidFrom,
			1000,
			(event) => {
				seen.push(event.constructor.name);
				return event instanceof MessageEvent;
			},
		);

		// Send a command message starting with PREFIX ('/')
		const cmdMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: '/cancel',
			} as unknown as Message['data'],
		});
		await eventManager.call(new MessageEvent(cmdMessage));

		// Send a normal message
		const normalMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: 'hello',
			} as unknown as Message['data'],
		});
		await eventManager.call(new MessageEvent(normalMessage));

		await expect(pending).resolves.toBeInstanceOf(MessageEvent);
		expect(seen).toEqual(['MessageEvent']);
		// Verify that the command message was ignored and did not populate seen
		const resolvedEvent = await pending;
		expect(resolvedEvent.message.data.content).toBe('hello');
	});

	it('ignores command prefix messages during waitFor sessions', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();

		const pending = sessionManager.waitFor(
			LocationEvent,
			message.threadId,
			message.data.uidFrom,
			1000,
		);

		// Send a LocationEvent with a command prefix content (e.g., '/cancel')
		const cmdMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: '/cancel',
			} as unknown as Message['data'],
		});
		const cmdEvent = new LocationEvent(cmdMessage, {
			latitude: 10.1,
			longitude: 106.2,
			placeId: 'place-1',
			title: 'Home',
			description: 'District 1',
		});
		await eventManager.call(cmdEvent);

		// Send a normal LocationEvent
		const normalMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: 'hello',
			} as unknown as Message['data'],
		});
		const normalEvent = new LocationEvent(normalMessage, {
			latitude: 10.1,
			longitude: 106.2,
			placeId: 'place-1',
			title: 'Home',
			description: 'District 1',
		});
		await eventManager.call(normalEvent);

		await expect(pending).resolves.toBe(normalEvent);
	});

	it('ignores command prefix messages during waitForAny sessions', async () => {
		const { eventManager, sessionManager } = createSessionManager();
		const message = createMessage();

		const pending = sessionManager.waitForAny<LocationEvent | LiveLocationEvent>(
			[LocationEvent, LiveLocationEvent],
			message.threadId,
			message.data.uidFrom,
			1000,
		);

		// Send a LocationEvent with a command prefix content (e.g., '/cancel')
		const cmdMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: '/cancel',
			} as unknown as Message['data'],
		});
		const cmdEvent = new LocationEvent(cmdMessage, {
			latitude: 10.1,
			longitude: 106.2,
			placeId: 'place-1',
			title: 'Home',
			description: 'District 1',
		});
		await eventManager.call(cmdEvent);

		// Send a normal LiveLocationEvent
		const normalMessage = createMessage({
			data: {
				uidFrom: 'user-1',
				dName: 'User',
				content: 'hello',
			} as unknown as Message['data'],
		});
		const normalEvent = new LiveLocationEvent(normalMessage, {
			latitude: 10.1,
			longitude: 106.2,
		});
		await eventManager.call(normalEvent);

		await expect(pending).resolves.toBe(normalEvent);
	});
});
