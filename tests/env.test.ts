import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';

function createEnv(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return values as NodeJS.ProcessEnv;
}

describe('parseEnv', () => {
	it('uses safe defaults for public runtime installs', () => {
		const { config } = parseEnv(createEnv({}));

		expect(config.BOT_PREFIX).toBe('/');
		expect(config.DEFAULT_LANGUAGE).toBe('vi');
		expect(config.ENABLE_EVAL_COMMAND).toBe(false);
		expect(config.ENABLE_RELOAD_COMMAND).toBe(false);
		expect(config.LOG_LEVEL).toBe('info');
		expect(config.ADMIN_IDS).toEqual([]);
	});

	it('parses LOG_LEVEL case-insensitively', () => {
		const { config, warnings } = parseEnv(createEnv({ LOG_LEVEL: 'WARN' }));

		expect(config.LOG_LEVEL).toBe('warn');
		expect(warnings).toEqual([]);
	});

	it('allows zero message queue delay', () => {
		const { config, warnings } = parseEnv(createEnv({ MESSAGE_QUEUE_DELAY: '0' }));

		expect(config.MESSAGE_QUEUE_DELAY).toBe(0);
		expect(warnings).toEqual([]);
	});

	it('falls back to info for invalid LOG_LEVEL', () => {
		const { config, warnings } = parseEnv(createEnv({ LOG_LEVEL: 'trace' }));

		expect(config.LOG_LEVEL).toBe('info');
		expect(warnings.join('\n')).toContain('Falling back to "info"');
	});
});
