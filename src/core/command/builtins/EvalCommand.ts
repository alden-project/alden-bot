import vm from 'node:vm';
import { CommandBase, CommandContext } from '@/core/command/Command';
import { inspect } from 'node:util';

export class EvalCommand extends CommandBase {
	public constructor() {
		super({
			name: 'eval',
			description: 'command.eval.description',
			usage: 'command.eval.usage',
			permission: 'alden.command.eval',
		});
	}

	public async execute(cmdCtx: CommandContext): Promise<void> {
		const { message, args, lang } = cmdCtx;
		const code = args.join(' ');
		if (!code) {
			await cmdCtx.reply(cmdCtx.t('command.eval.no_code'));
			return;
		}

		try {
			let result = vm.runInNewContext(
				code,
				{
					ctx: {
						this: this,
						message,
						args,
						lang,
					},
					cmdCtx,
				},
				{ timeout: 15000 },
			);
			if (result instanceof Promise) {
				result = await result;
			}

			const raw = typeof result === 'string' ? result : inspect(result);
			const output = raw.length > 2000 ? raw.slice(0, 2000) + '\n... (truncated)' : raw;
			await cmdCtx.reply(cmdCtx.t('command.eval.success', { output }));
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			await cmdCtx.reply(cmdCtx.t('command.eval.error', { error: errMsg }));
		}
	}
}
