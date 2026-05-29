import type { Message } from 'zca-js';
import { describe, expect, it, vi } from 'vitest';

import type { AldenBot } from '@/core/AldenBot';
import { CommandContext } from '@/core/command/Command';

function createContext(args: string[], hasMention = true): CommandContext {
	const message = {
		threadId: 'thread-1',
		type: 1,
		data: {
			uidFrom: 'user-1',
			content: '/eco give @Finn 007 100',
			...(hasMention ? { mentions: [{ uid: 'target-1', pos: 10, len: 9 }] } : {}),
		},
	} as unknown as Message;

	return new CommandContext({} as AldenBot, message, args, 'vi');
}

function createContextWithBot(
	bot: Partial<AldenBot>,
	args: string[] = [],
	messageOverrides: Partial<Message> = {},
): CommandContext {
	const message = createMessage(messageOverrides);
	return new CommandContext(bot as AldenBot, message, args, 'vi');
}

function createMessage(overrides: Partial<Message> = {}): Message {
	return {
		threadId: 'thread-1',
		type: 1,
		data: {
			uidFrom: 'user-1',
			content: '/weather',
		},
		...overrides,
	} as unknown as Message;
}

describe('CommandContext', () => {
	it('parses arguments after a subcommand offset', () => {
		const ctx = createContext(['give', '@Finn', '007', '100']);

		expect(ctx.parseArgs(1)).toEqual({
			targetUids: ['target-1'],
			cleanArgs: ['100'],
		});
	});

	it('resolves fallback target UIDs from an argument offset', () => {
		const ctx = createContext(['deputy', 'add', 'target-1'], false);

		expect(ctx.getTargetUid(2)).toBe('target-1');
	});

	it('exposes prefix and command message helpers', () => {
		const ctx = createContextWithBot({
			config: {
				PREFIX: '/',
			},
		} as unknown as Partial<AldenBot>);

		expect(ctx.prefix).toBe('/');
		expect(ctx.isCommandMessage()).toBe(true);
	});

	it('scopes waitForAll to the current message sender and thread', async () => {
		const waitForAll = vi.fn();
		const ctx = createContextWithBot({
			sessionManager: {
				waitForAll,
			},
		} as unknown as Partial<AldenBot>);
		const validator = vi.fn();

		ctx.waitForAll(1000, validator);

		expect(waitForAll).toHaveBeenCalledWith('thread-1', 'user-1', 1000, validator, undefined);
	});
});
