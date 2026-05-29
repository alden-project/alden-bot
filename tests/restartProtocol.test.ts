import { describe, expect, it } from 'vitest';

import {
	AWAKE_CODE,
	AWAKE_EXIT_CODE,
	createLauncherRequest,
	isAwakeExitCode,
} from '@/core/update/RestartProtocol';

describe('RestartProtocol', () => {
	it('maps AWAKE 29253 to portable exit code 69', () => {
		expect(AWAKE_CODE).toBe(29253);
		expect(AWAKE_EXIT_CODE).toBe(69);
		expect(AWAKE_CODE % 256).toBe(AWAKE_EXIT_CODE);
		expect(isAwakeExitCode(69)).toBe(true);
	});

	it('creates launcher requests with the AWAKE semantic code', () => {
		const request = createLauncherRequest('restart', { reason: 'test' });

		expect(request).toMatchObject({
			type: 'restart',
			code: AWAKE_CODE,
			name: 'AWAKE',
			reason: 'test',
		});
	});
});
