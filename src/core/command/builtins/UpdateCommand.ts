import { CommandBase, CommandContext } from '@/core/command/Command';
import { PATH } from '@/config/constants';
import {
	AWAKE_EXIT_CODE,
	createLauncherRequest,
	isDockerRuntime,
	isLauncherManaged,
	sendLauncherRequest,
	writeLauncherRequest,
} from '@/core/update/RestartProtocol';
import { formatReleaseDate, UpdateService } from '@/core/update/UpdateService';

export class UpdateCommand extends CommandBase {
	public constructor() {
		super({
			name: 'update',
			description: 'command.update.description',
			usage: 'command.update.usage',
			permission: 'alden.command.update',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { args } = ctx;
		const action = args[0]?.toLowerCase() ?? 'check';
		if (action !== 'check' && action !== 'apply') {
			await ctx.reply(ctx.t('command.update.invalid_usage'));
			return;
		}

		if (action === 'apply') {
			await this.applyUpdate(ctx);
			return;
		}

		await this.checkUpdate(ctx);
	}

	private async checkUpdate(ctx: CommandContext) {
		const result = await new UpdateService({ packageJsonPath: PATH.PACKAGE_JSON }).check(
			this.bot.config.version,
		);

		await ctx.reply(this.formatCheckResult(result, ctx));
	}

	private async applyUpdate(ctx: CommandContext) {
		if (isDockerRuntime()) {
			await ctx.reply(ctx.t('command.update.apply_unsupported_docker'));
			return;
		}

		if (!isLauncherManaged()) {
			await ctx.reply(ctx.t('command.update.apply_requires_launcher'));
			return;
		}

		const preparation = await new UpdateService({
			packageJsonPath: PATH.PACKAGE_JSON,
		}).prepareApply(this.bot.config.version);

		if (preparation.check.status !== 'available' || !preparation.check.release) {
			await ctx.reply(this.formatCheckResult(preparation.check, ctx));
			return;
		}

		if (!preparation.assets) {
			await ctx.reply(
				ctx.t('command.update.apply_missing_assets', {
					version: preparation.check.latestVersion ?? 'unknown',
				}),
			);
			return;
		}

		const request = createLauncherRequest('update', {
			reason: 'update command',
			release: {
				version: preparation.check.release.version,
				tagName: preparation.check.release.tagName,
				releaseUrl: preparation.check.release.releaseUrl,
				assetName: preparation.assets.assetName,
				assetUrl: preparation.assets.assetUrl,
				checksumAssetName: preparation.assets.checksumAssetName,
				checksumUrl: preparation.assets.checksumUrl,
			},
		});

		await writeLauncherRequest(request);
		sendLauncherRequest(request);

		await ctx.reply(
			ctx.t('command.update.apply_started', { version: preparation.check.release.version }),
		);

		this.logger.info(
			`Update command requested v${preparation.check.release.version}. Triggering AWAKE restart...`,
		);
		process.exitCode = AWAKE_EXIT_CODE;
		setTimeout(() => {
			process.emit('SIGTERM');
		}, 1000);
	}

	private formatCheckResult(
		result: Awaited<ReturnType<UpdateService['check']>>,
		ctx: CommandContext,
	): string {
		switch (result.status) {
			case 'available':
				return ctx.t('command.update.available', {
					current: result.currentVersion,
					latest: result.latestVersion ?? 'unknown',
					date: formatReleaseDate(result.release?.publishedAt),
					url: result.release?.releaseUrl ?? 'unknown',
				});
			case 'up-to-date':
				return ctx.t('command.update.up_to_date', { current: result.currentVersion });
			case 'ahead':
				return ctx.t('command.update.ahead', {
					current: result.currentVersion,
					latest: result.latestVersion ?? 'unknown',
				});
			case 'unavailable':
				return ctx.t('command.update.unavailable', { reason: result.error ?? 'unknown' });
		}
	}
}
