import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	detectInstallCommands,
	hashInstallInputs,
	isMissingInstallCommandError,
} from '@/core/plugin/PluginInstaller';

let tempRoot: string | undefined;

async function createPluginDir(files: Record<string, string>): Promise<string> {
	tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-installer-'));
	for (const [name, content] of Object.entries(files)) {
		await fsp.writeFile(path.join(tempRoot, name), content, 'utf-8');
	}
	return tempRoot;
}

describe('PluginInstaller helpers', () => {
	afterEach(async () => {
		if (tempRoot) {
			await fsp.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	it('uses pnpm and corepack for pnpm lockfiles without falling back to npm', async () => {
		const pluginPath = await createPluginDir({
			'package.json': '{"dependencies":{"left-pad":"1.3.0"}}',
			'pnpm-lock.yaml': 'lockfileVersion: 9.0',
		});

		const commands = await detectInstallCommands(pluginPath);

		expect(commands.map((command) => command.command)).toEqual(['pnpm', 'corepack']);
		expect(commands.flatMap((command) => command.args)).not.toContain('npm');
	});

	it('uses npm ci when package-lock.json is present', async () => {
		const pluginPath = await createPluginDir({
			'package.json': '{"dependencies":{"left-pad":"1.3.0"}}',
			'package-lock.json': '{"lockfileVersion":3}',
		});

		const commands = await detectInstallCommands(pluginPath);

		expect(commands).toEqual([
			{
				command: 'npm',
				args: ['ci', '--omit=dev'],
				label: 'npm clean install',
			},
		]);
	});

	it('changes the install hash when a lockfile changes', async () => {
		const pluginPath = await createPluginDir({
			'package.json': '{"dependencies":{"left-pad":"1.3.0"}}',
			'pnpm-lock.yaml': 'first-lock',
		});

		const firstHash = await hashInstallInputs(pluginPath);
		await fsp.writeFile(path.join(pluginPath, 'pnpm-lock.yaml'), 'second-lock', 'utf-8');
		const secondHash = await hashInstallInputs(pluginPath);

		expect(secondHash).not.toBe(firstHash);
	});

	it('detects missing package manager errors', () => {
		expect(
			isMissingInstallCommandError(
				{ message: "'pnpm' is not recognized as an internal or external command" },
				'pnpm',
			),
		).toBe(true);
		expect(isMissingInstallCommandError({ code: 'ENOENT' }, 'pnpm')).toBe(true);
	});
});
