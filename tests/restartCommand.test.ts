import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Message } from 'zca-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AldenBot } from '@/core/AldenBot';
import { CommandContext } from '@/core/command/Command';
import { RestartCommand } from '@/core/command/builtins/RestartCommand';
import { AWAKE_CODE, AWAKE_EXIT_CODE } from '@/core/update/RestartProtocol';

let tempRoot: string | undefined;
let originalExitCode: typeof process.exitCode;

function createMessage(): Message {
	return {
		threadId: 'thread-1',
		type: 1,
		data: {
			uidFrom: 'user-1',
			dName: 'User',
			content: '/restart',
		},
	} as unknown as Message;
}

function createBotStub() {
	const logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	};
	logger.child.mockReturnValue(logger);

	const bot = {
		logger,
		i18n: {
			get: vi.fn((key: string) => key),
		},
		sendMessage: vi.fn(),
	} as unknown as AldenBot;

	return { bot, logger };
}

describe('RestartCommand', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.stubEnv('ALDEN_MANAGED_BY_LAUNCHER', '1');
		tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-restart-'));
		vi.stubEnv('ALDEN_LAUNCHER_REQUEST_PATH', path.join(tempRoot, 'launcher-request.json'));
		originalExitCode = process.exitCode;
		process.exitCode = undefined;
	});

	afterEach(async () => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		process.exitCode = originalExitCode;
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('writes AWAKE requests and exits with the portable code when launcher-managed', async () => {
		const { bot } = createBotStub();
		const command = new RestartCommand();
		command.init(bot);
		const emitSpy = vi.spyOn(process, 'emit').mockReturnValue(true);

		await command.execute({
			api: {} as never,
			message: createMessage(),
			args: [],
			lang: 'en',
			reply: vi.fn().mockResolvedValue(undefined),
			t: vi.fn((key: string) => key),
		} as unknown as CommandContext);

		const requestPath = process.env.ALDEN_LAUNCHER_REQUEST_PATH;
		if (!requestPath) throw new Error('missing request path');

		const request = JSON.parse(await fsp.readFile(requestPath, 'utf-8')) as {
			code: number;
			type: string;
		};

		expect(request).toMatchObject({ type: 'restart', code: AWAKE_CODE });
		expect(process.exitCode).toBe(AWAKE_EXIT_CODE);

		await vi.advanceTimersByTimeAsync(1000);
		expect(emitSpy).toHaveBeenCalledWith('SIGTERM');
		emitSpy.mockRestore();
	});
});
