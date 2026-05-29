import type { TAttachmentContent } from 'zca-js';

export interface VoiceData {
	url: string;
	duration: number;
	fileSize: number;
	waveform: number[];
}

export interface ImageData {
	url: string;
	thumb: string;
	hdUrl: string;
	width: number;
	height: number;
}

export interface DoodleData {
	url: string;
	thumb: string;
	width: number;
	height: number;
}

export interface FileData {
	url: string;
	fileName: string;
	fileExt: string;
	fileSize: number;
	checksum: string;
}

export interface LiveLocationData {
	longitude: number;
	latitude: number;
}

export interface LocationData {
	longitude: number;
	latitude: number;
	placeId: string;
	title: string;
	description: string;
}

export interface PollCreateData {
	question: string;
	pollId: number;
	groupId: string;
	uid: string;
	dName: string;
	isAnonymous: boolean;
}

export interface PollVoteData {
	question: string;
	pollId: number;
	groupId: string;
	uid: string;
	dName: string;
}

export interface PollCloseData {
	question: string;
	pollId: number;
	groupId: string;
	uid: string;
	dName: string;
}

export interface ContactCardData {
	displayName: string;
	userId: string;
	avatarUrl: string;
	qrCodeUrl: string;
}

export interface BankCardData {
	raw: string;
	dataUrl: string;
	customMsg: string;
}

export interface ReminderCreateData {
	title: string;
	emoji: string;
	startTime: number;
	creatorId: string;
	eventId: string;
}

export interface ReminderConfirmData {
	title: string;
	going: boolean;
	userId: string;
	eventId: string;
}

export interface ReminderRemoveData {
	title: string;
	userId: string;
	eventId: string;
}

function safeParseParams(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export function parseVoice(content: TAttachmentContent): VoiceData {
	const params = safeParseParams(content.params);
	return {
		url: content.href || (params.m4a as string) || '',
		duration: Number(params.duration) || 0,
		fileSize: Number(params.fileSize) || 0,
		waveform: Array.isArray(params.waveformSamples) ? (params.waveformSamples as number[]) : [],
	};
}

export function parseImage(content: TAttachmentContent): ImageData {
	const params = safeParseParams(content.params);
	return {
		url: content.href,
		thumb: content.thumb,
		hdUrl: (params.hd as string) || content.href,
		width: Number(params.width) || 0,
		height: Number(params.height) || 0,
	};
}

export function parseDoodle(content: TAttachmentContent): DoodleData {
	const params = safeParseParams(content.params);
	return {
		url: content.href,
		thumb: content.thumb,
		width: Number(params.width) || 0,
		height: Number(params.height) || 0,
	};
}

export function parseFile(content: TAttachmentContent): FileData {
	const params = safeParseParams(content.params);
	return {
		url: content.href,
		fileName: content.title,
		fileExt: (params.fileExt as string) || '',
		fileSize: Number(params.fileSize) || 0,
		checksum: (params.checksum as string) || '',
	};
}

export function parseLiveLocation(content: TAttachmentContent): LiveLocationData {
	const params = safeParseParams(content.params);
	return {
		longitude: Number(params.longitude) || 0,
		latitude: Number(params.latitude) || 0,
	};
}

export function parseLocation(content: TAttachmentContent): LocationData {
	const params = safeParseParams(content.params);
	return {
		longitude: Number(params.longitude) || 0,
		latitude: Number(params.latitude) || 0,
		placeId: (params.placeId as string) || '',
		title: content.title,
		description: content.description,
	};
}

export function parsePollCreate(content: TAttachmentContent): PollCreateData {
	const params = safeParseParams(content.params);
	return {
		question: (params.question as string) || '',
		pollId: Number(params.pollId) || 0,
		groupId: (params.groupId as string) || '',
		uid: String(params.uid || ''),
		dName: (params.dName as string) || '',
		isAnonymous: Boolean(params.isAnonymous),
	};
}

export function parsePollVote(content: TAttachmentContent): PollVoteData {
	const params = safeParseParams(content.params);
	return {
		question: (params.question as string) || '',
		pollId: Number(params.pollId) || 0,
		groupId: (params.groupId as string) || '',
		uid: String(params.uid || ''),
		dName: (params.dName as string) || '',
	};
}

export function parsePollClose(content: TAttachmentContent): PollCloseData {
	const params = safeParseParams(content.params);
	return {
		question: (params.question as string) || '',
		pollId: Number(params.pollId) || 0,
		groupId: (params.groupId as string) || '',
		uid: String(params.uid || ''),
		dName: (params.dName as string) || '',
	};
}

export function parseContactCard(content: TAttachmentContent): ContactCardData {
	const desc = safeParseParams(content.description);
	const qrCodeUrl = (desc.qrCodeUrl as string) || '';
	const userId = content.params;
	return {
		displayName: content.title,
		userId,
		avatarUrl: content.thumb,
		qrCodeUrl,
	};
}

export function parseBankCard(content: TAttachmentContent): BankCardData {
	const params = safeParseParams(content.params);
	const item = params.item as Record<string, unknown> | undefined;
	const dataUrl = (item?.data_url as string) || '';
	const cm = params.customMsg as Record<string, unknown> | undefined;
	const msg = cm?.msg as Record<string, string> | undefined;
	const customMsg = msg?.vi || msg?.en || '';
	return { raw: content.params, dataUrl, customMsg };
}

export interface ReminderBaseParams {
	msg: Record<string, string>;
	highLightsV2: Array<{
		uid: string;
		dpn: string;
		ignoreNickname: number;
		type: number;
		ts: number;
	}>;
	iconUrl: string;
	actions?: Array<{
		actionLabelv2: Record<string, string>;
		actionType: string;
		actionColor: number;
		actionData: string;
	}>;
	totalUpdateMem: number;
}

export function parseReminderBase(content: TAttachmentContent): ReminderBaseParams {
	try {
		return JSON.parse(content.params) as ReminderBaseParams;
	} catch {
		return { msg: {}, highLightsV2: [], iconUrl: '', totalUpdateMem: 0 };
	}
}

export function parseReminderCreate(content: TAttachmentContent): ReminderCreateData {
	const params = parseReminderBase(content);
	const highlights = params.highLightsV2;
	const title = highlights[1]?.dpn || '';
	const startTime = highlights[2]?.ts || 0;
	const creatorId = highlights[0]?.uid || '';
	let eventId = '';
	if (params.actions?.[0]?.actionData) {
		try {
			const actionData = JSON.parse(params.actions[0].actionData) as Record<string, unknown>;
			eventId = (actionData.eventId as string) || '';
		} catch {
			eventId = '';
		}
	}
	return { title, emoji: '⏰', startTime, creatorId, eventId };
}

export function parseReminderConfirm(content: TAttachmentContent): ReminderConfirmData {
	const params = parseReminderBase(content);
	const going = params.iconUrl.includes('reminder_accept');
	const title = params.highLightsV2[1]?.dpn || '';
	const userId = params.highLightsV2[0]?.uid || '';
	let eventId = '';
	if (params.actions?.[0]?.actionData) {
		try {
			const actionData = JSON.parse(params.actions[0].actionData) as Record<string, unknown>;
			eventId = (actionData.eventId as string) || '';
		} catch {
			eventId = '';
		}
	}
	return { title, going, userId, eventId };
}

export function parseReminderRemove(content: TAttachmentContent): ReminderRemoveData {
	const params = parseReminderBase(content);
	const title = params.highLightsV2[1]?.dpn || '';
	const userId = params.highLightsV2[0]?.uid || '';
	return { title, userId, eventId: '' };
}

export function isLocationLive(content: TAttachmentContent): boolean {
	try {
		const params = JSON.parse(content.params) as Record<string, unknown>;
		return Number(params.isUserLocation) === 1;
	} catch {
		return false;
	}
}

export function detectReminderSubtype(
	content: TAttachmentContent,
): 'create' | 'confirm' | 'remove' {
	const params = parseReminderBase(content);
	const icon = params.iconUrl;
	if (icon.includes('alarm_del')) return 'remove';
	if (icon.includes('reminder_accept') || icon.includes('reminder_decline')) return 'confirm';
	return 'create';
}
