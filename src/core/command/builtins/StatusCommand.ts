import os from 'node:os';
import { CommandBase, CommandContext } from '@/core/command/Command';
import { RichTextParser } from '@/parser/RichTextParser';
import { formatUptime } from '@/utils/format';

export class StatusCommand extends CommandBase {
	public constructor() {
		super({
			name: 'status',
			description: 'command.status.description',
			aliases: ['stats', 'info'],
			permission: 'alden.command.status',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const memoryUsage = process.memoryUsage();
		const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);
		const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
		const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

		const uptimeSeconds = process.uptime();
		const uptimeStr = formatUptime(uptimeSeconds);

		const osUptimeStr = formatUptime(os.uptime());
		const freeMemMB = (os.freemem() / 1024 / 1024).toFixed(2);
		const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(2);

		const reply = ctx.t('command.status.info', {
			version: this.bot.config.version,
			uptime: uptimeStr,
			osUptime: osUptimeStr,
			rss: rssMB,
			heapTotal: heapTotalMB,
			heapUsed: heapUsedMB,
			freeMem: freeMemMB,
			totalMem: totalMemMB,
			osType: os.type(),
			osRelease: os.release(),
			osArch: os.arch(),
			nodeVersion: process.version,
			cpu: os.cpus()[0]?.model || 'Unknown',
		});

		await ctx.reply(RichTextParser.parse(reply));
	}
}
