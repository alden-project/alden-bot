import { afterEach, describe, expect, it, vi } from 'vitest';
import type { API } from 'zca-js';

function createApiStub(): API {
	return {
		sendMessage: vi.fn(),
	} as unknown as API;
}

async function createBotWithEnv(evalEnabled: string, reloadEnabled: string) {
	vi.resetModules();
	vi.stubEnv('ENABLE_EVAL_COMMAND', evalEnabled);
	vi.stubEnv('ENABLE_RELOAD_COMMAND', reloadEnabled);

	const { AldenBot } = await import('@/core/AldenBot');
	const bot = new AldenBot(createApiStub());
	const registerDefaultCommands = Reflect.get(bot, 'registerDefaultCommands');

	if (typeof registerDefaultCommands !== 'function') {
		throw new TypeError('registerDefaultCommands is not callable');
	}

	registerDefaultCommands.call(bot);
	return bot;
}

describe('AldenBot default commands', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('does not register eval or reload by default', async () => {
		const bot = await createBotWithEnv('', '');
		const names = bot.commandManager.getAll().map((command) => command.name);

		expect(names).not.toContain('eval');
		expect(names).not.toContain('reload');
	});

	it('registers eval and reload only when explicitly enabled', async () => {
		const bot = await createBotWithEnv('true', 'true');
		const names = bot.commandManager.getAll().map((command) => command.name);

		expect(names).toContain('eval');
		expect(names).toContain('reload');
	});
});
