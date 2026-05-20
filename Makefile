# ══════════════════════════════════════════════
#  FinPlan — Monorepo Makefile
# ══════════════════════════════════════════════

.PHONY: help up down dev build logs \
        migrate superuser test lint \
        backend-shell frontend-shell \
        clean prune

# Cores
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Mostra esta ajuda
	@echo ""
	@echo "  $(CYAN)FinPlan — Comandos disponíveis$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Docker ──────────────────────────────────────────────────
up: ## Sobe todos os serviços em background (produção)
	docker compose up -d

down: ## Para e remove containers
	docker compose down

dev: ## Sobe em modo desenvolvimento (hot reload)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

build: ## Rebuilda todas as imagens
	docker compose build --no-cache

logs: ## Segue logs de todos os serviços
	docker compose logs -f

logs-backend: ## Logs apenas do backend
	docker compose logs -f backend

logs-frontend: ## Logs apenas do frontend
	docker compose logs -f frontend

# ── Backend ──────────────────────────────────────────────────
migrate: ## Roda aerich upgrade (migrations)
	docker compose exec backend aerich upgrade

migration: ## Cria nova migration (uso: make migration NAME=add_field)
	docker compose exec backend aerich migrate --name $(NAME)

superuser: ## Cria superusuário admin
	docker compose exec backend python scripts/create_superuser.py

backend-shell: ## Shell Python dentro do container backend
	docker compose exec backend python

# ── Frontend ─────────────────────────────────────────────────
frontend-shell: ## Shell sh dentro do container frontend (nginx)
	docker compose exec frontend sh

# ── Qualidade ────────────────────────────────────────────────
test: ## Roda testes do backend
	docker compose exec backend pytest tests/ -v

lint: ## Roda ruff linter no backend
	docker compose exec backend ruff check app/

# ── Limpeza ──────────────────────────────────────────────────
clean: ## Remove containers e volumes
	docker compose down -v

prune: ## Remove imagens não utilizadas (cuidado!)
	docker image prune -f
