# ══════════════════════════════════════════════
#  FinPlan — Monorepo Makefile
# ══════════════════════════════════════════════

.PHONY: help up down dev build logs \
        migrate superuser test lint \
        backend-shell frontend-shell \
        clean prune

# Colors
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Displays this help message
	@echo ""
	@echo "  $(CYAN)FinPlan — Available commands$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Docker ──────────────────────────────────────────────────
up: ## Starts all services in background mode (production)
	docker compose up -d

down: ## Stops and removes containers
	docker compose down

dev: ## Starts in development mode (hot reload)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

build: ## Rebuilds all images
	docker compose build --no-cache

logs: ## Follows logs from all services
	docker compose logs -f

logs-backend: ## Backend logs only
	docker compose logs -f backend

logs-frontend: ## Frontend logs only
	docker compose logs -f frontend

# ── Backend ──────────────────────────────────────────────────
migrate: ## Runs aerich upgrade (migrations)
	docker compose exec backend aerich upgrade

migration: ## Creates a new migration (usage: make migration NAME=add_field)
	docker compose exec backend aerich migrate --name $(NAME)

superuser: ## Creates admin superuser
	docker compose exec backend python scripts/create_superuser.py

backend-shell: ## Python shell inside backend container
	docker compose exec backend python

# ── Frontend ─────────────────────────────────────────────────
frontend-shell: ## sh shell inside frontend container (nginx)
	docker compose exec frontend sh

# ── Quality ──────────────────────────────────────────────────
test: ## Runs backend tests
	docker compose exec backend pytest tests/ -v

lint: ## Runs ruff linter on backend
	docker compose exec backend ruff check app/

# ── Cleanup ──────────────────────────────────────────────────
clean: ## Removes containers and volumes
	docker compose down -v

prune: ## Removes unused images (careful!)
	docker image prune -f