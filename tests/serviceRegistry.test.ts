import { describe, expect, it, vi } from 'vitest';

import { ServiceRegistry } from '@/core/ServiceRegistry';
import type { Logger } from '@/shared/logger';

function createLoggerStub(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	} as unknown as Logger;
}

describe('ServiceRegistry', () => {
	it('keeps the existing service when a duplicate is registered without replace', () => {
		const logger = createLoggerStub();
		const registry = new ServiceRegistry(logger);
		const first = { value: 1 };
		const second = { value: 2 };

		expect(registry.register('economy', first, { owner: 'EconomyAPI' })).toBe(true);
		expect(registry.register('economy', second, { owner: 'OtherEconomy' })).toBe(false);

		expect(registry.get('economy')).toBe(first);
		expect(logger.warn).toHaveBeenCalledWith(
			'ServiceRegistry: "economy" is already registered. Keeping existing.',
		);
	});

	it('only allows the owning plugin to unregister a service', () => {
		const logger = createLoggerStub();
		const registry = new ServiceRegistry(logger);
		const service = { ready: true };

		registry.register('economy', service, { owner: 'EconomyAPI' });

		expect(registry.unregister('economy', { owner: 'ChatLevels' })).toBe(false);
		expect(registry.get('economy')).toBe(service);

		expect(registry.unregister('economy', { owner: 'EconomyAPI' })).toBe(true);
		expect(registry.get('economy')).toBeUndefined();
	});
});
