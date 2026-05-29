import { ThreadType } from 'zca-js';
import { CommandBase, CommandContext } from '@/core/command/Command';
import { Role } from '@/core/permission/PermissionManager';

export class PermissionCommand extends CommandBase {
	public constructor() {
		super({
			name: 'permission',
			description: 'command.permission.description',
			aliases: ['perm'],
			usage: 'command.permission.usage',
			permission: 'alden.command.permission',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { message, args } = ctx;
		if (message.type !== ThreadType.Group) {
			await ctx.reply(ctx.t('command.permission.not_group'));
			return;
		}

		if (args.length === 0) {
			await this.sendHelp(ctx);
			return;
		}

		const action = (args[0] as string).toLowerCase();

		if (action === 'deputy') {
			await this.handleDeputy(ctx, args.slice(1));
		} else if (action === 'list') {
			await this.handleList(ctx);
		} else if (action === 'view') {
			await this.handleView(ctx);
		} else {
			await this.sendHelp(ctx);
		}
	}

	private async handleDeputy(ctx: CommandContext, args: string[]) {
		const sub = args[0]?.toLowerCase();
		if (sub !== 'add' && sub !== 'remove') {
			await ctx.reply(ctx.t('command.permission.invalid_usage'));
			return;
		}

		const targetUid = ctx.getTargetUid(2);
		if (!targetUid) {
			await ctx.reply(ctx.t('command.permission.user_not_found'));
			return;
		}

		const callerRole = await ctx.getSenderRole();
		if (callerRole < Role.Leader) {
			await ctx.reply(ctx.t('command.permission.need_leader'));
			return;
		}

		const { message } = ctx;
		if (sub === 'add') {
			const success = await this.bot.permissionManager.addVirtualDeputy(
				message.threadId,
				targetUid,
			);
			if (success) {
				await ctx.reply(
					ctx.t('command.permission.deputy_added', {
						uid: targetUid,
					}),
				);
			} else {
				await ctx.reply(
					ctx.t('command.permission.deputy_already', {
						uid: targetUid,
					}),
				);
			}
		} else {
			const success = await this.bot.permissionManager.removeVirtualDeputy(
				message.threadId,
				targetUid,
			);
			if (success) {
				await ctx.reply(
					ctx.t('command.permission.deputy_removed', {
						uid: targetUid,
					}),
				);
			} else {
				await ctx.reply(
					ctx.t('command.permission.deputy_not_found', {
						uid: targetUid,
					}),
				);
			}
		}
	}

	private async handleList(ctx: CommandContext) {
		const permissions = this.bot.permissionManager.getAllPermissions();
		const msg =
			ctx.t('command.permission.list_title') +
			permissions
				.map(
					(n) =>
						`- ${n} (Level: ${Role[this.bot.permissionManager.getPermissionRole(n)] ?? 'Member'})`,
				)
				.join('\n');
		await ctx.reply(msg);
	}

	private async handleView(ctx: CommandContext) {
		const targetUid = ctx.getTargetUid(1);
		if (!targetUid) {
			await ctx.reply(ctx.t('command.permission.user_not_found'));
			return;
		}

		const role = await this.bot.permissionManager.getRoleLevel(
			ctx.message.threadId,
			targetUid,
			true,
		);
		const roleName = Role[role] ?? 'Member';

		const explicit = this.bot.permissionManager.getUserPermissions(targetUid);
		const explicitStr = explicit.length > 0 ? explicit.join(', ') : 'None';
		const msg = ctx.t('command.permission.view_info', {
			uid: targetUid,
			role: roleName,
			permissions: explicitStr,
		});

		await ctx.reply(msg);
	}

	private async sendHelp(ctx: CommandContext) {
		const msg = ctx.t('command.permission.help_guide');
		await ctx.reply(msg);
	}
}
