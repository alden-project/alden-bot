import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nManager } from '@/i18n/I18nManager';

let tempRoot: string | undefined;

async function createLocaleDir(): Promise<string> {
	tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-i18n-'));
	await fsp.writeFile(
		path.join(tempRoot, 'vi.json'),
		JSON.stringify({
			command: {
				ping: 'Pong {latency}',
			},
		}),
	);
	return tempRoot;
}

describe('I18nManager', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('warns and returns the key for missing core translations', async () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const i18n = new I18nManager(await createLocaleDir(), 'vi', { label: 'TestCore' });

		await i18n.loadLocales();
		const value = i18n.get('missing.key');

		expect(value).toBe('missing.key');
		expect(
			consoleSpy.mock.calls.some((call) =>
				call.some((item) => String(item).includes('Missing i18n key "missing.key"')),
			),
		).toBe(true);
	});

	it('can disable missing-key warnings for plugin translations', async () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const i18n = new I18nManager(await createLocaleDir(), 'vi', {
			label: 'TestPlugin',
			warnOnMissingKey: false,
		});

		await i18n.loadLocales();
		const value = i18n.get('missing.key');

		expect(value).toBe('missing.key');
		expect(
			consoleSpy.mock.calls.some((call) =>
				call.some((item) => String(item).includes('Missing i18n key')),
			),
		).toBe(false);
	});

	it('falls back to the default locale when a key is missing in the target locale', async () => {
		const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-i18n-'));
		tempRoot = tempDir;
		await fsp.writeFile(
			path.join(tempDir, 'vi.json'),
			JSON.stringify({
				test: {
					hello: 'Xin chào',
					only_vi: 'Chỉ có ở tiếng Việt',
				},
			}),
		);
		await fsp.writeFile(
			path.join(tempDir, 'en.json'),
			JSON.stringify({
				test: {
					hello: 'Hello',
				},
			}),
		);

		const i18n = new I18nManager(tempDir, 'vi', { warnOnMissingKey: false });
		await i18n.loadLocales();

		expect(i18n.get('test.hello', {}, 'en')).toBe('Hello');
		expect(i18n.get('test.only_vi', {}, 'en')).toBe('Chỉ có ở tiếng Việt');
		expect(i18n.has('test.hello', 'en')).toBe(true);
		expect(i18n.has('test.only_vi', 'en')).toBe(true);
	});
});
