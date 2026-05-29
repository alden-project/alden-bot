import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: [
			'data/**',
			'dist/**',
			'node_modules/**',
			'plugins/**',
			'eslint.config.js',
			'ecosystem.config.cjs',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			quotes: ['error', 'single', { allowTemplateLiterals: true, avoidEscape: true }],
			'@typescript-eslint/no-unsafe-enum-comparison': 'error',
			'@typescript-eslint/naming-convention': [
				'error',
				{
					selector: 'typeLike',
					format: ['PascalCase'],
				},
				{
					selector: 'function',
					format: ['camelCase', 'PascalCase'],
				},
				{
					selector: 'method',
					format: ['camelCase'],
				},
			],
		},
	},
);
