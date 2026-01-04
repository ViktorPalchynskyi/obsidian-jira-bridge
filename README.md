# Obsidian Jira Bridge

Obsidian plugin for Jira integration - create tickets, sync status, manage multiple instances.

## Features

- Connect multiple Jira instances
- Map folders to Jira instances for automatic routing
- Create tickets via hotkey (Cmd+Shift+J / Ctrl+Shift+J)
- Change ticket status without leaving Obsidian
- Create tickets from notes with frontmatter sync
- Status bar showing current Jira context

## Installation

### From Obsidian Community Plugins

1. Open Settings → Community Plugins
2. Search for "Jira Bridge"
3. Install and enable

### Manual Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/obsidian-jira-bridge/`
3. Enable in Settings → Community Plugins

## Development

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
make install
```

### Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development mode |
| `make build` | Build for production |
| `make test` | Run tests |
| `make lint` | Run linter |
| `make ci` | Run all CI checks |

### Docker

```bash
make docker-dev    # Run dev in Docker
make docker-ci     # Run CI checks in Docker
```

## License

MIT
