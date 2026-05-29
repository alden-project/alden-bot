import fsp from 'node:fs/promises';
import path from 'node:path';
import logger from '@/shared/logger';

export interface I18nManagerOptions {
	readonly label?: string;
	readonly warnOnMissingKey?: boolean;
}

export class I18nManager {
	private readonly locales = new Map<string, Record<string, string>>();
	public defaultLocale: string;
	private readonly label: string;
	private readonly warnOnMissingKey: boolean;

	public constructor(
		private readonly localesDir: string,
		defaultLocale = 'vi',
		options: I18nManagerOptions = {},
	) {
		this.defaultLocale = defaultLocale;
		this.label = options.label ?? 'I18nManager';
		this.warnOnMissingKey = options.warnOnMissingKey ?? true;
	}

	public async loadLocales(): Promise<void> {
		try {
			await fsp.access(this.localesDir);
		} catch {
			logger.warn(`${this.label}: Locales directory not found at ${this.localesDir}`);
			return;
		}

		try {
			const files = (await fsp.readdir(this.localesDir)).filter((f) => f.endsWith('.json'));
			for (const file of files) {
				const localeName = file.replace('.json', '');
				try {
					const raw = await fsp.readFile(path.join(this.localesDir, file), 'utf-8');
					const parsed = JSON.parse(raw);
					const flattened = this.flattenObject(parsed);
					this.locales.set(localeName, flattened);
					logger.debug(`${this.label}: Loaded locale "${localeName}"`);
				} catch (error) {
					logger.error(`${this.label}: Failed to load locale file ${file}`, error);
				}
			}
		} catch (error) {
			logger.error(`${this.label}: Failed to read locales directory`, error);
		}
	}

	private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
		return Object.keys(obj).reduce((acc: Record<string, string>, k: string) => {
			const pre = prefix.length ? prefix + '.' : '';
			const val = obj[k];
			if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
				Object.assign(acc, this.flattenObject(val as Record<string, unknown>, pre + k));
			} else {
				acc[pre + k] = String(val);
			}
			return acc;
		}, {});
	}

	public get(
		key: string,
		variables: Record<string, string | number> = {},
		locale?: string,
	): string {
		const targetLocale = locale ?? this.defaultLocale;
		const strings = this.locales.get(targetLocale);

		let str = strings?.[key];
		if (str === undefined && targetLocale !== this.defaultLocale) {
			const fallbackStrings = this.locales.get(this.defaultLocale);
			str = fallbackStrings?.[key];
		}

		if (str === undefined) {
			if (this.warnOnMissingKey) {
				logger.warn(
					`${this.label}: Missing i18n key "${key}" for locale "${targetLocale}"`,
				);
			}
			str = key;
		}

		for (const [k, v] of Object.entries(variables)) {
			str = str.replaceAll(`{${k}}`, String(v));
		}

		return str;
	}

	public has(key: string, locale?: string): boolean {
		const targetLocale = locale ?? this.defaultLocale;
		const strings = this.locales.get(targetLocale);
		if (strings?.[key] !== undefined) return true;
		if (targetLocale !== this.defaultLocale) {
			const fallbackStrings = this.locales.get(this.defaultLocale);
			return fallbackStrings?.[key] !== undefined;
		}
		return false;
	}

	public getLoadedLocales(): string[] {
		return Array.from(this.locales.keys());
	}
}
