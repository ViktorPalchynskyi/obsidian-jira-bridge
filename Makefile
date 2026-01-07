.PHONY: dev build test lint typecheck clean docker-build docker-dev ci install setup format install-plugin help

-include .env

VAULT_PATH ?= $(HOME)/Live/notes
PLUGIN_DIR = $(VAULT_PATH)/.obsidian/plugins/obsidian-jira-bridge

help: ## Show this help
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

dev: ## Start development mode with hot reload
	pnpm dev

build: ## Build for production
	pnpm build

build-styles: ## Build styles only
	pnpm build:styles

test: ## Run tests
	pnpm test

test-watch: ## Run tests in watch mode
	pnpm test:watch

test-coverage: ## Run tests with coverage
	pnpm test:coverage

lint: ## Run linter
	pnpm lint

lint-fix: ## Run linter and fix issues
	pnpm lint:fix

format: ## Format code
	pnpm format

format-check: ## Check code formatting
	pnpm format:check

typecheck: ## Run TypeScript type checking
	pnpm typecheck

clean: ## Remove dist and node_modules
	rm -rf dist node_modules

ci: format-check lint typecheck test build ## Run all CI checks
	@echo "All CI checks passed"

docker-build: ## Build Docker image
	docker-compose build

docker-dev: ## Start development in Docker
	docker-compose up dev

docker-test: ## Run tests in Docker
	docker-compose run --rm dev pnpm test

docker-lint: ## Run linter in Docker
	docker-compose run --rm dev pnpm lint

docker-ci: ## Run CI checks in Docker
	docker-compose run --rm dev make ci

install: ## Install dependencies
	pnpm install

setup: install ## Setup project (install + create dist)
	mkdir -p dist
	cp manifest.json dist/ 2>/dev/null || true

install-plugin: build ## Build and install plugin to Obsidian vault
	@echo "Installing plugin to $(PLUGIN_DIR)"
	@mkdir -p "$(PLUGIN_DIR)"
	@cp dist/main.js "$(PLUGIN_DIR)/"
	@cp dist/styles.css "$(PLUGIN_DIR)/"
	@cp manifest.json "$(PLUGIN_DIR)/"
	@echo "Plugin installed. Restart Obsidian and enable in Settings > Community Plugins"
