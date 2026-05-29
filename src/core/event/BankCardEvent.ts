import type { Message } from 'zca-js';

import type { BankCardData } from '@/parser/contentParser';

import { Event } from './Event';

export interface BankCardDetails {
	bankName: string;
	accountNumber: string;
	accountHolder: string;
	bin: string;
	bankLogoUrl: string;
}

const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const ALLOWED_HOST_SUFFIXES = ['.zadn.vn', '.zalo.me', '.zaloapp.com'];
const DISALLOWED_ACCOUNT_HOLDER_CHARS = ['[', ']', '{', '}', '"', '_', '=', '/', '\\'];

export class BankCardEvent extends Event {
	public static readonly eventType = 'alden-bot:bank-card';

	constructor(
		public readonly message: Message,
		public readonly bankCard: BankCardData,
	) {
		super();
	}

	public async fetchDetails(): Promise<BankCardDetails> {
		const empty: BankCardDetails = {
			bankName: '',
			accountNumber: '',
			accountHolder: '',
			bin: '',
			bankLogoUrl: '',
		};

		if (!this.bankCard.dataUrl) return empty;
		if (!isAllowedBankCardUrl(this.bankCard.dataUrl)) return empty;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(this.bankCard.dataUrl, { signal: controller.signal });
			if (!response.ok) return empty;

			const text = await readLimitedResponseText(response);
			if (text === null) return empty;

			const { bin, accountNumber } = extractQrDetails(text);
			const textParts = extractReadableTextParts(text);
			const bankName = findBankName(textParts);
			const accountHolder = findAccountHolder(textParts, accountNumber, bankName);
			const bankLogoUrl = findBankLogoUrl(text);

			return { bankName, accountNumber, accountHolder, bin, bankLogoUrl };
		} catch {
			return empty;
		} finally {
			clearTimeout(timeout);
		}
	}
}

function extractQrDetails(text: string): Pick<BankCardDetails, 'bin' | 'accountNumber'> {
	const qrMatch = text.match(/content=(000201[\w]+)/);
	const qrContent = qrMatch?.[1] ?? '';
	const binResult = /0006(\d{6,7})01/.exec(qrContent);
	if (!binResult?.[1]) return { bin: '', accountNumber: '' };

	const bin = binResult[1];
	const afterTag = qrContent.slice(binResult.index + binResult[0].length);
	const accountNumberLength = Number.parseInt(afterTag.slice(0, 2), 10);
	if (!Number.isInteger(accountNumberLength) || accountNumberLength <= 0) {
		return { bin, accountNumber: '' };
	}

	return {
		bin,
		accountNumber: afterTag.slice(2, 2 + accountNumberLength),
	};
}

function extractReadableTextParts(text: string): string[] {
	return replaceControlChars(text)
		.split(/\0+/)
		.map((s) => s.trim())
		.filter((s) => s.length >= 2 && /[\p{L}\p{N}]/u.test(s));
}

function replaceControlChars(text: string): string {
	let result = '';
	for (let i = 0; i < text.length; i += 1) {
		const code = text.charCodeAt(i);
		result += code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? '\0' : text[i];
	}
	return result;
}

function findBankName(textParts: string[]): string {
	return textParts.find(isBankNamePart) ?? '';
}

function isBankNamePart(value: string): boolean {
	const normalized = normalizeSearchValue(value);
	return normalized.includes('ngan hang') || (value.includes('NgA') && value.includes('hA'));
}

function findAccountHolder(textParts: string[], accountNumber: string, bankName: string): string {
	if (!accountNumber) return '';

	const accountIndex = textParts.findIndex((s) => s === accountNumber);
	if (accountIndex === -1) return '';

	const bankIndex = bankName ? textParts.findIndex((s) => s === bankName) : -1;
	const candidateGroups: string[][] = [
		textParts.slice(Math.max(0, accountIndex - 8), accountIndex).reverse(),
	];

	if (bankIndex > accountIndex) {
		candidateGroups.push(textParts.slice(accountIndex + 1, bankIndex));
	}

	candidateGroups.push(textParts.slice(accountIndex + 1, accountIndex + 6));

	for (const candidates of candidateGroups) {
		const accountHolder = candidates.find(isLikelyAccountHolder);
		if (accountHolder) return accountHolder;
	}

	return '';
}

function isLikelyAccountHolder(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.length < 3 || trimmed.length > 100) return false;
	if (!/\p{L}/u.test(trimmed)) return false;
	if (/[\d\uFFFD]/u.test(trimmed)) return false;
	if (/https?:|button|bank|sender|receiver|transfer|save/i.test(trimmed)) {
		return false;
	}
	if (DISALLOWED_ACCOUNT_HOLDER_CHARS.some((char) => trimmed.includes(char))) {
		return false;
	}
	if (trimmed !== trimmed.toLocaleUpperCase('vi-VN')) return false;
	return /^[\p{Lu}\p{M}\s'.&-]+$/u.test(trimmed);
}

function findBankLogoUrl(text: string): string {
	const logoMatch = text.match(
		/(https:\/\/res-zalo\.zadn\.vn\/upload\/media\/[\w./-]+_LOGO_[\w.-]+)/,
	);
	return logoMatch?.[1] ?? '';
}

function normalizeSearchValue(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function isAllowedBankCardUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}

	if (url.protocol !== 'https:') return false;
	const hostname = url.hostname.toLowerCase();
	return ALLOWED_HOST_SUFFIXES.some(
		(suffix) => hostname.endsWith(suffix) || hostname === suffix.slice(1),
	);
}

async function readLimitedResponseText(response: Response): Promise<string | null> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) return null;

	if (!response.body) {
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > MAX_RESPONSE_BYTES) return null;
		return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			totalBytes += value.byteLength;
			if (totalBytes > MAX_RESPONSE_BYTES) {
				await reader.cancel().catch(() => undefined);
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const buffer = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}
