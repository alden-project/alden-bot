import type { Credentials, TAttachmentContent, TMessage } from 'zca-js';

export function isValidCredentials(credentials: Partial<Credentials>): credentials is Credentials {
	return !!credentials.cookie && !!credentials.imei && !!credentials.userAgent;
}

export function isAttachment(content: unknown): content is TAttachmentContent {
	return (
		typeof content === 'object' &&
		content !== null &&
		('href' in content || 'type' in content || 'params' in content)
	);
}

export function isTextMessage(data: TMessage): data is TMessage & { content: string } {
	return typeof data.content === 'string';
}
