import { Zalo, type API } from 'zca-js';

import { type PATH } from '@/config/constants';
import logger from '@/shared/logger';

import { CredentialManager } from './CredentialManager';
import { QRHandler } from './QRHandler';

export class AuthManager {
	private readonly zalo: Zalo;
	private readonly credManager: CredentialManager;
	private readonly qrHandler: QRHandler;
	private readonly qrCodePath: string;
	private readonly credentialsPath: string;

	public constructor(path: typeof PATH) {
		this.zalo = new Zalo({
			logging: false,
			selfListen: true,
			checkUpdate: true,
		});

		this.qrCodePath = path.QRCODE_PATH;
		this.credentialsPath = path.CREDENTIALS_PATH;

		this.credManager = new CredentialManager(this.credentialsPath);
		this.qrHandler = new QRHandler(this.qrCodePath);
	}

	public async login(): Promise<API> {
		const savedCredentials = await this.credManager.load();

		if (savedCredentials) {
			logger.info('Found saved credentials, attempting to login...');
			try {
				return await this.zalo.login(savedCredentials);
			} catch (err) {
				logger.warn('Saved credentials invalid or expired. Falling back to QR login...');
				logger.debug(err);
			}
		}

		logger.info('No valid credentials found, falling back to QR login...');
		const api = await this.zalo.loginQR({ qrPath: this.qrCodePath }, (event) =>
			this.qrHandler.handle(event),
		);

		if (!api) {
			throw new Error('Failed to login (API is null)!');
		}

		await this.credManager.save(api);
		return api;
	}
}
