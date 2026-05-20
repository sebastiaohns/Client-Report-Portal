# FinPlan — Monorepo

Plataforma de gerenciamento de clientes para planejamento financeiro.

```
finplan/
├── backend/          FastAPI + Tortoise ORM + SQLite/PostgreSQL
├── frontend/         Vanilla HTML/CSS/JS servido por nginx
├── docker-compose.yml          Produção
├── docker-compose.dev.yml      Dev overrides (hot reload)
├── Makefile                    Atalhos de desenvolvimento
├── .env.example
└── .env                        (não commitado)
```

---

## Arquitetura

```
                        ┌─────────────────────────────┐
                        │       finplan_net (bridge)   │
                        │                             │
browser ──► :80 ──►  [ frontend / nginx ]             │
                        │   /api/*  ──proxy──►  [ backend :8000 ] ──► SQLite / PostgreSQL
                        │   /*      ──static──► /usr/share/nginx/html
                        └─────────────────────────────┘
```

- O **nginx** é a única porta exposta ao host (`80`)
- Requisições `/api/*` são repassadas internamente ao **backend** na porta `8000`
- O **backend** nunca é acessível diretamente em produção
- O `config.js` é gerado em tempo de execução pelo entrypoint do container frontend

---

## Quickstart

### Pré-requisitos
- Docker >= 24
- Docker Compose >= 2.20
- `make` (opcional, mas recomendado)

### 1. Configurar ambiente

```bash
git clone <repo> && cd finplan
cp .env.example .env
```

Edite `.env` e preencha obrigatoriamente:
```bash
SECRET_KEY="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")"
```

### 2. Subir em desenvolvimento

```bash
make dev
# ou
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

| Serviço   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost           |
| Backend   | http://localhost/api/v1    |
| API Docs  | http://localhost:8000/docs (somente dev) |

### 3. Inicializar banco e criar admin

```bash
make migrate       # roda aerich upgrade
make superuser     # wizard de criação de admin
```

### 4. Produção

```bash
make build         # builda as imagens
make up            # sobe em background
make logs          # acompanha os logs
```

---

## Comandos úteis (Makefile)

| Comando | Descrição |
|---|---|
| `make dev` | Sobe com hot reload |
| `make up` | Sobe em background (prod) |
| `make down` | Para os containers |
| `make build` | Rebuilda imagens |
| `make logs` | Logs de todos os serviços |
| `make migrate` | Aplica migrations (aerich upgrade) |
| `make migration NAME=descricao` | Cria nova migration |
| `make superuser` | Cria usuário admin |
| `make test` | Roda testes |
| `make lint` | Roda ruff |
| `make clean` | Remove containers + volumes |

---

## Variáveis de ambiente

Todas definidas em `.env` na raiz do monorepo.

| Variável | Padrão | Descrição |
|---|---|---|
| `SECRET_KEY` | — | Chave JWT (obrigatória, min 32 chars) |
| `ENCRYPTION_KEY` | — | Fernet key para SSN (obrigatória em prod) |
| `DATABASE_URL` | sqlite:///app/data/financial.db | Connection string |
| `API_URL` | /api/v1 | URL da API injetada no config.js |
| `APP_ENV` | development | development / staging / production |
| `WORKERS` | 1 | Workers uvicorn |
| `LOG_LEVEL` | INFO | DEBUG / INFO / WARNING / ERROR |

---

## Migrar para PostgreSQL

1. Descomente o serviço `db` em `docker-compose.yml`
2. Ajuste `.env`:
```env
DATABASE_URL=postgres://finplan:finplan_pass@db:5432/finplan_db
```
3. `make down && make up`

---

## Estrutura detalhada

```
finplan/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   auth.py, clients.py
│   │   ├── core/               config, database, security, logging, deps, exceptions
│   │   ├── middleware/          logging_middleware
│   │   ├── models/              client.py, user.py
│   │   ├── repositories/        client_repository.py
│   │   ├── schemas/             auth.py, client.py
│   │   ├── services/            auth_service.py, client_service.py
│   │   └── main.py
│   ├── migrations/
│   ├── scripts/                 create_superuser.py
│   ├── tests/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/
│   ├── css/main.css
│   ├── js/
│   │   ├── storage.js          CRUD localStorage
│   │   ├── api.js              HTTP client para o backend
│   │   └── app.js              Lógica da SPA
│   ├── index.html
│   ├── config.js               Gerado em runtime pelo entrypoint
│   ├── nginx.conf
│   ├── docker-entrypoint.sh    Injeta API_URL no config.js
│   ├── Dockerfile
│   └── .dockerignore
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
├── .env.example
├── .env
└── .gitignore
```
