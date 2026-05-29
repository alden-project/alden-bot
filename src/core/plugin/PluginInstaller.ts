import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { existsAsync, readJsonFileAsync, writeJsonFileAsync } from '@/utils/file';
import type { Logger } from '@/shared/logger';

const execFileAsync = promisify(execFile);
const INSTALL_TIMEOUT_MS = 120_000;
const LOCKFILES = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'] as const;

interface PluginPackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export interface InstallCommand {
	command: string;
	args: string[];
	label: string;
}

interface InstallError extends Error {
	code?: string | number;
	stderr?: string;
	stdout?: string;
}

export class PluginInstaller {
	public constructor(private readonly logger: Logger) {}

	public async installIfNeeded(pluginPath: string, pluginName: string): Promise<boolean> {
		const packageJsonPath = path.join(pluginPath, 'package.json');
		if (!(await existsAsync(packageJsonPath))) return true;

		let packageJson: PluginPackageJson | null;
		try {
			packageJson = await readJsonFileAsync<PluginPackageJson>(packageJsonPath);
		} catch (error) {
			this.logger.error(
				`PluginManager: Invalid package.json for "${pluginName}". Skipping.`,
				error,
			);
			return false;
		}
		if (!this.hasDependencies(packageJson)) return true;

		const hashPath = path.join(pluginPath, '.install-hash');
		const nodeModulesPath = path.join(pluginPath, 'node_modules');
		const currentHash = await hashInstallInputs(pluginPath, packageJsonPath);

		if (await existsAsync(nodeModulesPath)) {
			let storedHash: string | null = null;
			try {
				storedHash = await readJsonFileAsync<string>(hashPath);
			} catch (error) {
				this.logger.warn(
					`PluginManager: Failed to read install hash for "${pluginName}", reinstalling...`,
					error,
				);
			}
			if (storedHash === currentHash) return true;

			this.logger.info(
				`PluginManager: package.json changed for "${pluginName}", reinstalling...`,
			);
		}

		const installCommands = await detectInstallCommands(pluginPath);

		for (const installCommand of installCommands) {
			this.logger.info(
				`PluginManager: Installing dependencies for "${pluginName}" (${installCommand.label})...`,
			);

			try {
				const { stderr, stdout } = await runInstallCommand(installCommand, pluginPath);

				if (stdout?.trim()) {
					this.logger.debug(`PluginManager: [${pluginName}] ${stdout.trim()}`);
				}
				if (stderr?.trim()) {
					this.logger.debug(`PluginManager: [${pluginName}] ${stderr.trim()}`);
				}

				await writeJsonFileAsync(hashPath, currentHash);
				this.logger.info(`PluginManager: Dependencies installed for "${pluginName}"`);
				return true;
			} catch (error) {
				if (isMissingInstallCommandError(error, installCommand.command)) {
					this.logger.warn(
						`PluginManager: "${installCommand.command}" is not available for "${pluginName}".`,
					);
					continue;
				}

				this.logger.error(
					`PluginManager: Failed to install dependencies for "${pluginName}". Skipping plugin.`,
					error,
				);
				return false;
			}
		}

		this.logger.error(
			`PluginManager: No suitable package manager is available for "${pluginName}". Skipping plugin.`,
		);
		return false;
	}

	private hasDependencies(packageJson: PluginPackageJson | null): boolean {
		const dependencies = packageJson?.dependencies;
		const devDependencies = packageJson?.devDependencies;

		return Boolean(
			(dependencies && Object.keys(dependencies).length > 0) ||
			(devDependencies && Object.keys(devDependencies).length > 0),
		);
	}
}

async function runInstallCommand(
	installCommand: InstallCommand,
	pluginPath: string,
): Promise<{ stdout: string; stderr: string }> {
	const options = {
		cwd: pluginPath,
		timeout: INSTALL_TIMEOUT_MS,
	};

	if (process.platform !== 'win32') {
		return execFileAsync(installCommand.command, installCommand.args, options);
	}

	return execFileAsync(
		process.env.ComSpec ?? 'cmd.exe',
		['/d', '/s', '/c', installCommand.command, ...installCommand.args],
		options,
	);
}

export async function detectInstallCommands(pluginPath: string): Promise<InstallCommand[]> {
	if (await existsAsync(path.join(pluginPath, 'pnpm-lock.yaml'))) {
		return [
			{
				command: 'pnpm',
				args: ['install', '--prod', '--frozen-lockfile', '--ignore-workspace'],
				label: 'pnpm frozen lockfile',
			},
			{
				command: 'corepack',
				args: ['pnpm', 'install', '--prod', '--frozen-lockfile', '--ignore-workspace'],
				label: 'corepack pnpm frozen lockfile',
			},
		];
	}
	if (await existsAsync(path.join(pluginPath, 'yarn.lock'))) {
		return [
			{
				command: 'yarn',
				args: ['install', '--production', '--frozen-lockfile'],
				label: 'yarn frozen lockfile',
			},
			{
				command: 'corepack',
				args: ['yarn', 'install', '--production', '--frozen-lockfile'],
				label: 'corepack yarn frozen lockfile',
			},
		];
	}
	if (await existsAsync(path.join(pluginPath, 'package-lock.json'))) {
		return [
			{
				command: 'npm',
				args: ['ci', '--omit=dev'],
				label: 'npm clean install',
			},
		];
	}
	return [
		{
			command: 'npm',
			args: ['install', '--omit=dev'],
			label: 'npm install',
		},
	];
}

export function isMissingInstallCommandError(error: unknown, command: string): boolean {
	const err = error as InstallError;
	if (err?.code === 'ENOENT') return true;

	const output =
		`${err?.message ?? ''}\n${err?.stderr ?? ''}\n${err?.stdout ?? ''}`.toLowerCase();
	const commandName = command.toLowerCase();

	return (
		output.includes(`${commandName}: not found`) ||
		output.includes(`${commandName}: command not found`) ||
		output.includes(`'${commandName}' is not recognized`) ||
		output.includes(`"${commandName}" is not recognized`) ||
		output.includes(`${commandName} is not recognized`)
	);
}

export async function hashInstallInputs(
	pluginPath: string,
	packageJsonPath = path.join(pluginPath, 'package.json'),
): Promise<string> {
	const hash = createHash('sha256');
	const inputPaths = [packageJsonPath];

	for (const lockfile of LOCKFILES) {
		const lockfilePath = path.join(pluginPath, lockfile);
		if (await existsAsync(lockfilePath)) {
			inputPaths.push(lockfilePath);
		}
	}

	for (const filePath of inputPaths) {
		const relativePath = path.relative(pluginPath, filePath);
		const content = await fsp.readFile(filePath);
		hash.update(relativePath);
		hash.update('\0');
		hash.update(content);
		hash.update('\0');
	}

	return hash.digest('hex');
}
