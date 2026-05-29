import type { Message } from 'zca-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BankCardEvent } from '@/core/event/BankCardEvent';

const EMPTY_DETAILS = {
	bankName: '',
	accountNumber: '',
	accountHolder: '',
	bin: '',
	bankLogoUrl: '',
};

function createEvent(dataUrl: string): BankCardEvent {
	return new BankCardEvent({} as Message, {
		raw: '',
		dataUrl,
		customMsg: '',
	});
}

function createBankCardPayload(parts: string[]): string {
	const qrContent =
		'00020101021138550010A000000727012500069704230111123456789010208QRIBFTTA53037045802VN80300012com.vng.zalo0110ZABANKCARD6304ABCD';

	return [
		`https://bankcard-action.zalo.me?action=save&content=${qrContent}`,
		...parts,
		'https://res-zalo.zadn.vn/upload/media/2022/9/22/970423_LOGO_1663814322733_1283844.png',
	].join('\0');
}

describe('BankCardEvent', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('does not fetch non-Zalo bank card URLs', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(createEvent('http://127.0.0.1/card').fetchDetails()).resolves.toEqual(
			EMPTY_DETAILS,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects oversized bank card responses before reading the body', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response('ignored', {
				headers: {
					'content-length': String(600 * 1024),
				},
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			createEvent('https://res-zalo.zadn.vn/upload/media/card').fetchDetails(),
		).resolves.toEqual(EMPTY_DETAILS);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('parses UTF-8 bank card display fields', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(
				createBankCardPayload([
					'NGUYEN VAN A',
					'["pc", "web"]',
					'12345678901',
					'Ngân hàng TPBank',
				]),
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			createEvent('https://zinst-stc.zadn.vn/static/3m/11845/card').fetchDetails(),
		).resolves.toEqual({
			bankName: 'Ngân hàng TPBank',
			accountNumber: '12345678901',
			accountHolder: 'NGUYEN VAN A',
			bin: '970423',
			bankLogoUrl:
				'https://res-zalo.zadn.vn/upload/media/2022/9/22/970423_LOGO_1663814322733_1283844.png',
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
