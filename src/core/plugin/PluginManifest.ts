import semver from 'semver';
import type { Role } from '@/core/permission/PermissionManager';

export interface PluginManifest {
	name: string;
	version: string;
	description: string;
	author: string;
	main: string;
	permissions?: Record<string, Role>;
	depend?: string[];
	softDepend?: string[];
	website?: string;
	apiVersion?: string;
	license?: string;
}

export interface PluginManifestValidationResult {
	readonly manifest: PluginManifest | null;
	readonly errors: string[];
}

const VALID_PLUGIN_NAME = /^[a-zA-Z0-9_-]+$/;
const VALID_ROLE_LEVELS = new Set([0, 1, 2, 3]);
const REQUIRED_STRING_FIELDS = ['name', 'version', 'description', 'author', 'main'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
}

export function validatePluginManifest(value: unknown): PluginManifestValidationResult {
	const errors: string[] = [];

	if (!isRecord(value)) {
		return { manifest: null, errors: ['plugin.json must contain a JSON object.'] };
	}

	for (const field of REQUIRED_STRING_FIELDS) {
		if (typeof value[field] !== 'string' || value[field].trim() === '') {
			errors.push(`"${field}" must be a non-empty string.`);
		}
	}

	if (typeof value.name === 'string' && !VALID_PLUGIN_NAME.test(value.name)) {
		errors.push('"name" may only contain letters, numbers, underscores, and hyphens.');
	}

	if (typeof value.version === 'string' && !semver.valid(value.version)) {
		errors.push('"version" must be a valid semver version.');
	}

	if (typeof value.apiVersion === 'string' && !semver.valid(value.apiVersion)) {
		errors.push('"apiVersion" must be a valid semver version when provided.');
	}

	if (value.depend !== undefined && !isStringArray(value.depend)) {
		errors.push('"depend" must be an array of non-empty strings when provided.');
	}

	if (value.softDepend !== undefined && !isStringArray(value.softDepend)) {
		errors.push('"softDepend" must be an array of non-empty strings when provided.');
	}

	if (value.permissions !== undefined) {
		if (!isRecord(value.permissions)) {
			errors.push('"permissions" must be an object when provided.');
		} else {
			for (const [node, level] of Object.entries(value.permissions)) {
				if (!node.trim()) {
					errors.push('"permissions" contains an empty permission node.');
				}
				if (typeof level !== 'number' || !VALID_ROLE_LEVELS.has(level)) {
					errors.push(`Permission "${node}" must use role level 0, 1, 2, or 3.`);
				}
			}
		}
	}

	if (errors.length > 0) {
		return { manifest: null, errors };
	}

	return { manifest: value as unknown as PluginManifest, errors };
}

export type PluginDescription = PluginManifest;
