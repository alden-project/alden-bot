module.exports = {
	apps: [
		{
			name: 'alden-bot',
			script: 'pnpm',
			args: 'start',
			interpreter: 'none',
			autorestart: true,
			max_memory_restart: '512M',
			env: {
				NODE_ENV: 'production',
			},
		},
	],
};
