# Financial Planning API

API REST para planejamento financeiro de clientes — FastAPI + Tortoise ORM + SQLite/PostgreSQL.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | FastAPI 0.136 |
| ORM | Tortoise ORM 1.1 |
| Migrations | Aerich 0.9 |
| Validação | Pydantic v2 |
| Auth | JWT (python-jose) + bcrypt |
| Rate limiting | SlowAPI |
| Logging | structlog (JSON/console) |
| Testes | pytest + pytest-asyncio |

## Estrutura

```
financial-api/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── auth.py         # POST /auth/login, /auth/refresh
│   │       │   └── clients.py      # CRUD /clients
│   │       └── router.py
│   ├── core/
│   │   ├── config.py               # Settings via pydantic-settings
│   │   ├── database.py             # Tortoise + Aerich config
│   │   ├── deps.py                 # FastAPI Depends (auth guards)
│   │   ├── exceptions.py           # Exceções de domínio + handlers
│   │   ├── logging.py              # structlog setup
│   │   └── security.py             # JWT, bcrypt, Fernet (SSN)
│   ├── middleware/
│   │   └── logging_middleware.py   # Request ID + request/response log
│   ├── models/
│   │   ├── client.py               # Tortoise model: Client
│   │   └── user.py                 # Tortoise model: User (auth)
│   ├── repositories/
│   │   └── client_repository.py    # Data access layer
│   ├── schemas/
│   │   ├── auth.py                 # Login/Token schemas
│   │   └── client.py               # Client request/response + sub-schemas
│   ├── services/
│   │   ├── auth_service.py         # Lógica de autenticação
│   │   └── client_service.py       # Lógica de negócio de clientes
│   └── main.py                     # App factory + lifespan
├── migrations/                     # Gerado pelo Aerich
├── scripts/
│   └── create_superuser.py         # CLI para criar admin
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── requirements.txt
```

## Setup local

```bash
# 1. Clone e entre no diretório
git clone <repo>
cd financial-api

# 2. Crie e ative o ambiente virtual
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Instale dependências
pip install -r requirements.txt

# 4. Configure o .env
cp .env.example .env
# Edite SECRET_KEY e ENCRYPTION_KEY

# 5. Inicialize as migrations
aerich init -t app.core.database.TORTOISE_ORM
aerich init-db

# 6. Crie o superusuário
python scripts/create_superuser.py

# 7. Suba a API
uvicorn app.main:app --reload
```

## Docker

```bash
# Desenvolvimento
docker compose up --build

# Produção (variáveis via .env ou secrets)
docker compose -f docker-compose.yml up -d
```

## Migrations (Aerich)

```bash
# Criar nova migration após alterar models
aerich migrate --name <descricao>

# Aplicar migrations
aerich upgrade

# Reverter última
aerich downgrade
```

## Testes

```bash
pytest tests/ -v
```

## Endpoints principais

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/v1/auth/login` | ❌ | Login |
| POST | `/api/v1/auth/refresh` | ❌ | Renovar token |
| GET | `/api/v1/clients` | ✅ | Listar clientes |
| POST | `/api/v1/clients` | ✅ | Criar cliente |
| GET | `/api/v1/clients/{id}` | ✅ | Detalhe do cliente |
| PATCH | `/api/v1/clients/{id}` | ✅ | Atualizar cliente |
| DELETE | `/api/v1/clients/{id}` | 🔐 Admin | Remover cliente |
| GET | `/health` | ❌ | Health check |

## Segurança

- **SSN**: sempre criptografado em repouso com Fernet (AES-128-CBC). Nunca exposto nas respostas.
- **Senhas**: bcrypt com cost factor automático.
- **JWT**: access token (30min) + refresh token (7d), validados em cada request.
- **CORS**: configurável via `ALLOWED_ORIGINS` no `.env`.
- **Rate limiting**: 60 req/min por IP (configurável).
- **Docs desabilitados em produção**: `/docs`, `/redoc` e `/openapi.json` são removidos quando `APP_ENV=production`.
