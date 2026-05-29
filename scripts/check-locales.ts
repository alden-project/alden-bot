import fsp from 'node:fs/promises';
import path from 'node:path';

import { PATH } from '@/config/constants';

function flattenKeys(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return prefix ? [prefix] : [];
	}

	const keys: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		const nextPrefix = prefix ? `${prefix}.${key}` : key;
		keys.push(...flattenKeys(child, nextPrefix));
	}
	return keys;
}

async function readLocale(locale: string): Promise<Set<string>> {
	const filePath = path.join(PATH.LOCALES_DIR, `${locale}.json`);
	const raw = await fsp.readFile(filePath, 'utf-8');
	return new Set(flattenKeys(JSON.parse(raw)));
}

function getMissingKeys(source: Set<string>, target: Set<string>): string[] {
	return [...source].filter((key) => !target.has(key)).sort();
}

const viKeys = await readLocale('vi');
const enKeys = await readLocale('en');

const missingInEn = getMissingKeys(viKeys, enKeys);
const missingInVi = getMissingKeys(enKeys, viKeys);

if (missingInEn.length > 0 || missingInVi.length > 0) {
	if (missingInEn.length > 0) {
		console.error(`Missing ${missingInEn.length} key(s) in en.json:`);
		for (const key of missingInEn) console.error(`  - ${key}`);
	}

	if (missingInVi.length > 0) {
		console.error(`Missing ${missingInVi.length} key(s) in vi.json:`);
		for (const key of missingInVi) console.error(`  - ${key}`);
	}

	process.exitCode = 1;
} else {
	console.log(`Locale parity OK (${viKeys.size} keys).`);
}
