import fsp from 'node:fs/promises';
import path from 'node:path';

import { PATH } from '@/config/constants';

const pluginName = process.argv[2];

const write = (message: string): void => {
	process.stdout.write(message);
};

const writeError = (message: string): void => {
	process.stderr.write(message);
};

if (!pluginName) {
	writeError('Usage: pnpm run create-plugin <PluginName>\n');
	writeError('Example: pnpm run create-plugin MyAwesomePlugin\n');
	process.exit(1);
}

if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(pluginName)) {
	writeError(
		'Plugin name must start with a letter and only use letters, numbers, underscores, or hyphens.\n',
	);
	writeError(`Got: "${pluginName}"\n`);
	process.exit(1);
}

const pluginDir = path.join(PATH.PLUGINS_DIR, pluginName);

let pluginDirExists = true;
try {
	await fsp.access(pluginDir);
} catch {
	pluginDirExists = false;
}

if (pluginDirExists) {
	writeError(`Directory already exists: plugins/${pluginName}/\n`);
	process.exit(1);
}

const pluginJson = JSON.stringify(
	{
		name: pluginName,
		version: '1.0.0',
		description: `${pluginName} plugin for alden-bot`,
		author: 'your-name',
		main: 'src/main.ts',
		apiVersion: '1.0.0',
		permissions: {
			[`${pluginName.toLowerCase()}.command.use`]: 0,
		},
	},
	null,
	'\t',
);

const packageJson = JSON.stringify(
	{
		name: pluginName.toLowerCase(),
		version: '1.0.0',
		private: true,
		type: 'module',
		scripts: {
			typecheck: 'node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit',
			verify: 'pnpm run typecheck',
		},
		dependencies: {},
	},
	null,
	'\t',
);

const tsconfigJson = JSON.stringify(
	{
		extends: '../../tsconfig.json',
		compilerOptions: {
			rootDir: '../..',
			paths: {
				'@/*': ['../../src/*'],
			},
		},
		include: ['src/**/*.ts', '../../src/**/*.ts'],
		exclude: ['node_modules', 'dist'],
	},
	null,
	'\t',
);

const mainTs = `import { PluginBase } from '@/api';

export default class Main extends PluginBase {
\tpublic async onEnable(): Promise<void> {
\t\tthis.logger.info('Enabled.');
\t}

\tpublic onDisable(): void {
\t\tthis.logger.info('Disabled.');
\t}
}
`;
await fsp.mkdir(path.join(pluginDir, 'src'), { recursive: true });

await Promise.all([
	fsp.writeFile(path.join(pluginDir, 'plugin.json'), pluginJson, 'utf-8'),
	fsp.writeFile(path.join(pluginDir, 'package.json'), packageJson, 'utf-8'),
	fsp.writeFile(path.join(pluginDir, 'tsconfig.json'), tsconfigJson, 'utf-8'),
	fsp.writeFile(path.join(pluginDir, 'src', 'main.ts'), mainTs, 'utf-8'),
]);

write(`\nPlugin "${pluginName}" created successfully.\n\n`);
write(`  plugins/${pluginName}/\n`);
write('  - plugin.json\n');
write('  - package.json\n');
write('  - tsconfig.json\n');
write('  - src/main.ts\n\n');
write('Next steps:\n');
write('  1. Edit plugin.json with your details.\n');
write('  2. Add commands, events, services, or scheduled tasks in src/.\n');
write('  3. Run: pnpm run dev\n\n');
