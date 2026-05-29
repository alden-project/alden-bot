import fsp from 'node:fs/promises';
import semver from 'semver';

export type UpdateStatus = 'available' | 'up-to-date' | 'ahead' | 'unavailable';

interface PackageJsonWithRepository {
	readonly repository?: string | { readonly url?: string };
}

interface GitHubReleaseAsset {
	readonly name: string;
	readonly browser_download_url: string;
}

interface GitHubReleaseResponse {
	readonly tag_name?: string;
	readonly html_url?: string;
	readonly published_at?: string;
	readonly prerelease?: boolean;
	readonly assets?: GitHubReleaseAsset[];
	readonly message?: string;
}

export interface ReleaseAssetPair {
	readonly assetName: string;
	readonly assetUrl: string;
	readonly checksumAssetName: string;
	readonly checksumUrl: string;
}

export interface UpdateRelease {
	readonly version: string;
	readonly tagName: string;
	readonly releaseUrl: string;
	readonly publishedAt?: string;
	readonly assets: GitHubReleaseAsset[];
}

export interface UpdateCheckResult {
	readonly status: UpdateStatus;
	readonly currentVersion: string;
	readonly latestVersion?: string;
	readonly release?: UpdateRelease;
	readonly error?: string;
}

export interface UpdateApplyPreparation {
	readonly check: UpdateCheckResult;
	readonly assets?: ReleaseAssetPair;
	readonly error?: 'missing-assets';
}

export interface RepositorySlug {
	readonly owner: string;
	readonly repo: string;
}

export interface UpdateServiceOptions {
	readonly packageJsonPath: string;
	readonly fetchImpl?: typeof fetch;
	readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

export class UpdateService {
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	public constructor(private readonly options: UpdateServiceOptions) {
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	public async check(currentVersion: string): Promise<UpdateCheckResult> {
		const normalizedCurrent = normalizeVersion(currentVersion);
		if (!normalizedCurrent) {
			return {
				status: 'unavailable',
				currentVersion,
				error: `Current version "${currentVersion}" is not valid semver.`,
			};
		}

		let repositoryUrl: string | null;
		try {
			repositoryUrl = await this.readRepositoryUrl();
		} catch (error) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: getErrorMessage(error),
			};
		}

		if (!repositoryUrl) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: 'package.json repository URL is missing.',
			};
		}

		const slug = parseGitHubRepositorySlug(repositoryUrl);
		if (!slug) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: `Unsupported repository URL: ${repositoryUrl}`,
			};
		}

		let release: UpdateRelease | null;
		try {
			release = await this.fetchLatestRelease(slug);
		} catch (error) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: getErrorMessage(error),
			};
		}

		if (!release) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: 'Latest GitHub Release is unavailable.',
			};
		}

		const latestVersion = normalizeVersion(release.tagName);
		if (!latestVersion) {
			return {
				status: 'unavailable',
				currentVersion: normalizedCurrent,
				error: `Latest release tag "${release.tagName}" is not valid semver.`,
			};
		}

		const comparison = semver.compare(latestVersion, normalizedCurrent);
		return {
			status: comparison > 0 ? 'available' : comparison === 0 ? 'up-to-date' : 'ahead',
			currentVersion: normalizedCurrent,
			latestVersion,
			release: {
				...release,
				version: latestVersion,
			},
		};
	}

	public async prepareApply(currentVersion: string): Promise<UpdateApplyPreparation> {
		const check = await this.check(currentVersion);
		if (check.status !== 'available' || !check.release) {
			return { check };
		}

		const assets = findReleaseAssetPair(check.release.assets);
		if (!assets) {
			return { check, error: 'missing-assets' };
		}

		return { check, assets };
	}

	private async readRepositoryUrl(): Promise<string | null> {
		const raw = await fsp.readFile(this.options.packageJsonPath, 'utf-8');
		const parsed = JSON.parse(raw) as PackageJsonWithRepository;
		const repository = parsed.repository;
		if (typeof repository === 'string') return repository;
		return repository?.url ?? null;
	}

	private async fetchLatestRelease(slug: RepositorySlug): Promise<UpdateRelease | null> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchImpl(
				`https://api.github.com/repos/${slug.owner}/${slug.repo}/releases/latest`,
				{
					headers: {
						Accept: 'application/vnd.github+json',
						'User-Agent': 'alden-bot-updater',
					},
					signal: controller.signal,
				},
			);

			if (!response.ok) return null;

			const body = (await response.json()) as GitHubReleaseResponse;
			if (!body.tag_name || !body.html_url) return null;

			return {
				version: body.tag_name,
				tagName: body.tag_name,
				releaseUrl: body.html_url,
				publishedAt: body.published_at,
				assets: body.assets ?? [],
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

export function normalizeVersion(version: string): string | null {
	return semver.valid(semver.clean(version));
}

export function parseGitHubRepositorySlug(repositoryUrl: string): RepositorySlug | null {
	const normalized = repositoryUrl.replace(/^git\+/, '').trim();
	const match = normalized.match(/github\.com[:/]([^/\s]+)\/([^/#?\s]+?)(?:\.git)?(?:[#?].*)?$/);
	if (!match) return null;

	const owner = match[1];
	const repo = match[2];
	if (!owner || !repo) return null;

	return { owner, repo };
}

export function findReleaseAssetPair(
	assets: readonly GitHubReleaseAsset[],
): ReleaseAssetPair | null {
	const zipAsset = assets.find((asset) => /\.zip$/i.test(asset.name));
	if (!zipAsset) return null;

	const checksumAsset =
		assets.find((asset) => asset.name === `${zipAsset.name}.sha256`) ??
		assets.find((asset) => asset.name === `${zipAsset.name}.sha256sum`) ??
		assets.find((asset) => /sha256(?:sums?)?(\.txt)?$/i.test(asset.name));

	if (!checksumAsset) return null;

	return {
		assetName: zipAsset.name,
		assetUrl: zipAsset.browser_download_url,
		checksumAssetName: checksumAsset.name,
		checksumUrl: checksumAsset.browser_download_url,
	};
}

export function formatReleaseDate(value: string | undefined): string {
	if (!value) return 'unknown';

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;

	return parsed.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
