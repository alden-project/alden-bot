import { stderr, stdout } from 'node:process';
import * as dotenv from 'dotenv';

import type { LogLevel } from '@/shared/logger';

dotenv.config({ quiet: true });

export interface EnvConfig {
	readonly ADMIN_IDS: string[];
	readonly BOT_PREFIX: string;
	readonly DEFAULT_LANGUAGE: string;
	readonly ENABLE_EVAL_COMMAND: boolean;
	readonly ENABLE_RELOAD_COMMAND: boolean;
	readonly LOG_LEVEL: LogLevel;
	readonly MESSAGE_QUEUE_DELAY: number;
	readonly REPLY_UNKNOWN_COMMAND: boolean;
}

export interface ParsedEnv {
	readonly config: EnvConfig;
	readonly warnings: string[];
}

const DEFAULTS = {
	BOT_PREFIX: '/',
	DEFAULT_LANGUAGE: 'vi',
	LOG_LEVEL: 'info' satisfies LogLevel,
	MESSAGE_QUEUE_DELAY: 500,
} as const;

const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function parseBoolean(value: string | undefined): boolean {
	return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseCsv(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function parseMessageQueueDelay(value: string | undefined, warnings: string[]): number {
	if (value === undefined || value.trim() === '') return DEFAULTS.MESSAGE_QUEUE_DELAY;

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		warnings.push(
			`MESSAGE_QUEUE_DELAY="${value}" is invalid. Falling back to ${DEFAULTS.MESSAGE_QUEUE_DELAY}.`,
		);
		return DEFAULTS.MESSAGE_QUEUE_DELAY;
	}

	return parsed;
}

function parseLogLevel(value: string | undefined, warnings: string[]): LogLevel {
	const normalized = (value || DEFAULTS.LOG_LEVEL).trim().toLowerCase();
	if (VALID_LOG_LEVELS.includes(normalized as LogLevel)) {
		return normalized as LogLevel;
	}

	warnings.push(
		`LOG_LEVEL="${value}" is invalid. Must be one of: ${VALID_LOG_LEVELS.join(', ')}. Falling back to "${DEFAULTS.LOG_LEVEL}".`,
	);
	return DEFAULTS.LOG_LEVEL;
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): ParsedEnv {
	const warnings: string[] = [];

	let botPrefix = source.BOT_PREFIX?.trim();
	if (!botPrefix) {
		botPrefix = DEFAULTS.BOT_PREFIX;
	}

	let defaultLanguage = source.DEFAULT_LANGUAGE?.trim();
	if (!defaultLanguage) {
		defaultLanguage = DEFAULTS.DEFAULT_LANGUAGE;
	}

	return {
		config: {
			ADMIN_IDS: parseCsv(source.ADMIN_IDS),
			BOT_PREFIX: botPrefix,
			DEFAULT_LANGUAGE: defaultLanguage,
			ENABLE_EVAL_COMMAND: parseBoolean(source.ENABLE_EVAL_COMMAND),
			ENABLE_RELOAD_COMMAND: parseBoolean(source.ENABLE_RELOAD_COMMAND),
			LOG_LEVEL: parseLogLevel(source.LOG_LEVEL, warnings),
			MESSAGE_QUEUE_DELAY: parseMessageQueueDelay(source.MESSAGE_QUEUE_DELAY, warnings),
			REPLY_UNKNOWN_COMMAND: parseBoolean(source.REPLY_UNKNOWN_COMMAND),
		},
		warnings,
	};
}

export const { config: ENV, warnings: ENV_WARNINGS } = parseEnv();

export function validateEnv(): void {
	const errors: string[] = [];

	for (const warning of ENV_WARNINGS) {
		stderr.write(`  Warning: ${warning}\n`);
	}

	if (errors.length > 0) {
		const width = Math.max(40, Math.floor((stdout.columns || 80) / 2));
		const list = errors.map((error) => `  - ${error}`).join('\n');
		throw new Error(
			`\n${'='.repeat(width)}\nEnvironment validation failed:\n\n${list}\n\nPlease check your .env file.\n${'='.repeat(width)}`,
		);
	}
}
