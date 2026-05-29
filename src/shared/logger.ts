import fsp from 'node:fs/promises';
import path from 'node:path';

import { ENV } from '@/config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
	debug: '\x1b[90m',
	info: '\x1b[36m',
	warn: '\x1b[33m',
	error: '\x1b[31m',
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function formatTimestamp(): string {
	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, '0');

	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
	const offset = -now.getTimezoneOffset();
	const sign = offset >= 0 ? '+' : '-';
	const tzH = pad(Math.floor(Math.abs(offset) / 60));
	const tzM = pad(Math.abs(offset) % 60);

	return `${date} ${time} ${sign}${tzH}${tzM}`;
}

function getDateString(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

let logsDir: string | undefined;
const fileBuffer: string[] = [];
let activeFlush: Promise<void> | undefined;

function appendToFile(line: string): void {
	if (!logsDir) return;
	fileBuffer.push(line);
	scheduleFlush();
}

function scheduleFlush(): void {
	activeFlush ??= flushBuffer().finally(() => {
		activeFlush = undefined;
		if (fileBuffer.length > 0) scheduleFlush();
	});
}

async function flushBuffer(): Promise<void> {
	try {
		while (fileBuffer.length > 0) {
			const lines = fileBuffer.splice(0);
			const content = `${lines.join('\n')}\n`;
			const filePath = path.join(logsDir!, `bot-${getDateString()}.log`);
			await fsp.mkdir(logsDir!, { recursive: true });
			await fsp.appendFile(filePath, content, 'utf-8');
		}
	} catch {
		fileBuffer.length = 0;
	}
}

class Logger {
	private readonly minLevel: number;
	private readonly prefix: string;

	public constructor(level: LogLevel = 'info', prefix = '') {
		this.minLevel = LEVEL_PRIORITY[level];
		this.prefix = prefix;
	}

	public static enableFileOutput(dir: string): void {
		logsDir = dir;
	}

	public static async flush(): Promise<void> {
		if (activeFlush) await activeFlush;
		if (fileBuffer.length > 0) await flushBuffer();
	}

	public child(prefix: string): Logger {
		const combined = this.prefix ? `${this.prefix} > ${prefix}` : prefix;
		const levelName = (Object.entries(LEVEL_PRIORITY).find(
			([, value]) => value === this.minLevel,
		)?.[0] ?? 'info') as LogLevel;
		return new Logger(levelName, combined);
	}

	public debug(...args: unknown[]): void {
		this.log('debug', ...args);
	}

	public info(...args: unknown[]): void {
		this.log('info', ...args);
	}

	public warn(...args: unknown[]): void {
		this.log('warn', ...args);
	}

	public error(...args: unknown[]): void {
		this.log('error', ...args);
	}

	private log(level: LogLevel, ...args: unknown[]): void {
		if (LEVEL_PRIORITY[level] < this.minLevel) return;

		const color = LEVEL_COLORS[level];
		const ts = formatTimestamp();
		const timestamp = `${DIM}[${ts}]${RESET}`;
		const tag = `${color}${level.toUpperCase().padEnd(5)}${RESET}`;
		const prefixStr = this.prefix ? ` ${DIM}[${this.prefix}]${RESET}` : '';

		console.log(`${timestamp} ${tag} :${prefixStr}`, ...args);

		if (logsDir) {
			const plainPrefix = this.prefix ? ` [${this.prefix}]` : '';
			const argsStr = args
				.map((arg) => {
					if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
					if (typeof arg === 'string') return arg.replace(ANSI_REGEX, '');
					try {
						return JSON.stringify(arg);
					} catch {
						return String(arg);
					}
				})
				.join(' ');
			appendToFile(`[${ts}] ${level.toUpperCase().padEnd(5)} :${plainPrefix} ${argsStr}`);
		}
	}
}

const logger = new Logger(ENV.LOG_LEVEL);

export { Logger };
export default logger;
