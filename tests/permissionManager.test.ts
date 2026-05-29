import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { API } from 'zca-js';

import { PermissionManager, Role } from '@/core/permission/PermissionManager';
import logger from '@/shared/logger';

let tempDir: string | undefined;

afterEach(async () => {
	if (tempDir) {
		await fsp.rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

async function createManager(options: { memberIds?: string[] } = {}) {
	tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'alden-permission-'));
	const memberIds = options.memberIds ?? [
		'owner',
		'realDeputy',
		'virtualDeputy',
		'botAdmin',
		'member',
		'user',
	];
	const api = {
		getGroupInfo: vi.fn(async (threadId: string | string[]) => {
			const ids = Array.isArray(threadId) ? threadId : [threadId];
			return {
				gridInfoMap: Object.fromEntries(
					ids.map((id) => [
						id,
						{
							creatorId: 'owner',
							adminIds: ['realDeputy'],
							memVerList: memberIds.map((id) => `${id}_1`),
						},
					]),
				),
			};
		}),
	} as unknown as API;

	const dataPath = path.join(tempDir, 'permissions.json');

	return { manager: new PermissionManager(dataPath, ['botAdmin'], api), api, dataPath };
}

describe('PermissionManager role priority', () => {
	it('keeps group owner above virtual deputy', async () => {
		const { manager } = await createManager();
		await manager.addVirtualDeputy('group1', 'owner');

		await expect(manager.getRoleLevel('group1', 'owner', true)).resolves.toBe(Role.Leader);
	});

	it('allows virtual deputies to manage as deputies', async () => {
		const { manager } = await createManager();
		await manager.addVirtualDeputy('group1', 'virtualDeputy');

		await expect(manager.getRoleLevel('group1', 'virtualDeputy', true)).resolves.toBe(
			Role.Deputy,
		);
	});

	it('keeps BotAdmin above group roles', async () => {
		const { manager } = await createManager();
		await manager.addVirtualDeputy('group1', 'botAdmin');

		await expect(manager.getRoleLevel('group1', 'botAdmin', true)).resolves.toBe(Role.BotAdmin);
	});

	it('requires virtual deputies to be current group members', async () => {
		const { manager, dataPath } = await createManager({ memberIds: ['owner'] });
		await fsp.writeFile(
			dataPath,
			JSON.stringify({
				users: {},
				deputies: {
					group1: ['staleDeputy'],
				},
			}),
		);
		await manager.load();

		await expect(manager.getRoleLevel('group1', 'staleDeputy', true)).resolves.toBe(
			Role.Member,
		);
		await expect(manager.addVirtualDeputy('group1', 'staleDeputy')).resolves.toBe(false);
	});

	it('applies registered role levels and explicit grants', async () => {
		const { manager } = await createManager();
		manager.registerPermission('test.member', Role.Member);
		manager.registerPermission('test.deputy', Role.Deputy);
		manager.registerPermission('test.leader', Role.Leader);
		manager.registerPermission('test.admin', Role.BotAdmin);

		await expect(manager.hasPermission('group1', 'member', true, 'test.member')).resolves.toBe(
			true,
		);
		await expect(
			manager.hasPermission('group1', 'realDeputy', true, 'test.deputy'),
		).resolves.toBe(true);
		await expect(
			manager.hasPermission('group1', 'realDeputy', true, 'test.leader'),
		).resolves.toBe(false);
		await expect(manager.hasPermission('group1', 'owner', true, 'test.leader')).resolves.toBe(
			true,
		);
		await expect(manager.hasPermission('group1', 'owner', true, 'test.admin')).resolves.toBe(
			false,
		);
		await expect(
			manager.hasPermission('direct', 'botAdmin', false, 'test.admin'),
		).resolves.toBe(true);

		await manager.grant('member', 'test.leader');
		await expect(manager.hasPermission('group1', 'member', true, 'test.leader')).resolves.toBe(
			true,
		);
	});

	it('awaits concurrent saves before returning', async () => {
		const { manager, dataPath } = await createManager();
		manager.registerPermission('alpha', Role.Member);
		manager.registerPermission('beta', Role.Member);

		await Promise.all([manager.grant('user', 'alpha'), manager.grant('user', 'beta')]);

		const raw = await fsp.readFile(dataPath, 'utf-8');
		const data = JSON.parse(raw) as { users: Record<string, string[]> };
		expect(data.users.user).toEqual(expect.arrayContaining(['alpha', 'beta']));
	});

	it('warns and denies grants for unknown permission nodes', async () => {
		const { manager } = await createManager();
		const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

		await expect(manager.grant('user', 'missing.permission')).resolves.toBe(false);
		expect(manager.getUserPermissions('user')).toEqual([]);
		expect(warnSpy).toHaveBeenCalledWith(
			'PermissionManager: Unknown permission node "missing.permission". Grant denied.',
		);

		await expect(manager.grant('user', '*')).resolves.toBe(false);
		expect(manager.getUserPermissions('user')).toEqual([]);
	});

	it('warns and denies unregistered permission nodes', async () => {
		const { manager, api } = await createManager();
		const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
		await manager.grant('botAdmin', '*');

		await expect(
			manager.hasPermission('group1', 'botAdmin', true, 'missing.permission'),
		).resolves.toBe(false);
		expect(warnSpy).toHaveBeenCalledWith(
			'PermissionManager: Unknown permission node "missing.permission". Denying access.',
		);
		expect(api.getGroupInfo).not.toHaveBeenCalled();
	});
});
