import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ConfigProvider } from '@/storage/ConfigProvider';
import { readJsonFileAsync } from '@/utils/file';

let tempRoot: string | undefined;

async function createTempRoot(): Promise<string> {
	tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-config-'));
	return tempRoot;
}

describe('ConfigProvider', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('creates defaults for missing config files', async () => {
		const root = await createTempRoot();
		const filePath = path.join(root, 'config.json');
		const provider = new ConfigProvider(filePath, { enabled: true });

		await provider.load();

		expect(provider.get('enabled')).toBe(true);
		await expect(readJsonFileAsync(filePath)).resolves.toEqual({ enabled: true });
	});

	it('throws on invalid JSON instead of replacing it with defaults', async () => {
		const root = await createTempRoot();
		const filePath = path.join(root, 'config.json');
		await fsp.writeFile(filePath, '{ invalid', 'utf-8');
		const provider = new ConfigProvider(filePath, { enabled: true });

		await expect(provider.load()).rejects.toThrow();
		await expect(fsp.readFile(filePath, 'utf-8')).resolves.toBe('{ invalid');
	});
});
