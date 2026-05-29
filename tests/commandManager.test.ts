import type { Message } from 'zca-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AldenBot } from '@/core/AldenBot';
import {
	CommandBase,
	type CommandContext,
	type CommandExecutionResult,
} from '@/core/command/Command';
import { CommandManager } from '@/core/command/CommandManager';

type ExecuteImpl = (
	ctx: CommandContext,
) => CommandExecutionResult | Promise<CommandExecutionResult>;

class TestCommand extends CommandBase {
	private readonly impl: ExecuteImpl;

	public constructor(
		name: string,
		aliases: string[] = [],
		options: { cooldown?: number; execute?: ExecuteImpl } = {},
	) {
		super({
			name,
			description: `${name}.description`,
			aliases,
			cooldown: options.cooldown,
		});
		this.impl = options.execute ?? (() => undefined);
	}

	public execute(ctx: CommandContext): CommandExecutionResult | Promise<CommandExecutionResult> {
		return this.impl(ctx);
	}
}

const managers: CommandManager[] = [];

function createBotStub(): AldenBot {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);

	return {
		logger,
		eventManager: {
			on: vi.fn(() => vi.fn()),
		},
		config: {
			PREFIX: '/',
			REPLY_UNKNOWN_COMMAND: false,
		},
		i18n: {
			get: vi.fn((key: string) => key),
		},
		permissionManager: {
			getRoleLevel: vi.fn(async () => 0),
			hasPermission: vi.fn(async () => true),
		},
		getUserLanguage: vi.fn(() => 'vi'),
		sendMessage: vi.fn(),
	} as unknown as AldenBot;
}

describe('CommandManager', () => {
	afterEach(() => {
		for (const manager of managers.splice(0)) {
			manager.stopCooldownCleanup();
		}
	});

	function createManager(bot = createBotStub()): CommandManager {
		const manager = new CommandManager(bot);
		managers.push(manager);
		return manager;
	}

	function createMessage(): Message {
		return {
			threadId: 'thread-1',
			type: 1,
			data: {
				uidFrom: 'user-1',
				content: '/cooldown',
			},
		} as unknown as Message;
	}

	it('rejects duplicate command names and keeps the first registration', () => {
		const manager = createManager();

		expect(manager.register(new TestCommand('ping'))).toBe(true);
		expect(manager.register(new TestCommand('ping'))).toBe(false);

		expect(manager.getAll().map((command) => command.name)).toEqual(['ping']);
	});

	it('rejects alias collisions and keeps the existing command', () => {
		const manager = createManager();

		expect(manager.register(new TestCommand('first', ['same']))).toBe(true);
		expect(manager.register(new TestCommand('second', ['same']))).toBe(false);

		expect(manager.getAll().map((command) => command.name)).toEqual(['first']);
	});

	it('rejects uppercase primary command names', () => {
		const manager = createManager();

		expect(manager.register(new TestCommand('Ping'))).toBe(false);
		expect(manager.getAll()).toEqual([]);
	});

	it('allows punctuation aliases', () => {
		const manager = createManager();

		expect(manager.register(new TestCommand('help', ['?']))).toBe(true);
		expect(manager.getAll().map((command) => command.name)).toEqual(['help']);
	});

	it('rejects whitespace aliases', () => {
		const manager = createManager();

		expect(manager.register(new TestCommand('ping', ['two words']))).toBe(false);
		expect(manager.getAll()).toEqual([]);
	});

	it('does not commit cooldown when execute returns false', async () => {
		const execute = vi.fn(() => false as const);
		const manager = createManager();
		manager.register(new TestCommand('cooldown', [], { cooldown: 30, execute }));

		await expect(manager.dispatch(createMessage(), 'cooldown', [])).resolves.toBe(true);
		await expect(manager.dispatch(createMessage(), 'cooldown', [])).resolves.toBe(true);

		expect(execute).toHaveBeenCalledTimes(2);
	});

	it('commits cooldown when execute completes', async () => {
		const bot = createBotStub();
		const execute = vi.fn(() => undefined);
		const manager = createManager(bot);
		manager.register(new TestCommand('cooldown', [], { cooldown: 30, execute }));

		await manager.dispatch(createMessage(), 'cooldown', []);
		await manager.dispatch(createMessage(), 'cooldown', []);

		expect(execute).toHaveBeenCalledTimes(1);
		expect(bot.sendMessage).toHaveBeenCalledWith({ msg: 'core.cooldown.wait' }, 'thread-1', 1);
	});

	it('does not commit cooldown when execute throws', async () => {
		const execute = vi
			.fn<ExecuteImpl>()
			.mockImplementationOnce(() => {
				throw new Error('boom');
			})
			.mockImplementationOnce(() => undefined);
		const manager = createManager();
		manager.register(new TestCommand('cooldown', [], { cooldown: 30, execute }));

		await expect(manager.dispatch(createMessage(), 'cooldown', [])).resolves.toBe(true);
		await expect(manager.dispatch(createMessage(), 'cooldown', [])).resolves.toBe(true);

		expect(execute).toHaveBeenCalledTimes(2);
	});
});
