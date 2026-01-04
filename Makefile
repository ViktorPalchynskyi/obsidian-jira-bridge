.PHONY: dev build test lint typecheck clean docker-build docker-dev ci install setup format install-plugin

VAULT_PATH ?= $(HOME)/Live/notes
PLUGIN_DIR = $(VAULT_PATH)/.obsidian/plugins/obsidian-jira-bridge

dev:
	pnpm dev

build:
	pnpm build

build-styles:
	pnpm build:styles

test:
	pnpm test

test-watch:
	pnpm test:watch

test-coverage:
	pnpm test:coverage

lint:
	pnpm lint

lint-fix:
	pnpm lint:fix

format:
	pnpm format

format-check:
	pnpm format:check

typecheck:
	pnpm typecheck

clean:
	rm -rf dist node_modules

ci: format-check lint typecheck test build
	@echo "All CI checks passed"

docker-build:
	docker-compose build

docker-dev:
	docker-compose up dev

docker-test:
	docker-compose run --rm dev pnpm test

docker-lint:
	docker-compose run --rm dev pnpm lint

docker-ci:
	docker-compose run --rm dev make ci

install:
	pnpm install

setup: install
	mkdir -p dist
	cp manifest.json dist/ 2>/dev/null || true

install-plugin: build
	@echo "Installing plugin to $(PLUGIN_DIR)"
	@mkdir -p "$(PLUGIN_DIR)"
	@cp dist/main.js "$(PLUGIN_DIR)/"
	@cp dist/styles.css "$(PLUGIN_DIR)/"
	@cp manifest.json "$(PLUGIN_DIR)/"
	@echo "Plugin installed. Restart Obsidian and enable in Settings > Community Plugins"
