import qrcode from 'qrcode-terminal';
import { LoginQRCallbackEventType, type LoginQRCallbackEvent } from 'zca-js';

import logger from '@/shared/logger';
import fsp from 'node:fs/promises';

export class QRHandler {
	private static readonly MAX_RETRIES = 3;
	private retryCount = 0;

	public constructor(private readonly qrPath: string) {}

	public async handle(event: LoginQRCallbackEvent): Promise<void> {
		switch (event.type) {
			case LoginQRCallbackEventType.QRCodeGenerated:
				await event.actions.saveToFile(this.qrPath);
				logger.info(`Scan this QR Code or inside "${this.qrPath}" to login`);
				qrcode.generate(event.data.token, { small: true });
				break;
			case LoginQRCallbackEventType.QRCodeScanned:
				logger.info('QR code scanned! Waiting for confirmation...');
				break;
			case LoginQRCallbackEventType.GotLoginInfo:
				logger.info('Got login info successfully!');

				try {
					await fsp.unlink(this.qrPath);
				} catch {
					logger.error(
						`Failed when trying to remove QR Code image file in \`${this.qrPath}\``,
					);
				}
				break;
			case LoginQRCallbackEventType.QRCodeExpired:
				logger.warn('QR code expired! Generating a new one...');
				event.actions.retry();
				break;
			case LoginQRCallbackEventType.QRCodeDeclined:
				if (this.retryCount < QRHandler.MAX_RETRIES) {
					this.retryCount++;
					logger.warn(
						`QR code declined by the user! Retrying... (${this.retryCount}/${QRHandler.MAX_RETRIES})`,
					);
					event.actions.retry();
				} else {
					logger.error('QR code declined too many times. Giving up.');
				}
				break;
		}
	}
}
