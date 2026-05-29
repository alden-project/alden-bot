import { describe, expect, it } from 'vitest';

import { validatePluginManifest } from '@/core/plugin/PluginManifest';

const validManifest = {
	name: 'example-plugin',
	version: '1.0.0',
	description: 'Example plugin',
	author: 'alden',
	main: 'index.js',
};

describe('validatePluginManifest', () => {
	it('accepts a valid plugin manifest', () => {
		const { manifest, errors } = validatePluginManifest(validManifest);

		expect(errors).toEqual([]);
		expect(manifest?.name).toBe('example-plugin');
	});

	it('rejects missing required fields', () => {
		const { manifest, errors } = validatePluginManifest({ name: 'broken' });

		expect(manifest).toBeNull();
		expect(errors).toContain('"version" must be a non-empty string.');
		expect(errors).toContain('"main" must be a non-empty string.');
	});

	it('rejects invalid permission role levels', () => {
		const { manifest, errors } = validatePluginManifest({
			...validManifest,
			permissions: {
				'alden.example': 99,
			},
		});

		expect(manifest).toBeNull();
		expect(errors).toContain('Permission "alden.example" must use role level 0, 1, 2, or 3.');
	});
});
