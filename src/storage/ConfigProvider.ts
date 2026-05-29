import path from 'node:path';
import { ensureDirAsync, readJsonFileAsync, writeJsonFileAsync } from '@/utils/file';
import logger from '@/shared/logger';

export class ConfigProvider<T extends Record<string, unknown>> {
	private data!: T;

	public constructor(
		private readonly filePath: string,
		private readonly defaultData: T,
	) {}

	public async load(): Promise<void> {
		await ensureDirAsync(path.dirname(this.filePath));
		let parsed: Partial<T> | null;
		try {
			parsed = await readJsonFileAsync<Partial<T>>(this.filePath);
		} catch (error) {
			logger.error(`ConfigProvider: Failed to load config from ${this.filePath}`, error);
			throw error;
		}

		if (!parsed) {
			logger.debug(
				`ConfigProvider: File not found or empty at ${this.filePath}, creating default.`,
			);
			this.data = { ...this.defaultData };
			await this.save();
			return;
		}

		this.data = { ...this.defaultData, ...parsed };
	}

	public async save(): Promise<void> {
		try {
			await writeJsonFileAsync(this.filePath, this.data);
		} catch (error) {
			logger.error(`ConfigProvider: Failed to save config to ${this.filePath}`, error);
			throw error;
		}
	}

	public get<K extends keyof T>(key: K): T[K] {
		return this.data[key];
	}

	public async set<K extends keyof T>(
		key: K,
		value: T[K],
		saveImmediately = true,
	): Promise<void> {
		this.data[key] = value;
		if (saveImmediately) {
			await this.save();
		}
	}

	public getAll(): T {
		return { ...this.data };
	}
}
