import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
		exclude: ['node_modules/**', 'dist/**', 'data/**', 'plugins/**'],
		clearMocks: true,
		restoreMocks: true,
	},
});
