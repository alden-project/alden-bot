import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	AWAKE_CODE,
	AWAKE_EXIT_CODE,
	findReleaseRoot,
	parseChecksumText,
	shouldRestartChild,
} from '../launcher.mjs';

let tempRoot: string | undefined;

describe('launcher helpers', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('restarts child processes that exit with AWAKE_EXIT_CODE', () => {
		expect(AWAKE_EXIT_CODE).toBe(69);
		expect(shouldRestartChild(69, undefined, undefined)).toBe(true);
		expect(shouldRestartChild(0, { request: { code: AWAKE_CODE } }, undefined)).toBe(true);
		expect(shouldRestartChild(0, undefined, { code: AWAKE_CODE })).toBe(true);
		expect(shouldRestartChild(0, undefined, undefined)).toBe(false);
	});

	it('parses checksum files with or without filenames', () => {
		const hash = 'a'.repeat(64);

		expect(parseChecksumText(`${hash}  alden-bot-v1.1.0.zip`, 'alden-bot-v1.1.0.zip')).toBe(
			hash,
		);
		expect(parseChecksumText(hash, 'alden-bot-v1.1.0.zip')).toBe(hash);
	});

	it('finds release roots inside single-folder ZIP extraction layouts', async () => {
		tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-launcher-'));
		const nestedRoot = path.join(tempRoot, 'alden-bot-1.1.0');
		await fsp.mkdir(nestedRoot);
		await fsp.writeFile(path.join(nestedRoot, 'package.json'), '{}', 'utf-8');

		await expect(findReleaseRoot(tempRoot)).resolves.toBe(nestedRoot);
	});
});
