import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	findReleaseAssetPair,
	parseGitHubRepositorySlug,
	UpdateService,
} from '@/core/update/UpdateService';

let tempRoot: string | undefined;

async function createPackageJson(
	repositoryUrl = 'git+https://github.com/finntrannn/alden-bot.git',
) {
	tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-update-'));
	const packageJsonPath = path.join(tempRoot, 'package.json');
	await fsp.writeFile(
		packageJsonPath,
		JSON.stringify({ repository: { url: repositoryUrl } }),
		'utf-8',
	);
	return packageJsonPath;
}

function createFetch(body: unknown, status = 200): typeof fetch {
	return async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
}

describe('UpdateService', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('parses GitHub repository URLs', () => {
		expect(
			parseGitHubRepositorySlug('git+https://github.com/finntrannn/alden-bot.git'),
		).toEqual({
			owner: 'finntrannn',
			repo: 'alden-bot',
		});
		expect(parseGitHubRepositorySlug('git@github.com:finntrannn/alden-bot.git')).toEqual({
			owner: 'finntrannn',
			repo: 'alden-bot',
		});
	});

	it('reports newer GitHub Releases as available', async () => {
		const packageJsonPath = await createPackageJson();
		const service = new UpdateService({
			packageJsonPath,
			fetchImpl: createFetch({
				tag_name: 'v1.1.0',
				html_url: 'https://github.com/finntrannn/alden-bot/releases/tag/v1.1.0',
				published_at: '2026-01-01T00:00:00Z',
				assets: [],
			}),
		});

		await expect(service.check('1.0.0')).resolves.toMatchObject({
			status: 'available',
			currentVersion: '1.0.0',
			latestVersion: '1.1.0',
		});
	});

	it('detects release ZIP and checksum assets', () => {
		expect(
			findReleaseAssetPair([
				{
					name: 'alden-bot-v1.1.0.zip',
					browser_download_url: 'https://example.test/bot.zip',
				},
				{
					name: 'alden-bot-v1.1.0.zip.sha256',
					browser_download_url: 'https://example.test/bot.zip.sha256',
				},
			]),
		).toEqual({
			assetName: 'alden-bot-v1.1.0.zip',
			assetUrl: 'https://example.test/bot.zip',
			checksumAssetName: 'alden-bot-v1.1.0.zip.sha256',
			checksumUrl: 'https://example.test/bot.zip.sha256',
		});
	});

	it('refuses apply preparation when checksum assets are missing', async () => {
		const packageJsonPath = await createPackageJson();
		const service = new UpdateService({
			packageJsonPath,
			fetchImpl: createFetch({
				tag_name: 'v1.1.0',
				html_url: 'https://github.com/finntrannn/alden-bot/releases/tag/v1.1.0',
				assets: [
					{
						name: 'alden-bot-v1.1.0.zip',
						browser_download_url: 'https://example.test/bot.zip',
					},
				],
			}),
		});

		await expect(service.prepareApply('1.0.0')).resolves.toMatchObject({
			error: 'missing-assets',
		});
	});

	it('returns unavailable instead of throwing when release fetch fails', async () => {
		const packageJsonPath = await createPackageJson();
		const service = new UpdateService({
			packageJsonPath,
			fetchImpl: async () => {
				throw new Error('network down');
			},
		});

		await expect(service.check('1.0.0')).resolves.toMatchObject({
			status: 'unavailable',
			error: 'network down',
		});
	});
});
