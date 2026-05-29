import { CommandBase, CommandContext } from '@/core/command/Command';
import { PATH } from '@/config/constants';

export class ReloadCommand extends CommandBase {
	public constructor() {
		super({
			name: 'reload',
			description: 'command.reload.description',
			aliases: ['rl'],
			usage: 'command.reload.usage',
			permission: 'alden.command.reload',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		await ctx.reply(ctx.t('command.reload.reloading_all'));

		try {
			await this.bot.pluginManager.unloadAll();
			await this.bot.pluginManager.loadAll(PATH.PLUGINS_DIR);
			await this.bot.pluginManager.enableAll();

			const count = this.bot.pluginManager.getPlugins().size;
			await ctx.reply(ctx.t('command.reload.success_all', { count }));
		} catch (error) {
			this.logger.error('Failed to reload plugins', error);

			await ctx.reply(ctx.t('command.reload.failed'));
		}
	}
}
