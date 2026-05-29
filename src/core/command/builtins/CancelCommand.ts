import { CommandBase, CommandContext } from '@/core/command/Command';

export class CancelCommand extends CommandBase {
	public constructor() {
		super({
			name: 'cancel',
			description: 'command.cancel.description',
			aliases: ['c', 'stop'],
			permission: 'alden.command.cancel',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { message } = ctx;
		const cancelled = this.bot.sessionManager.cancelSessionByUser(
			message.threadId,
			message.data.uidFrom,
		);

		if (cancelled) {
			await ctx.reply(ctx.t('command.cancel.success'));
		} else {
			await ctx.reply(ctx.t('command.cancel.empty'));
		}
	}
}
