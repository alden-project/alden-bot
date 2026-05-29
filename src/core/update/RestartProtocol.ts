import { existsSync } from 'node:fs';
import { PATH } from '@/config/constants';
import { writeJsonFileAsync } from '@/utils/file';

export const AWAKE_CODE = 29253;
export const AWAKE_EXIT_CODE = AWAKE_CODE % 256;
export const AWAKE_NAME = 'AWAKE';

export type LauncherRequestType = 'restart' | 'update';

export interface LauncherUpdateRelease {
	readonly version: string;
	readonly tagName: string;
	readonly releaseUrl: string;
	readonly assetName: string;
	readonly assetUrl: string;
	readonly checksumAssetName: string;
	readonly checksumUrl: string;
}

export interface LauncherRequest {
	readonly type: LauncherRequestType;
	readonly code: typeof AWAKE_CODE;
	readonly name: typeof AWAKE_NAME;
	readonly createdAt: string;
	readonly reason?: string;
	readonly release?: LauncherUpdateRelease;
}

export function getLauncherRequestPath(): string {
	return process.env.ALDEN_LAUNCHER_REQUEST_PATH || PATH.LAUNCHER_REQUEST_PATH;
}

export function isLauncherManaged(): boolean {
	return process.env.ALDEN_MANAGED_BY_LAUNCHER === '1';
}

export function isDockerRuntime(): boolean {
	if (process.env.ALDEN_DOCKER === '1') return true;
	if (process.env.DOCKER_CONTAINER === '1') return true;

	try {
		return existsSync('/.dockerenv');
	} catch {
		return false;
	}
}

export function createLauncherRequest(
	type: LauncherRequestType,
	options: {
		readonly reason?: string;
		readonly release?: LauncherUpdateRelease;
	} = {},
): LauncherRequest {
	return {
		type,
		code: AWAKE_CODE,
		name: AWAKE_NAME,
		createdAt: new Date().toISOString(),
		...options,
	};
}

export async function writeLauncherRequest(request: LauncherRequest): Promise<void> {
	await writeJsonFileAsync(getLauncherRequestPath(), request);
}

export function sendLauncherRequest(request: LauncherRequest): void {
	process.send?.({
		type: 'alden-control',
		request,
	});
}

export async function requestLauncherRestart(reason: string): Promise<LauncherRequest> {
	const request = createLauncherRequest('restart', { reason });
	await writeLauncherRequest(request);
	sendLauncherRequest(request);
	return request;
}

export function isAwakeExitCode(exitCode: number | null | undefined): boolean {
	return exitCode === AWAKE_EXIT_CODE;
}
