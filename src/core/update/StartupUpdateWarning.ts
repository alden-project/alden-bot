import type { AldenBot } from '@/core/AldenBot';
import { PATH } from '@/config/constants';
import { UpdateService } from '@/core/update/UpdateService';

export function scheduleStartupUpdateWarning(bot: AldenBot): void {
	const timer = setTimeout(() => {
		const service = new UpdateService({ packageJsonPath: PATH.PACKAGE_JSON });
		bot.logger.info('Checking for alden-bot updates...');

		service
			.check(bot.config.version)
			.then((result) => {
				if (result.status === 'available' && result.latestVersion && result.release) {
					bot.logger.warn(
						`alden-bot update available: v${result.currentVersion} -> v${result.latestVersion}. ` +
							`Use /update for details. Release: ${result.release.releaseUrl}`,
					);
					return;
				}

				if (result.status === 'up-to-date') {
					bot.logger.info(`alden-bot is up to date (v${result.currentVersion}).`);
					return;
				}

				if (result.status === 'ahead') {
					bot.logger.info(
						`alden-bot is ahead of the latest release: v${result.currentVersion} > ` +
							`v${result.latestVersion ?? 'unknown'}.`,
					);
					return;
				}

				bot.logger.warn(
					`alden-bot update check unavailable: ${result.error ?? 'unknown reason'}.`,
				);
			})
			.catch((error) => {
				bot.logger.warn('alden-bot update check failed', error);
			});
	}, 0);

	timer.unref?.();
}
