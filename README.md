# FinPlan — Monorepo

Client management platform for financial planning.

```text
finplan/
├── backend/          FastAPI + Tortoise ORM + SQLite/PostgreSQL
├── frontend/         Vanilla HTML/CSS/JS served by nginx
├── docker-compose.yml          Production
├── docker-compose.dev.yml      Dev overrides (hot reload)
├── Makefile                    Development shortcuts
├── .env.example
└── .env                        (not committed)
```

---

## Architecture

```text
                        ┌─────────────────────────────┐
                        │       finplan_net (bridge)   │
                        │                             │
browser ──► :80 ──►  [ frontend / nginx ]             │
                        │   /api/*  ──proxy──►  [ backend :8000 ] ──► SQLite / PostgreSQL
                        │   /*      ──static──► /usr/share/nginx/html
                        └─────────────────────────────┘
```

* **nginx** is the only port exposed to the host (`80`)
* `/api/*` requests are internally proxied to the **backend** on port `8000`
* The **backend** is never directly accessible in production
* `config.js` is generated at runtime by the frontend container entrypoint

---

## Quickstart

### Prerequisites

* Docker >= 24
* Docker Compose >= 2.20
* `make` (optional, but recommended)

### 1. Configure environment

```bash
git clone <repo> && cd finplan
cp .env.example .env
```

Edit `.env` and fill in the required values:

```bash
SECRET_KEY="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")"
```

### 2. Start in development mode

```bash
make dev
# or
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

| Service  | URL                                                                 |
| -------- | ------------------------------------------------------------------- |
| Frontend | [http://localhost](http://localhost)                                |
| Backend  | [http://localhost/api/v1](http://localhost/api/v1)                  |
| API Docs | [http://localhost:8000/docs](http://localhost:8000/docs) (dev only) |

### 3. Initialize database and create admin user

```bash
make migrate       # runs aerich upgrade
make superuser     # admin creation wizard
```

### 4. Production

```bash
make build         # builds the images
make up            # starts in background
make logs          # follows logs
```

---

## Useful Commands (Makefile)

| Command                           | Description                         |
| --------------------------------- | ----------------------------------- |
| `make dev`                        | Starts with hot reload              |
| `make up`                         | Starts in background (prod)         |
| `make down`                       | Stops containers                    |
| `make build`                      | Rebuilds images                     |
| `make logs`                       | Logs from all services              |
| `make migrate`                    | Applies migrations (aerich upgrade) |
| `make migration NAME=description` | Creates a new migration             |
| `make superuser`                  | Creates admin user                  |
| `make test`                       | Runs tests                          |
| `make lint`                       | Runs ruff                           |
| `make clean`                      | Removes containers + volumes        |

---

## Environment Variables

All defined in the root `.env` file.

| Variable         | Default                         | Description                                      |
| ---------------- | ------------------------------- | ------------------------------------------------ |
| `SECRET_KEY`     | —                               | JWT key (required, min 32 chars)                 |
| `ENCRYPTION_KEY` | —                               | Fernet key for SSN encryption (required in prod) |
| `DATABASE_URL`   | sqlite:///app/data/financial.db | Connection string                                |
| `API_URL`        | /api/v1                         | API URL injected into config.js                  |
| `APP_ENV`        | development                     | development / staging / production               |
| `WORKERS`        | 1                               | Uvicorn workers                                  |
| `LOG_LEVEL`      | INFO                            | DEBUG / INFO / WARNING / ERROR                   |

---

## Migrating to PostgreSQL

1. Uncomment the `db` service in `docker-compose.yml`
2. Update `.env`:

```env
DATABASE_URL=postgres://finplan:finplan_pass@db:5432/finplan_db
```

3. Run:

```bash
make down && make up
```

---

## Detailed Structure

```text
finplan/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   auth.py, clients.py
│   │   ├── core/               config, database, security, logging, deps, exceptions
│   │   ├── middleware/         logging_middleware
│   │   ├── models/             client.py, user.py
│   │   ├── repositories/       client_repository.py
│   │   ├── schemas/            auth.py, client.py
│   │   ├── services/           auth_service.py, client_service.py
│   │   └── main.py
│   ├── migrations/
│   ├── scripts/                create_superuser.py
│   ├── tests/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/
│   ├── css/main.css
│   ├── js/
│   │   ├── storage.js          localStorage CRUD
│   │   ├── api.js              HTTP client for the backend
│   │   └── app.js              SPA logic
│   ├── index.html
│   ├── config.js               Generated at runtime by the entrypoint
│   ├── nginx.conf
│   ├── docker-entrypoint.sh    Injects API_URL into config.js
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
