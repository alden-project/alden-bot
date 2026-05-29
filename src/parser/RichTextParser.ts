import { TextStyle, type MessageContent, type Style } from 'zca-js';

export class RichTextParser {
	private static encodePUA(text: string): string {
		let result = '';
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			if (code < 0x1000) {
				result += String.fromCharCode(0xe000 + code);
			} else {
				result += text[i];
			}
		}
		return result;
	}

	private static decodePUA(text: string): string {
		let result = '';
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			if (code >= 0xe000 && code < 0xf000) {
				result += String.fromCharCode(code - 0xe000);
			} else {
				result += text[i];
			}
		}
		return result;
	}

	public static parse(content: string): MessageContent {
		const styles: Style[] = [];
		const mentions: NonNullable<MessageContent['mentions']> = [];
		let plainText = content;

		const rules = [
			{ type: 'escape', regex: /\\([\s\S])/g },
			{ type: 'raw', regex: /<raw>([\s\S]+?)<\/raw>/g },
			{ type: 'bold', regex: /\*\*(.+?)\*\*/g, st: TextStyle.Bold },
			{ type: 'italic', regex: /\*(.+?)\*/g, st: TextStyle.Italic },
			{ type: 'underline', regex: /__(.+?)__/g, st: TextStyle.Underline },
			{ type: 'strike', regex: /~~(.+?)~~/g, st: TextStyle.StrikeThrough },
			{ type: 'ul', regex: /^[ \t]*-\s+(.+)$/gm, st: TextStyle.UnorderedList },
			{ type: 'ol', regex: /^[ \t]*\d+\.\s+(.+)$/gm, st: TextStyle.OrderedList },
			{ type: 'color', regex: /<color value="([^"]+)">([\s\S]+?)<\/color>/g },
			{ type: 'size', regex: /<size value="([^"]+)">([\s\S]+?)<\/size>/g },
			{ type: 'indent', regex: /<indent size="(\d+)">([\s\S]+?)<\/indent>/g },
			{ type: 'mention', regex: /<mention uid="([^"]+)">([\s\S]+?)<\/mention>/g },
		];

		let matchFound = true;
		while (matchFound) {
			matchFound = false;
			let earliestMatch: { ruleIndex: number; match: RegExpExecArray } | null = null;

			for (let i = 0; i < rules.length; i++) {
				const rule = rules[i];
				if (!rule) continue;

				rule.regex.lastIndex = 0;
				const match = rule.regex.exec(plainText);
				if (match) {
					if (!earliestMatch || match.index < earliestMatch.match.index) {
						earliestMatch = { ruleIndex: i, match };
					}
				}
			}

			if (earliestMatch) {
				matchFound = true;
				const rule = rules[earliestMatch.ruleIndex];
				const match = earliestMatch.match;

				if (!rule) continue;

				const start = match.index;
				let innerText: string;
				let styleObj: Style | null = null;

				if (rule.type === 'escape' || rule.type === 'raw') {
					innerText = this.encodePUA(match[1]!);
				} else if (
					rule.type === 'color' ||
					rule.type === 'size' ||
					rule.type === 'indent' ||
					rule.type === 'mention'
				) {
					const attr = match[1]!;
					innerText = match[2]!;
					const len = innerText.length;

					if (rule.type === 'color') {
						let st: Exclude<TextStyle, TextStyle.Indent> | undefined;
						switch (attr.toLowerCase()) {
							case 'red':
								st = TextStyle.Red;
								break;
							case 'orange':
								st = TextStyle.Orange;
								break;
							case 'yellow':
								st = TextStyle.Yellow;
								break;
							case 'green':
								st = TextStyle.Green;
								break;
						}
						if (st) styleObj = { start, len, st };
					} else if (rule.type === 'size') {
						let st: Exclude<TextStyle, TextStyle.Indent> | undefined;
						if (attr.toLowerCase() === 'small') st = TextStyle.Small;
						if (attr.toLowerCase() === 'big') st = TextStyle.Big;
						if (st) styleObj = { start, len, st };
					} else if (rule.type === 'indent') {
						const size = parseInt(attr, 10) || 1;
						styleObj = { start, len, st: TextStyle.Indent, indentSize: size };
					} else if (rule.type === 'mention') {
						mentions.push({ pos: start, len, uid: attr });
					}
				} else if (rule.type === 'ul' || rule.type === 'ol') {
					innerText = match[1]!;
					const len = innerText.length;
					styleObj = { start, len, st: rule.st as Exclude<TextStyle, TextStyle.Indent> };
				} else {
					innerText = match[1]!;
					const len = innerText.length;
					styleObj = { start, len, st: rule.st as Exclude<TextStyle, TextStyle.Indent> };
				}

				if (styleObj) {
					styles.push(styleObj);
				}

				let innerStartOffset = 0;
				if (rule.type === 'escape' || rule.type === 'italic') innerStartOffset = 1;
				else if (
					rule.type === 'bold' ||
					rule.type === 'underline' ||
					rule.type === 'strike'
				)
					innerStartOffset = 2;
				else if (rule.type === 'raw') innerStartOffset = 5;
				else if (rule.type === 'ul' || rule.type === 'ol')
					innerStartOffset = match[0].length - match[1]!.length;
				else if (rule.type === 'color')
					innerStartOffset = `<color value="${match[1]}">`.length;
				else if (rule.type === 'size')
					innerStartOffset = `<size value="${match[1]}">`.length;
				else if (rule.type === 'indent')
					innerStartOffset = `<indent size="${match[1]}">`.length;
				else if (rule.type === 'mention')
					innerStartOffset = `<mention uid="${match[1]}">`.length;

				const matchLength = match[0].length;
				const innerLength = innerText.length;
				const rightTagLength = matchLength - innerStartOffset - innerLength;

				const mapIndex = (i: number): number => {
					if (i < start) return i;
					if (i < start + innerStartOffset) return start;
					if (i < start + innerStartOffset + innerLength) return i - innerStartOffset;
					if (i < start + matchLength) return start + innerLength;
					return i - innerStartOffset - rightTagLength;
				};

				for (const s of styles) {
					if (s !== styleObj) {
						const sEnd = s.start + s.len;
						s.start = mapIndex(s.start);
						s.len = mapIndex(sEnd) - s.start;
					}
				}

				for (let i = styles.length - 1; i >= 0; i--) {
					if (styles[i]!.len <= 0 && styles[i] !== styleObj) {
						styles.splice(i, 1);
					}
				}

				for (let i = mentions.length - 1; i >= 0; i--) {
					const m = mentions[i]!;
					const mEnd = m.pos + m.len;
					m.pos = mapIndex(m.pos);
					m.len = mapIndex(mEnd) - m.pos;
					if (m.len <= 0) mentions.splice(i, 1);
				}

				plainText =
					plainText.substring(0, start) +
					innerText +
					plainText.substring(start + matchLength);
			}
		}

		plainText = this.decodePUA(plainText);

		return {
			msg: plainText,
			styles: styles.length > 0 ? styles : undefined,
			mentions: mentions.length > 0 ? mentions : undefined,
		};
	}
}
