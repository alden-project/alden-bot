# alden-bot

[![CI](https://github.com/finntrannn/alden-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/finntrannn/alden-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-F69220.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg)](https://www.typescriptlang.org/)

alden-bot is a Zalo bot built on top of the zca-js library. It transforms your personal Zalo account into a plugin-driven bot, featuring built-in support for commands, permissions, internationalization (i18n), and is incredibly easy to deploy.

> alden-bot uses an unofficial Zalo API library and is not affiliated with Zalo. Running a personal account as a bot can violate platform rules or trigger account restrictions. Use a dedicated account and understand the risk before running it.

Vietnamese README: [README.vi.md](README.vi.md)

## Features

- 🔌 Highly extensible plugin architecture
- ⚡ Commands, permissions, cooldowns, and aliases
- 🧩 Stable plugin API through `@/api`
- 🌐 Core i18n and per-user language settings
- 📦 Runtime dependency install for plugins
- 🧰 PM2, Docker, tests, lint, and CI ready

## Requirements

- Node.js 22 or newer.
- Any compatible Node.js package manager. The documented commands use pnpm; npm, Yarn, or another compatible manager can run equivalent scripts.
- A Zalo account for the bot runtime.

## Quick Start

Download the latest release ZIP from GitHub Releases, extract it, then open a terminal in the extracted folder.

If you prefer Git:

```bash
git clone https://github.com/finntrannn/alden-bot.git
cd alden-bot
```

Then run:

```bash
pnpm install
cp .env.example .env
pnpm start
```

On first launch, follow the login or QR flow printed in the terminal. Runtime data is stored in `data/`, and plugins are loaded from `plugins/`.

## Environment

Copy `.env.example` to `.env` and edit only what you need.

`BotAdmin` means a Zalo user ID listed in `ADMIN_IDS`. BotAdmins own the bot runtime and can use privileged commands even if they are not group admins in a chat.

| Variable                | Default | Notes                                                            |
| ----------------------- | ------- | ---------------------------------------------------------------- |
| `ADMIN_IDS`             | empty   | Optional comma-separated Zalo user IDs with BotAdmin access.     |
| `BOT_PREFIX`            | `/`     | Command prefix. Empty values fall back to `/`.                   |
| `DEFAULT_LANGUAGE`      | `vi`    | Default language for new users.                                  |
| `LOG_LEVEL`             | `info`  | `debug`, `info`, `warn`, or `error`. Case-insensitive.           |
| `ENABLE_EVAL_COMMAND`   | `false` | Enables `/eval`. Keep off unless you fully trust every BotAdmin. |
| `ENABLE_RELOAD_COMMAND` | `false` | Enables `/reload`. Restarting is safer for long-running bots.    |
| `REPLY_UNKNOWN_COMMAND` | `false` | Reply when users send unknown commands.                          |
| `MESSAGE_QUEUE_DELAY`   | `500`   | Milliseconds between outgoing messages. `0` is allowed.          |

If `ADMIN_IDS` is empty, the bot can still run, but BotAdmin-only commands will not be usable until at least one operator ID is configured.

## Commands

| Command       | Purpose                                  | Required role |
| ------------- | ---------------------------------------- | ------------- |
| `/help`       | Show available commands.                 | Member        |
| `/ping`       | Check bot latency.                       | Member        |
| `/status`     | Show runtime and system status.          | Member        |
| `/cancel`     | Cancel a pending session.                | Member        |
| `/language`   | Change display language.                 | Member        |
| `/permission` | Manage virtual group permissions.        | Leader        |
| `/plugins`    | List loaded plugins.                     | BotAdmin      |
| `/update`     | Check or apply runtime updates.          | BotAdmin      |
| `/restart`    | Restart the bot process.                 | BotAdmin      |
| `/reload`     | Reload plugins. Disabled by default.     | BotAdmin      |
| `/eval`       | Execute JavaScript. Disabled by default. | BotAdmin      |

`/eval` and `/reload` are not registered unless their `.env` flags are explicitly set to `true`.

## Plugins

Place each plugin in its own folder under `plugins/`:

```text
plugins/
  my-plugin/
    plugin.json
    src/
      main.ts
    package.json
```

Minimal `plugin.json`:

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"description": "Example plugin",
	"author": "Your Name",
	"main": "src/main.ts",
	"depend": [],
	"softDepend": [],
	"permissions": {
		"my-plugin.command.example": 3
	}
}
```

`plugin.json` is validated as a `PluginManifest`. Invalid plugins are skipped without crashing the bot.

Plugin authors should import from the stable public API:

```ts
import { CommandBase, I18nManager, PluginBase } from '@/api';
```

Deep imports from `src/...` are internal and may change between releases.

Plugin code should treat `this.bot` as the public runtime center exposed by
`@/api`. Prefer `ctx` helpers inside commands for replies, argument parsing,
permissions, sessions, services, and translations.

Command `execute(ctx)` may return `false` when the command was recognized but
could not complete. That call will not consume cooldown; the command should send
its own user-facing reason when needed.

Use lowercase command names and aliases. Use dotted lowercase permission nodes
and service names such as `my-plugin.command.use` or `economy`.

Custom plugin events can define `static eventType = 'plugin-id:event-name'` to
avoid class-name collisions while still working across plugin module reloads.

Plugin i18n is manual. The runtime only uses plugin translations when plugin code creates an `I18nManager`, loads it, and assigns it to `this.i18n` before registering translated commands.

Plugins are trusted full-power code. A plugin can access the same filesystem, network, environment variables, and process APIs as the bot. Install plugins only from sources you trust.

If a plugin includes `package.json`, alden-bot can install its dependencies at runtime. Lockfiles are used when available; otherwise the runtime falls back to a production install.

Plugin examples and longer plugin docs live separately from this runtime repository.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

Docker Compose mounts `./data` for runtime data and `./plugins` for plugin files.

## PM2

```bash
pnpm install
cp .env.example .env
pm2 start ecosystem.config.cjs
pm2 logs alden-bot
pm2 save
```

Use `/restart` only when the bot is managed by the launcher, PM2, or Docker.

## Development

```bash
pnpm run dev
pnpm run test
pnpm run verify
pnpm run create-plugin -- <PluginName>
```

`pnpm run verify` is the main local gate: lint, format check, locale parity, tests, typecheck, and runtime smoke check. If you prefer npm or Yarn, use the equivalent `npm run ...` or `yarn ...` commands.

## Support

Use [GitHub Issues](https://github.com/finntrannn/alden-bot/issues) for bugs and questions. Pull requests are welcome when they keep the runtime stable, simple, and plugin-friendly.

## License

MIT. See [LICENSE](LICENSE).
