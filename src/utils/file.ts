import fsp from 'node:fs/promises';
import path from 'node:path';

import logger from '@/shared/logger';

const writeQueues = new Map<string, Promise<void>>();

export async function existsAsync(filePath: string): Promise<boolean> {
	try {
		await fsp.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function ensureDirAsync(dirPath: string): Promise<void> {
	try {
		await fsp.mkdir(dirPath, { recursive: true });
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') {
			throw err;
		}
	}
}

export async function readJsonFileAsync<T>(filePath: string): Promise<T | null> {
	let raw: string;
	try {
		raw = await fsp.readFile(filePath, 'utf-8');
	} catch (error) {
		const isEnoent =
			error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
		if (isEnoent) return null;

		logger.error(`Failed to read JSON file: ${filePath}`, error);
		throw error;
	}

	if (!raw.trim()) return null;

	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		logger.error(`Invalid JSON file: ${filePath}`, error);
		throw error;
	}
}

export async function writeJsonFileAsync(filePath: string, data: unknown): Promise<void> {
	const resolvedPath = path.resolve(filePath);
	const previous = writeQueues.get(resolvedPath) ?? Promise.resolve();
	const current = previous
		.catch(() => undefined)
		.then(() => writeJsonFileUnlocked(resolvedPath, data));

	writeQueues.set(resolvedPath, current);
	try {
		await current;
	} finally {
		if (writeQueues.get(resolvedPath) === current) {
			writeQueues.delete(resolvedPath);
		}
	}
}

async function writeJsonFileUnlocked(filePath: string, data: unknown): Promise<void> {
	await ensureDirAsync(path.dirname(filePath));
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
	try {
		await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
		await fsp.rename(tempPath, filePath);
	} catch (error) {
		await fsp.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
}
