// @ts-check
/* global Buffer, console, fetch, process */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * @typedef {{
 *   version: string;
 *   assetName: string;
 *   assetUrl: string;
 *   checksumUrl: string;
 * }} UpdateRelease
 *
 * @typedef {{
 *   code?: number;
 *   type?: string;
 *   release?: UpdateRelease;
 * }} LauncherRequest
 *
 * @typedef {LauncherRequest & {
 *   type: 'update';
 *   release: UpdateRelease;
 * }} UpdateLauncherRequest
 *
 * @typedef {{
 *   type: 'alden-control';
 *   code?: number;
 *   request: LauncherRequest;
 * }} LauncherMessage
 *
 * @typedef {{
 *   code?: number;
 *   request?: LauncherRequest | null;
 * }} RestartSignalSource
 *
 * @typedef {{
 *   exitCode: number | null;
 *   signal: NodeJS.Signals | null;
 *   launcherMessage?: LauncherMessage;
 * }} BotRunResult
 *
 * @typedef {readonly [command: string, args: string[]]} CommandAttempt
 */

export const AWAKE_CODE = 29253;
export const AWAKE_EXIT_CODE = AWAKE_CODE % 256;

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PATHS = {
	dataDir: path.join(PROJECT_ROOT, 'data'),
	request: path.join(PROJECT_ROOT, 'data', 'launcher-request.json'),
	downloads: path.join(PROJECT_ROOT, 'data', 'update-downloads'),
	backups: path.join(PROJECT_ROOT, 'data', 'update-backups'),
};

const PRESERVED_ROOT_ENTRIES = new Set(['.env', '.git', 'data', 'plugins', 'node_modules']);
const WINDOWS_COMMAND_SHIMS = new Set(['corepack', 'npm', 'pnpm', 'yarn']);

/** @type {import('node:child_process').ChildProcess | undefined} */
let activeChild;
let isStopping = false;

/**
 * @param {number | null | undefined} exitCode
 * @param {RestartSignalSource | null | undefined} launcherMessage
 * @param {LauncherRequest | null | undefined} request
 * @returns {boolean}
 */
export function shouldRestartChild(exitCode, launcherMessage, request) {
	return (
		exitCode === AWAKE_EXIT_CODE ||
		launcherMessage?.code === AWAKE_CODE ||
		launcherMessage?.request?.code === AWAKE_CODE ||
		request?.code === AWAKE_CODE
	);
}

/**
 * @param {string} text
 * @param {string} assetName
 * @returns {string | null}
 */
export function parseChecksumText(text, assetName) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const candidate = lines.find((line) => line.includes(assetName)) ?? lines[0] ?? '';
	const match = candidate.match(/\b[a-fA-F0-9]{64}\b/);
	return match?.[0].toLowerCase() ?? null;
}

/**
 * @param {string} stagingDir
 * @returns {Promise<string>}
 */
export async function findReleaseRoot(stagingDir) {
	if (await exists(path.join(stagingDir, 'package.json'))) return stagingDir;

	const entries = await fsp.readdir(stagingDir, { withFileTypes: true });
	const dirs = entries.filter((entry) => entry.isDirectory());
	const [onlyDir] = dirs;
	if (dirs.length === 1 && onlyDir) {
		const releaseRoot = path.join(stagingDir, onlyDir.name);
		if (await exists(path.join(releaseRoot, 'package.json'))) return releaseRoot;
	}

	throw new Error(
		'Release ZIP does not contain package.json at root or single top-level folder.',
	);
}

/** @returns {Promise<void>} */
async function main() {
	await fsp.mkdir(PATHS.dataDir, { recursive: true });
	await fsp.mkdir(PATHS.downloads, { recursive: true });
	await fsp.mkdir(PATHS.backups, { recursive: true });

	registerSignalHandlers();

	while (!isStopping) {
		const result = await runBot();
		const fileRequest = await readAndClearLauncherRequest();
		const request = result.launcherMessage?.request ?? fileRequest;

		if (isUpdateRequest(request)) {
			await applyUpdate(request);
			continue;
		}

		if (shouldRestartChild(result.exitCode, result.launcherMessage, request)) {
			console.log('[launcher] AWAKE received. Restarting bot process...');
			continue;
		}

		if (result.signal) {
			console.log(`[launcher] Bot exited from signal ${result.signal}.`);
			process.exit(0);
		}

		process.exit(result.exitCode ?? 0);
	}
}

/** @returns {Promise<BotRunResult>} */
async function runBot() {
	const tsxCli = require.resolve('tsx/cli');
	/** @type {LauncherMessage | undefined} */
	let launcherMessage;

	/** @type {Promise<BotRunResult>} */
	const result = new Promise((resolve) => {
		activeChild = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				ALDEN_MANAGED_BY_LAUNCHER: '1',
			},
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
		});

		activeChild.on('message', (message) => {
			if (isLauncherMessage(message)) launcherMessage = message;
		});

		activeChild.on('exit', (exitCode, signal) => {
			activeChild = undefined;
			resolve({ exitCode, signal, launcherMessage });
		});
	});

	return await result;
}

/** @returns {void} */
function registerSignalHandlers() {
	/**
	 * @param {NodeJS.Signals} signal
	 * @returns {void}
	 */
	const stop = (signal) => {
		if (isStopping) return;
		isStopping = true;
		if (activeChild && !activeChild.killed) {
			activeChild.kill(signal);
		} else {
			process.exit(0);
		}
	};

	process.on('SIGINT', () => stop('SIGINT'));
	process.on('SIGTERM', () => stop('SIGTERM'));
}

/**
 * @param {unknown} message
 * @returns {message is LauncherMessage}
 */
function isLauncherMessage(message) {
	if (typeof message !== 'object' || message === null) return false;
	const candidate = /** @type {{ type?: unknown; request?: unknown }} */ (message);

	return (
		candidate.type === 'alden-control' &&
		typeof candidate.request === 'object' &&
		candidate.request !== null
	);
}

/** @returns {Promise<LauncherRequest | null>} */
async function readAndClearLauncherRequest() {
	try {
		const raw = await fsp.readFile(PATHS.request, 'utf-8');
		await fsp.rm(PATHS.request, { force: true });
		return /** @type {LauncherRequest} */ (JSON.parse(raw));
	} catch (error) {
		if (getErrorCode(error) === 'ENOENT') return null;
		throw error;
	}
}

/**
 * @param {LauncherRequest | null | undefined} request
 * @returns {request is UpdateLauncherRequest}
 */
function isUpdateRequest(request) {
	return request?.type === 'update' && request.release !== undefined;
}

/**
 * @param {UpdateLauncherRequest} request
 * @returns {Promise<void>}
 */
async function applyUpdate(request) {
	const release = request.release;
	const updateId = `${Date.now()}-${release.version}`;
	const zipPath = path.join(PATHS.downloads, `${updateId}-${release.assetName}`);
	const stagingDir = path.join(PATHS.downloads, `${updateId}-staging`);
	const backupDir = path.join(PATHS.backups, updateId);

	console.log(`[launcher] Updating alden-bot to v${release.version}...`);

	try {
		await fsp.rm(stagingDir, { recursive: true, force: true });
		await fsp.mkdir(stagingDir, { recursive: true });

		await downloadFile(release.assetUrl, zipPath);
		const expectedHash = await fetchChecksum(release.checksumUrl, release.assetName);
		const actualHash = await sha256File(zipPath);
		if (actualHash !== expectedHash) {
			throw new Error(`Checksum mismatch. Expected ${expectedHash}, got ${actualHash}.`);
		}

		await extractZip(zipPath, stagingDir);
		const releaseRoot = await findReleaseRoot(stagingDir);

		await backupCurrentCode(backupDir);
		await replaceCodeFromRelease(releaseRoot);

		try {
			await installProductionDependencies();
		} catch (error) {
			console.error('[launcher] Dependency install failed. Rolling back...', error);
			await rollbackCode(backupDir);
			throw error;
		}

		console.log(`[launcher] Update to v${release.version} completed. Starting bot...`);
	} catch (error) {
		console.error('[launcher] Update failed. Restarting previous version.', error);
		if (await exists(backupDir)) {
			await rollbackCode(backupDir);
		}
	} finally {
		await fsp.rm(stagingDir, { recursive: true, force: true });
		await fsp.rm(zipPath, { force: true });
	}
}

/**
 * @param {string} url
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function downloadFile(url, filePath) {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'alden-bot-updater',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	await fsp.writeFile(filePath, buffer);
}

/**
 * @param {string} url
 * @param {string} assetName
 * @returns {Promise<string>}
 */
async function fetchChecksum(url, assetName) {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'alden-bot-updater',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to download checksum ${url}: HTTP ${response.status}`);
	}

	const checksum = parseChecksumText(await response.text(), assetName);
	if (!checksum) {
		throw new Error(`Checksum asset does not contain a SHA256 hash for ${assetName}.`);
	}

	return checksum;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function sha256File(filePath) {
	const hash = createHash('sha256');
	hash.update(await fsp.readFile(filePath));
	return hash.digest('hex');
}

/**
 * @param {string} zipPath
 * @param {string} destination
 * @returns {Promise<void>}
 */
async function extractZip(zipPath, destination) {
	/** @type {CommandAttempt[]} */
	const attempts =
		process.platform === 'win32'
			? [
					[
						'powershell.exe',
						[
							'-NoProfile',
							'-Command',
							'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
							zipPath,
							destination,
						],
					],
				]
			: [
					['unzip', ['-q', zipPath, '-d', destination]],
					['bsdtar', ['-xf', zipPath, '-C', destination]],
					['tar', ['-xf', zipPath, '-C', destination]],
				];

	/** @type {unknown} */
	let lastError;
	for (const [command, args] of attempts) {
		try {
			await runCommand(command, args);
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError ?? new Error('No ZIP extractor is available.');
}

/**
 * @param {string} backupDir
 * @returns {Promise<void>}
 */
async function backupCurrentCode(backupDir) {
	await fsp.rm(backupDir, { recursive: true, force: true });
	await fsp.mkdir(backupDir, { recursive: true });
	await copyReplaceableEntries(PROJECT_ROOT, backupDir);
}

/**
 * @param {string} releaseRoot
 * @returns {Promise<void>}
 */
async function replaceCodeFromRelease(releaseRoot) {
	await removeReplaceableEntries(PROJECT_ROOT);
	await copyReplaceableEntries(releaseRoot, PROJECT_ROOT);
}

/**
 * @param {string} backupDir
 * @returns {Promise<void>}
 */
async function rollbackCode(backupDir) {
	await removeReplaceableEntries(PROJECT_ROOT);
	await copyReplaceableEntries(backupDir, PROJECT_ROOT);
}

/**
 * @param {string} root
 * @returns {Promise<void>}
 */
async function removeReplaceableEntries(root) {
	for (const entry of await getReplaceableEntryNames(root)) {
		await fsp.rm(path.join(root, entry), { recursive: true, force: true });
	}
}

/**
 * @param {string} sourceRoot
 * @param {string} targetRoot
 * @returns {Promise<void>}
 */
async function copyReplaceableEntries(sourceRoot, targetRoot) {
	for (const entry of await getReplaceableEntryNames(sourceRoot)) {
		await fsp.cp(path.join(sourceRoot, entry), path.join(targetRoot, entry), {
			recursive: true,
			force: true,
			errorOnExist: false,
		});
	}
}

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function getReplaceableEntryNames(root) {
	const entries = await fsp.readdir(root, { withFileTypes: true });
	return entries.map((entry) => entry.name).filter((name) => !PRESERVED_ROOT_ENTRIES.has(name));
}

/** @returns {Promise<void>} */
async function installProductionDependencies() {
	const packageJson = /** @type {{ packageManager?: unknown }} */ (
		JSON.parse(await fsp.readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'))
	);
	const packageManager =
		typeof packageJson.packageManager === 'string' ? packageJson.packageManager : '';

	if (
		packageManager.startsWith('pnpm@') ||
		(await exists(path.join(PROJECT_ROOT, 'pnpm-lock.yaml')))
	) {
		await runFirstAvailable([
			['corepack', ['pnpm', 'install', '--prod', '--frozen-lockfile']],
			['pnpm', ['install', '--prod', '--frozen-lockfile']],
		]);
		return;
	}

	if (
		packageManager.startsWith('yarn@') ||
		(await exists(path.join(PROJECT_ROOT, 'yarn.lock')))
	) {
		await runFirstAvailable([
			['corepack', ['yarn', 'install', '--production', '--frozen-lockfile']],
			['yarn', ['install', '--production', '--frozen-lockfile']],
		]);
		return;
	}

	if (await exists(path.join(PROJECT_ROOT, 'package-lock.json'))) {
		await runCommand('npm', ['ci', '--omit=dev']);
		return;
	}

	await runCommand('npm', ['install', '--omit=dev']);
}

/**
 * @param {CommandAttempt[]} commands
 * @returns {Promise<void>}
 */
async function runFirstAvailable(commands) {
	/** @type {unknown} */
	let lastError;
	for (const [command, args] of commands) {
		try {
			await runCommand(command, args);
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError ?? new Error('No package manager command is available.');
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function runCommand(command, args) {
	/** @type {Promise<void>} */
	const finished = new Promise((resolve, reject) => {
		const useWindowsShim = process.platform === 'win32' && WINDOWS_COMMAND_SHIMS.has(command);
		const executable = useWindowsShim ? (process.env.ComSpec ?? 'cmd.exe') : command;
		const executableArgs = useWindowsShim ? ['/d', '/s', '/c', command, ...args] : args;

		const child = spawn(executable, executableArgs, {
			cwd: PROJECT_ROOT,
			stdio: 'inherit',
		});

		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
		});
	});

	await finished;
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
	try {
		await fsp.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
function getErrorCode(error) {
	if (typeof error !== 'object' || error === null) return undefined;
	const candidate = /** @type {{ code?: unknown }} */ (error);
	return typeof candidate.code === 'string' ? candidate.code : undefined;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
	main().catch((error) => {
		console.error('[launcher] Fatal error', error);
		process.exit(1);
	});
}
