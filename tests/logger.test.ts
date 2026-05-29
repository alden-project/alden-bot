import { describe, expect, it, vi } from 'vitest';

import { Logger } from '@/shared/logger';

describe('Logger', () => {
	it('defaults to info and filters debug output', () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const logger = new Logger();

		logger.debug('hidden');
		logger.info('shown');

		expect(consoleSpy).toHaveBeenCalledTimes(1);
		expect(consoleSpy.mock.calls[0]?.some((value) => String(value).includes('shown'))).toBe(
			true,
		);
	});

	it('keeps debug output when explicitly configured', () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const logger = new Logger('debug');

		logger.debug('visible');

		expect(consoleSpy.mock.calls[0]?.some((value) => String(value).includes('visible'))).toBe(
			true,
		);
	});
});
