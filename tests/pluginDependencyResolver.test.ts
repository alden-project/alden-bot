import { describe, expect, it, vi } from 'vitest';

import type { PluginMeta } from '@/core/plugin/PluginDependencyResolver';
import { resolvePluginLoadOrder } from '@/core/plugin/PluginDependencyResolver';
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

function createMeta(name: string, depend: string[] = [], softDepend: string[] = []): PluginMeta {
	return {
		name,
		pluginPath: name,
		description: {
			name,
			version: '1.0.0',
			description: name,
			author: 'alden',
			main: 'index.js',
			depend,
			softDepend,
		},
	};
}

describe('resolvePluginLoadOrder', () => {
	it('loads hard and soft dependencies before dependents', () => {
		const logger = createLoggerStub();
		const order = resolvePluginLoadOrder(
			[createMeta('addon', ['core']), createMeta('theme', [], ['core']), createMeta('core')],
			logger,
		).map((meta) => meta.name);

		expect(order.indexOf('core')).toBeLessThan(order.indexOf('addon'));
		expect(order.indexOf('core')).toBeLessThan(order.indexOf('theme'));
	});

	it('skips plugins with missing hard dependencies', () => {
		const logger = createLoggerStub();
		const order = resolvePluginLoadOrder([createMeta('addon', ['missing'])], logger);

		expect(order).toEqual([]);
	});

	it('keeps plugins loadable when soft dependencies form a cycle', () => {
		const logger = createLoggerStub();
		const order = resolvePluginLoadOrder(
			[createMeta('alpha', [], ['beta']), createMeta('beta', [], ['alpha'])],
			logger,
		).map((meta) => meta.name);

		expect(order).toEqual(['alpha', 'beta']);
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Soft dependency cycle'));
	});
});
