import type { API, Credentials } from 'zca-js';

import { readJsonFileAsync, writeJsonFileAsync } from '@/utils/file';
import { isValidCredentials } from '@/utils/guards';
import logger from '@/shared/logger';

export class CredentialManager {
	public constructor(private readonly credentialsPath: string) {}

	public async load(): Promise<Credentials | null> {
		const data = await readJsonFileAsync<Partial<Credentials>>(this.credentialsPath);
		if (!data) return null;
		return isValidCredentials(data) ? data : null;
	}

	public async save(api: API): Promise<void> {
		const ctx = api.getContext();
		const credentials: Credentials = {
			cookie: ctx.cookie?.toJSON()?.cookies || [],
			imei: ctx.imei,
			userAgent: ctx.userAgent,
		};
		await writeJsonFileAsync(this.credentialsPath, credentials);
		logger.info(`Credentials saved to ${this.credentialsPath}`);
	}
}
