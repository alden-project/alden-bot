import type { Message } from 'zca-js';

import { isAttachment } from '@/utils/guards';
import logger from '@/shared/logger';
import {
	detectReminderSubtype,
	isLocationLive,
	parseBankCard,
	parseContactCard,
	parseDoodle,
	parseFile,
	parseImage,
	parseLiveLocation,
	parseLocation,
	parsePollClose,
	parsePollCreate,
	parsePollVote,
	parseReminderConfirm,
	parseReminderCreate,
	parseReminderRemove,
	parseVoice,
} from '@/parser/contentParser';

import { BankCardEvent } from './BankCardEvent';
import { ContactCardEvent } from './ContactCardEvent';
import { DoodleEvent } from './DoodleEvent';
import { FileEvent } from './FileEvent';
import { ImageEvent } from './ImageEvent';
import { LiveLocationEvent } from './LiveLocationEvent';
import { LocationEvent } from './LocationEvent';
import { MessageEvent } from './MessageEvent';
import { PollCloseEvent } from './PollCloseEvent';
import { PollCreateEvent } from './PollCreateEvent';
import { PollVoteEvent } from './PollVoteEvent';
import { ReminderConfirmEvent } from './ReminderConfirmEvent';
import { ReminderCreateEvent } from './ReminderCreateEvent';
import { ReminderRemoveEvent } from './ReminderRemoveEvent';
import { VoiceEvent } from './VoiceEvent';

export type InboundMessageEvent =
	| BankCardEvent
	| ContactCardEvent
	| DoodleEvent
	| FileEvent
	| ImageEvent
	| LiveLocationEvent
	| LocationEvent
	| MessageEvent
	| PollCloseEvent
	| PollCreateEvent
	| PollVoteEvent
	| ReminderConfirmEvent
	| ReminderCreateEvent
	| ReminderRemoveEvent
	| VoiceEvent;

function createParsedEvent(
	message: Message,
	eventName: string,
	createEvent: () => InboundMessageEvent,
): InboundMessageEvent {
	try {
		return createEvent();
	} catch (error) {
		logger.warn(
			`MessageEventFactory: Failed to parse ${eventName}; using MessageEvent fallback.`,
			error,
		);
		return new MessageEvent(message);
	}
}

export function createMessageEvent(message: Message): InboundMessageEvent {
	const { msgType, content } = message.data;

	if (msgType === 'chat.voice' && isAttachment(content)) {
		return createParsedEvent(
			message,
			'VoiceEvent',
			() => new VoiceEvent(message, parseVoice(content)),
		);
	}
	if (msgType === 'chat.photo' && isAttachment(content)) {
		return createParsedEvent(
			message,
			'ImageEvent',
			() => new ImageEvent(message, parseImage(content)),
		);
	}
	if (msgType === 'chat.doodle' && isAttachment(content)) {
		return createParsedEvent(
			message,
			'DoodleEvent',
			() => new DoodleEvent(message, parseDoodle(content)),
		);
	}
	if (msgType === 'share.file' && isAttachment(content)) {
		return createParsedEvent(
			message,
			'FileEvent',
			() => new FileEvent(message, parseFile(content)),
		);
	}
	if (msgType === 'chat.location.new' && isAttachment(content)) {
		return createParsedEvent(message, 'LocationEvent', () =>
			isLocationLive(content)
				? new LiveLocationEvent(message, parseLiveLocation(content))
				: new LocationEvent(message, parseLocation(content)),
		);
	}

	if (!isAttachment(content)) {
		return new MessageEvent(message);
	}

	const { action } = content;

	if (action === 'create') {
		return createParsedEvent(
			message,
			'PollCreateEvent',
			() => new PollCreateEvent(message, parsePollCreate(content)),
		);
	}
	if (action === 'vote') {
		return createParsedEvent(
			message,
			'PollVoteEvent',
			() => new PollVoteEvent(message, parsePollVote(content)),
		);
	}
	if (action === 'close') {
		return createParsedEvent(
			message,
			'PollCloseEvent',
			() => new PollCloseEvent(message, parsePollClose(content)),
		);
	}
	// Zalo uses this typo in the action name.
	if (action === 'recommened.user') {
		return createParsedEvent(
			message,
			'ContactCardEvent',
			() => new ContactCardEvent(message, parseContactCard(content)),
		);
	}
	if (action === 'zinstant.bankcard') {
		return createParsedEvent(
			message,
			'BankCardEvent',
			() => new BankCardEvent(message, parseBankCard(content)),
		);
	}
	if (action === 'msginfo.actionlist') {
		return createParsedEvent(message, 'ReminderEvent', () => {
			const subtype = detectReminderSubtype(content);
			if (subtype === 'remove') {
				return new ReminderRemoveEvent(message, parseReminderRemove(content));
			}
			if (subtype === 'confirm') {
				return new ReminderConfirmEvent(message, parseReminderConfirm(content));
			}
			return new ReminderCreateEvent(message, parseReminderCreate(content));
		});
	}

	return new MessageEvent(message);
}
