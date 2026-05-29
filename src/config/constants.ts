import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENV } from './env';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PATH = {
	DATA_DIR: path.join(PROJECT_ROOT, 'data'),
	LOGIN_DIR: path.join(PROJECT_ROOT, 'data', 'login'),
	CREDENTIALS_PATH: path.join(PROJECT_ROOT, 'data', 'login', 'credentials.json'),
	PERMISSIONS_PATH: path.join(PROJECT_ROOT, 'data', 'permissions.json'),
	QRCODE_PATH: path.join(PROJECT_ROOT, 'data', 'login', 'qr.png'),
	LOGS_DIR: path.join(PROJECT_ROOT, 'data', 'logs'),
	LAUNCHER_REQUEST_PATH: path.join(PROJECT_ROOT, 'data', 'launcher-request.json'),
	UPDATE_BACKUPS_DIR: path.join(PROJECT_ROOT, 'data', 'update-backups'),
	UPDATE_DOWNLOADS_DIR: path.join(PROJECT_ROOT, 'data', 'update-downloads'),
	PLUGINS_DIR: path.join(PROJECT_ROOT, 'plugins'),
	LOCALES_DIR: path.join(PROJECT_ROOT, 'src', 'locales'),
	PACKAGE_JSON: path.join(PROJECT_ROOT, 'package.json'),
	USER_LANGUAGES_PATH: path.join(PROJECT_ROOT, 'data', 'user-languages.json'),
} as const;

export const PREFIX = ENV.BOT_PREFIX;
export const DEFAULT_LANGUAGE = ENV.DEFAULT_LANGUAGE;
export const REPLY_UNKNOWN_COMMAND = ENV.REPLY_UNKNOWN_COMMAND;
export const MESSAGE_QUEUE_DELAY = ENV.MESSAGE_QUEUE_DELAY;
export const ADMIN_IDS = ENV.ADMIN_IDS;
export const ENABLE_EVAL_COMMAND = ENV.ENABLE_EVAL_COMMAND;
export const ENABLE_RELOAD_COMMAND = ENV.ENABLE_RELOAD_COMMAND;
