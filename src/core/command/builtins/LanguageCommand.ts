import { CommandBase, CommandContext } from '@/core/command/Command';

export class LanguageCommand extends CommandBase {
	public constructor() {
		super({
			name: 'language',
			description: 'command.language.description',
			aliases: ['lang'],
			cooldown: 3,
			usage: 'command.language.usage',
			permission: 'alden.command.language',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { message, args, lang } = ctx;
		const userId = message.data.uidFrom;

		if (args.length === 0) {
			const available = this.bot.getAvailableLanguages();
			await ctx.reply(
				ctx.t('command.language.current', { lang, available: available.join(', ') }),
			);
			return;
		}

		const newLang = args[0]!.toLowerCase();
		const available = this.bot.getAvailableLanguages();

		if (!available.includes(newLang)) {
			await ctx.reply(
				ctx.t('command.language.not_found', {
					lang: newLang,
					available: available.join(', '),
				}),
			);
			return;
		}

		await this.bot.setUserLanguage(userId, newLang);
		await ctx.reply(this.bot.i18n.get('command.language.changed', { lang: newLang }, newLang));
	}
}
