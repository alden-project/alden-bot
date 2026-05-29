import { CommandBase, CommandContext } from '@/core/command/Command';

export class PingCommand extends CommandBase {
	public constructor() {
		super({
			name: 'ping',
			description: 'command.ping.description',
			aliases: ['p'],
			cooldown: 3,
			permission: 'alden.command.ping',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { message, lang } = ctx;
		const start = Date.now();
		await this.bot.api.sendMessage(
			{ msg: this.t('command.ping.pinging', {}, lang) },
			message.threadId,
			message.type,
		);
		const latency = Date.now() - start;
		await this.bot.sendMessage(
			{ msg: this.t('command.ping.result', { latency }, lang) },
			message.threadId,
			message.type,
		);
	}
}
