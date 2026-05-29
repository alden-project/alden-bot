import { CommandBase, CommandContext } from '@/core/command/Command';
import { RichTextParser } from '@/parser/RichTextParser';

const PER_PAGE = 5;

export class HelpCommand extends CommandBase {
	public constructor() {
		super({
			name: 'help',
			description: 'command.help.description',
			aliases: ['?', 'h'],
			cooldown: 3,
			permission: 'alden.command.help',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const commands = this.bot.commandManager.getAll();
		const prefix = this.bot.config.PREFIX;
		const { args } = ctx;

		if (args.length > 0) {
			const arg = args[0]!;
			const pageNum = Number.parseInt(arg, 10);

			if (!Number.isNaN(pageNum)) {
				await this.sendPage(ctx, commands, prefix, pageNum);
				return;
			}

			await this.sendDetail(ctx, arg);
			return;
		}

		await this.sendPage(ctx, commands, prefix, 1);
	}

	private async sendDetail(ctx: CommandContext, cmdName: string): Promise<void> {
		const commands = this.bot.commandManager.getAll();
		const cmd = commands.find(
			(command) => command.name === cmdName || command.aliases.includes(cmdName),
		);
		if (!cmd) {
			return ctx.reply(
				RichTextParser.parse(ctx.t('command.help.not_found', { command: cmdName })),
			);
		}

		const usage = cmd.resolveUsage(ctx.lang);
		const reply = ctx.t('command.help.detail', {
			command: cmd.name,
			desc: cmd.resolveDescription(ctx.lang),
			aliases: cmd.aliases.length > 0 ? cmd.aliases.join(', ') : 'None',
			cooldown: cmd.cooldown,
			usage: usage ? `${this.bot.config.PREFIX}${cmd.name} ${usage}` : '',
		});

		await ctx.reply(RichTextParser.parse(reply));
	}

	private async sendPage(
		ctx: CommandContext,
		allCommands: CommandBase[],
		prefix: string,
		page: number,
	): Promise<void> {
		const permitted: CommandBase[] = [];
		for (const cmd of allCommands) {
			const permNode = cmd.getPermission() || '';
			if (await ctx.hasPermission(permNode)) {
				permitted.push(cmd);
			}
		}

		const totalPages = Math.max(1, Math.ceil(permitted.length / PER_PAGE));
		const clampedPage = Math.max(1, Math.min(page, totalPages));
		const start = (clampedPage - 1) * PER_PAGE;
		const slice = permitted.slice(start, start + PER_PAGE);

		let reply = ctx.t('command.help.list_title');

		for (const cmd of slice) {
			reply += ctx.t('command.help.list_item', {
				prefix,
				name: cmd.name,
				desc: cmd.resolveDescription(ctx.lang),
			});
		}

		if (totalPages > 1) {
			const parts: string[] = [];
			if (clampedPage > 1) {
				parts.push(ctx.t('command.help.page_prev', { page: String(clampedPage - 1) }));
			}
			parts.push(
				ctx.t('command.help.page_info', {
					current: String(clampedPage),
					total: String(totalPages),
				}),
			);
			if (clampedPage < totalPages) {
				parts.push(ctx.t('command.help.page_next', { page: String(clampedPage + 1) }));
			}
			reply += '\n' + parts.join(' · ');
		}

		reply += ctx.t('command.help.usage');

		await ctx.reply(RichTextParser.parse(reply));
	}
}
