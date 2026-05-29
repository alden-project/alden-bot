import type { Message } from 'zca-js';

export function hasMention(message: Message): boolean {
	return (
		'mentions' in message.data &&
		Array.isArray(message.data.mentions) &&
		message.data.mentions.length > 0
	);
}

export function extractUid(message: Message, args: string[]): string | undefined {
	if (hasMention(message)) {
		return (message.data as { mentions: Array<{ uid: string }> }).mentions[0]?.uid;
	}
	if (args.length > 0) {
		return args[0];
	}
	return undefined;
}

export interface ParsedCommandArgs {
	readonly targetUids: string[];
	readonly cleanArgs: string[];
}

export function parseCommandArgs(message: Message, args: string[]): ParsedCommandArgs {
	const hasMentions =
		'mentions' in message.data &&
		Array.isArray(message.data.mentions) &&
		message.data.mentions.length > 0;

	if (hasMentions) {
		const mentions = (
			message.data as { mentions: Array<{ uid: string; pos: number; len: number }> }
		).mentions;
		const targetUids = mentions.map((m) => m.uid);

		const content = typeof message.data.content === 'string' ? message.data.content : '';
		const mentionWords: string[] = [];

		for (const mention of mentions) {
			if (typeof mention.pos === 'number' && typeof mention.len === 'number') {
				const mentionText = content.slice(mention.pos, mention.pos + mention.len);
				const words = mentionText
					.trim()
					.split(/\s+/)
					.map((w: string) => w.toLowerCase());
				mentionWords.push(...words);
			}
		}

		const cleanArgs: string[] = [];
		if (mentionWords.length > 0) {
			let mentionWordIndex = 0;
			for (const arg of args) {
				if (
					mentionWordIndex < mentionWords.length &&
					arg.toLowerCase() === mentionWords[mentionWordIndex]
				) {
					mentionWordIndex++;
				} else {
					cleanArgs.push(arg);
				}
			}
			return { targetUids, cleanArgs };
		}

		return { targetUids, cleanArgs: args.filter((arg) => !arg.startsWith('@')) };
	}

	const targetUid = args[0];
	const cleanArgs = args.slice(1);
	return { targetUids: targetUid ? [targetUid] : [], cleanArgs };
}
