import { readJsonFileAsync, writeJsonFileAsync } from '@/utils/file';
import logger from '@/shared/logger';
import type { API } from 'zca-js';

export enum Role {
	Member = 0,
	Deputy = 1,
	Leader = 2,
	BotAdmin = 3,
}

export class PermissionManager {
	private userPermissions = new Map<string, Set<string>>();
	private virtualDeputies = new Map<string, Set<string>>();
	private permissionRoles = new Map<string, Role>();

	private groupCache = new Map<
		string,
		{ creatorId: string; adminIds: string[]; memberIds: string[] }
	>();
	private cacheTimers = new Map<string, NodeJS.Timeout>();
	private inflightRequests = new Map<string, Promise<void>>();

	private static readonly CACHE_TTL = 10 * 60 * 1000;

	public constructor(
		private readonly dataPath: string,
		private readonly adminIds: string[],
		private readonly api: API,
	) {}

	public stopCacheCleanup(): void {
		for (const timer of this.cacheTimers.values()) {
			clearTimeout(timer);
		}
		this.cacheTimers.clear();
		this.groupCache.clear();
	}

	public registerPermission(permission: string, level: Role): void {
		this.permissionRoles.set(permission, level);
	}

	public unregisterPermission(permission: string): void {
		this.permissionRoles.delete(permission);
	}

	public getPermissionRole(permission: string): Role {
		return this.permissionRoles.get(permission) ?? Role.Member;
	}

	public getAllPermissions(): string[] {
		return Array.from(this.permissionRoles.keys());
	}

	public async load(): Promise<void> {
		const data = await readJsonFileAsync<{
			users: Record<string, string[]>;
			deputies: Record<string, string[]>;
		}>(this.dataPath);

		if (!data) {
			logger.info('No permissions file found, starting fresh.');
			return;
		}

		this.userPermissions.clear();
		if (data.users) {
			for (const [userId, perms] of Object.entries(data.users)) {
				this.userPermissions.set(userId, new Set(perms));
			}
		}

		this.virtualDeputies.clear();
		if (data.deputies) {
			for (const [threadId, users] of Object.entries(data.deputies)) {
				this.virtualDeputies.set(threadId, new Set(users));
			}
		}
		logger.info('Loaded permissions and virtual roles.');
	}

	public async save(): Promise<void> {
		const users: Record<string, string[]> = {};
		for (const [userId, perms] of this.userPermissions.entries()) {
			if (perms.size > 0) users[userId] = Array.from(perms);
		}

		const deputies: Record<string, string[]> = {};
		for (const [threadId, usersSet] of this.virtualDeputies.entries()) {
			if (usersSet.size > 0) deputies[threadId] = Array.from(usersSet);
		}

		await writeJsonFileAsync(this.dataPath, { users, deputies });
	}

	public async getRoleLevel(threadId: string, userId: string, isGroup: boolean): Promise<Role> {
		if (this.adminIds.includes(userId)) return Role.BotAdmin;

		if (!isGroup) return Role.Member;

		const cached = await this.getCachedGroupInfo(threadId);

		if (cached) {
			if (cached.creatorId === userId) return Role.Leader;
			if (cached.adminIds.includes(userId)) return Role.Deputy;
		}

		const vDeputies = this.virtualDeputies.get(threadId);
		if (vDeputies?.has(userId) && cached?.memberIds.includes(userId)) return Role.Deputy;

		return Role.Member;
	}

	private async getCachedGroupInfo(
		threadId: string,
	): Promise<{ creatorId: string; adminIds: string[]; memberIds: string[] } | undefined> {
		let cached = this.groupCache.get(threadId);

		if (!cached) {
			let inflight = this.inflightRequests.get(threadId);
			if (!inflight) {
				inflight = this.fetchAndCacheGroupInfo(threadId);
				this.inflightRequests.set(threadId, inflight);
			}
			await inflight;
			this.inflightRequests.delete(threadId);
			cached = this.groupCache.get(threadId);
		}

		return cached;
	}

	private async fetchAndCacheGroupInfo(threadId: string): Promise<void> {
		try {
			const info = await this.api.getGroupInfo(threadId);
			const groupInfo = info.gridInfoMap[threadId];
			if (groupInfo) {
				this.groupCache.set(threadId, {
					creatorId: groupInfo.creatorId,
					adminIds: groupInfo.adminIds || [],
					memberIds: mapMemberIds(groupInfo.memVerList),
				});

				const existingTimer = this.cacheTimers.get(threadId);
				if (existingTimer) clearTimeout(existingTimer);

				const timer = setTimeout(() => {
					this.groupCache.delete(threadId);
					this.cacheTimers.delete(threadId);
				}, PermissionManager.CACHE_TTL);
				timer.unref?.();
				this.cacheTimers.set(threadId, timer);
			}
		} catch (error) {
			logger.warn(`Failed to fetch thread info for ${threadId}`, error);
		}
	}

	public async hasPermission(
		threadId: string,
		userId: string,
		isGroup: boolean,
		permission: string,
	): Promise<boolean> {
		const requiredLevel = this.permissionRoles.get(permission);
		if (requiredLevel === undefined) {
			logger.warn(
				`PermissionManager: Unknown permission node "${permission}". Denying access.`,
			);
			return false;
		}

		const perms = this.userPermissions.get(userId);
		if (perms && (perms.has('*') || perms.has(permission))) return true;

		const userLevel = await this.getRoleLevel(threadId, userId, isGroup);
		return userLevel >= requiredLevel;
	}

	public async grant(userId: string, permission: string): Promise<boolean> {
		if (!this.permissionRoles.has(permission)) {
			logger.warn(
				`PermissionManager: Unknown permission node "${permission}". Grant denied.`,
			);
			return false;
		}

		let perms = this.userPermissions.get(userId);
		if (!perms) {
			perms = new Set<string>();
			this.userPermissions.set(userId, perms);
		}
		if (perms.has(permission)) return false;
		perms.add(permission);
		await this.save();
		return true;
	}

	public async revoke(userId: string, permission: string): Promise<boolean> {
		const perms = this.userPermissions.get(userId);
		if (!perms || !perms.has(permission)) return false;
		perms.delete(permission);
		if (perms.size === 0) this.userPermissions.delete(userId);
		await this.save();
		return true;
	}

	public getUserPermissions(userId: string): string[] {
		if (this.adminIds.includes(userId)) return ['*'];
		return Array.from(this.userPermissions.get(userId) ?? []);
	}

	public async addVirtualDeputy(threadId: string, userId: string): Promise<boolean> {
		const groupInfo = await this.getCachedGroupInfo(threadId);
		if (!groupInfo?.memberIds.includes(userId)) {
			logger.warn(
				`PermissionManager: Cannot add virtual deputy "${userId}" because they are not a current member of "${threadId}".`,
			);
			return false;
		}

		let deps = this.virtualDeputies.get(threadId);
		if (!deps) {
			deps = new Set();
			this.virtualDeputies.set(threadId, deps);
		}
		if (deps.has(userId)) return false;
		deps.add(userId);
		await this.save();
		return true;
	}

	public async removeVirtualDeputy(threadId: string, userId: string): Promise<boolean> {
		const deps = this.virtualDeputies.get(threadId);
		if (!deps || !deps.has(userId)) return false;
		deps.delete(userId);
		if (deps.size === 0) this.virtualDeputies.delete(threadId);
		await this.save();
		return true;
	}

	public isVirtualDeputy(threadId: string, userId: string): boolean {
		return this.virtualDeputies.get(threadId)?.has(userId) ?? false;
	}
}

function mapMemberIds(memVerList: unknown): string[] {
	if (!Array.isArray(memVerList)) return [];

	return memVerList
		.map((entry) => {
			const [uid = ''] = String(entry).split('_');
			return uid;
		})
		.filter((uid) => uid.length > 0);
}
