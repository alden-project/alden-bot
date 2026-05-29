import { CommandBase, CommandContext } from '@/core/command/Command';
import { RichTextParser } from '@/parser/RichTextParser';

export class PluginsCommand extends CommandBase {
	public constructor() {
		super({
			name: 'plugins',
			description: 'command.plugins.description',
			aliases: ['pl'],
			permission: 'alden.command.plugins',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const plugins = this.bot.pluginManager.getPlugins();
		if (plugins.size === 0) {
			await ctx.reply(ctx.t('command.plugins.empty'));
			return;
		}

		let reply = ctx.t('command.plugins.list_title', { count: plugins.size });

		for (const plugin of plugins.values()) {
			const { name, version, author } = plugin.description;
			reply += ctx.t('command.plugins.plugin_item', { name, version, author });
		}

		await ctx.reply(RichTextParser.parse(reply));
	}
}
