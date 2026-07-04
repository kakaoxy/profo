# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Profo 房产数据中心 — a real estate data center with a FastAPI backend (Python 3.13) and Next.js 16 frontend (TypeScript), deployed via Docker Compose with PostgreSQL 16, Nginx, and four services (`db` / `backend` / `frontend` / `nginx`). SQLite remains as a dev/test fallback (pytest uses SQLite in-memory).

## Development Commands

### Backend (`backend/`)

```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000   # start dev server
uv run python init_db.py                                        # create all DB tables
uv run python init_admin.py                                     # initialize roles + admin user
uv run pytest                                                   # run tests (requires conftest.py env setup)
uv run pytest tests/test_file_upload_security.py -v             # run a single test file
uv sync                                                         # install dependencies
```

### Frontend (`frontend/`)

```bash
cd frontend
pnpm dev                    # start Next.js dev server (port 3000)
pnpm build                  # production build (standalone output)
pnpm lint                   # ESLint (max-warnings 0)
pnpm test                   # run Vitest unit tests
pnpm test:watch             # Vitest in watch mode
pnpm test:e2e               # Playwright E2E tests
pnpm gen-api                # regenerate API types from running backend's /openapi.json
```

### Docker (preferred for both dev and prod)

```bash
./start.sh                 # start all services (db / backend / frontend / nginx)
./start.sh stop            # stop (preserve containers + volumes)
./start.sh restart         # restart
./start.sh logs            # tail all logs (last 100 lines)
./start.sh status          # show container status
./start.sh down            # stop + remove containers (preserve volumes)
./start.sh rebuild         # rebuild images and restart
docker compose exec backend .venv/bin/python init_admin.py    # initialize admin (first deploy)
```

## Architecture

### Backend Structure

```
backend/
├── main.py              # FastAPI app entry point, route registration, exception handlers, lifespan (init_db + run_startup_migrations)
├── db.py                # SQLAlchemy engine, SessionLocal, get_db() dependency, init_db() — SQLite/PG dialect branches
├── settings.py          # Pydantic Settings (env vars, DB URL, JWT, WeChat, CORS, uploads)
├── conftest.py          # pytest session fixture (SQLite in-memory test DB, env vars)
├── models/              # SQLAlchemy ORM models by business domain
│   ├── __init__.py      #   re-exports all models + Base
│   ├── common/          #   Base, BaseModel, enum types (PropertyStatus, LeadStatus, etc.), EncryptedString
│   ├── property/        #   Community, PropertyCurrent, PropertyHistory, PropertyMedia
│   ├── project/         #   Project, ProjectSale, FinanceRecord, RenovationPhoto, etc.
│   ├── user/            #   User, Role, ApiKey
│   ├── lead/            #   Lead, LeadFollowUp, LeadPriceHistory
│   ├── marketing/       #   L4MarketingProject, L4MarketingMedia
│   └── system/          #   FailedRecord, PropertyImportTask
├── routers/             # FastAPI APIRouter modules (thin — delegate to services)
│   ├── market/          #   properties, communities
│   ├── leads/           #   leads CRUD
│   ├── projects/        #   core, renovation, sales, cashflow
│   ├── marketing/       #   L4 marketing projects, CSV import
│   ├── system/          #   auth, users, roles
│   ├── common/          #   file upload, push notifications
│   └── monitor/         #   health/metrics
├── services/            # Business logic layer (mirrors routers structure)
├── schemas/             # Pydantic request/response schemas by domain
├── dependencies/        # FastAPI Depends factories (auth.py: JWT + API Key, DbSessionDep)
├── utils/               # auth / crypto / csv_exporter / file_security / formatters / jwt_validator / mask / param_parser / query_params / security_logger
├── migrations/          # Idempotent startup migrations (column adds, plaintext encryption, URL fixes)
└── scripts/             # One-shot scripts (e.g., migrate_sqlite_to_pg.py)
```

### Key Backend Patterns

- **Dependency injection**: `DbSessionDep` (`Annotated[Session, Depends(get_db)]`) for DB sessions. Auth deps are predefined in `dependencies/auth.py` — use `CurrentUserDep`, `CurrentAdminUserDep`, etc.
- **Service exceptions**: Use `services/system/exceptions.py` (`ServiceException`, `AuthenticationError`, `ResourceNotFoundError`, etc.) in service layer. Routers catch these via registered exception handlers — never raise `HTTPException` from services.
- **Auth flow**: Supports JWT (`Authorization: Bearer` header or `access_token` httpOnly cookie) + API Key (`X-API-Key` header). Tokens stored in httpOnly cookies; no localStorage.
- **Rate limiting**: `slowapi` Limiter — defaults 200/day, 50/hour. Applied with `@limiter.limit("5/minute")` decorators on endpoints.
- **API prefix**: All routes under `/api/v1/` except root health check.
- **Encrypted fields**: `EncryptedString` (TypeDecorator) auto-encrypts via `process_bind_param` and auto-decrypts via `process_result_value`. Bypassed by raw SQL `SELECT *` — see `migrate_sqlite_to_pg.py` for handling.
- **Timezone handling**: All `DateTime` columns use `DateTime(timezone=True)`. PostgreSQL stores `TIMESTAMP WITH TIME ZONE`. SQLite naive datetime is patched to UTC in the migration script.

### Frontend Structure

```
frontend/src/
├── app/
│   ├── (main)/              # route group — auth-protected pages (layout checks /auth/me, redirects to /login)
│   │   ├── layout.tsx       #   sidebar layout + auth guard
│   │   ├── page.tsx         #   dashboard home
│   │   ├── properties/      #   property management (list, upload, governance)
│   │   ├── projects/        #   project management + cashflow
│   │   ├── leads/           #   lead management
│   │   ├── l4-marketing/    #   L4 marketing projects CRUD + preview
│   │   ├── users/           #   user & role management
│   │   └── settings/        #   API key management
│   └── login/               # login page + server actions (auth, refresh)
├── components/
│   ├── ui/                  # shadcn/ui primitives (radix + tailwind)
│   └── common/              # shared business components
├── lib/
│   ├── api-types.d.ts       # generated OpenAPI types (pnpm gen-api)
│   ├── api-server.ts        # fetchClient() — server-side API client with 401 auto-refresh
│   ├── api-client.ts        # client-side API client with credentials middleware + 401 handling
│   ├── config.ts            # API URL config, getApiUrl(), getClientApiUrl(), getFileUrl()
│   └── token-refresh-server.ts  # server-side token refresh with cache/dedup
└── hooks/                   # shared React hooks
```

### Key Frontend Patterns

- **Two API clients**: `fetchClient()` (from `api-server.ts`) for Server Components/Actions — reads cookies directly, auto-refreshes on 401. `client` (from `api-client.ts`) for Client Components — uses httpOnly cookies via `credentials: "include"`, redirects to `/login` on refresh failure.
- **Dev proxy**: Next.js `rewrites` proxy `/api/*` to `http://127.0.0.1:8000/api/*` in dev, avoiding CORS cookie issues. Production (Docker) uses `SERVER_API_URL=http://backend:8000` to let Server Actions reach the backend container directly (NOT `127.0.0.1:8000`, which would point to the frontend container itself).
- **Auth guard**: `(main)/layout.tsx` calls `GET /api/v1/auth/me` — if null/401, redirects to `/login`. Marked `force-dynamic` for cookie access.
- **shadcn/ui component library** with Tailwind CSS v4 and `tw-animate-css`.
- **State management**: SWR for data fetching, nuqs for URL search params state, react-hook-form + zod for forms.
- **Testing**: Vitest with jsdom for unit tests, Playwright for E2E. Test setup at `src/test/setup.ts`.

### Docker Compose Services

| Service | Image / Build | Port | Volumes | Notes |
|---------|---------------|------|---------|-------|
| `db` | `postgres:16-alpine` | expose 5432 | `pgdata` | healthcheck via `pg_isready` |
| `backend` | `./backend` (multi-stage: uv sync → uvicorn) | expose 8000 | `uploads:/app/static/uploads` | env_file `.env`; `DATABASE_URL` overridden to use `db` host |
| `frontend` | `./frontend` (3-stage: pnpm install → next build standalone → node server.js) | expose 3000 | - | `SERVER_API_URL=http://backend:8000` for Server Actions |
| `nginx` | `nginx:alpine` | 80:80 | `docker/nginx.conf` + `uploads:/app/uploads:ro` | reverse proxy + static uploads |

### Database

- **Production**: PostgreSQL 16 via `postgresql+psycopg://` dialect (psycopg[binary] driver).
- **Dev/Test fallback**: SQLite via `sqlite:///./data.db`. `db.py` branches on `_is_sqlite` for `check_same_thread` and `PRAGMA foreign_keys=ON`.
- **Pytest**: `conftest.py` uses SQLite in-memory (`sqlite:///:memory:`) for speed.
- **Schema bootstrap**: `Base.metadata.create_all(bind=engine)` on app startup via `init_db()` in `main.py` lifespan.
- **Idempotent startup migrations**: `backend/migrations/` (column adds, plaintext-to-encrypted, URL fixes) executed via `run_startup_migrations(engine)` after `init_db()`. Schema changes for production should also be managed via Alembic.
- **Connection pool**: `QueuePool` (`pool_size=10`, `max_overflow=20`, `pool_pre_ping=True`, `pool_recycle=3600`).

### Environment Variables

Docker deployment reads from project-root `.env` (template: `.env.docker.example`), injected via `docker-compose.yml`'s `env_file: .env`. Required vars: `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, `WECHAT_APPID`, `WECHAT_SECRET`. The compose file overrides `DATABASE_URL` to `postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}` so the `.env`'s `DATABASE_URL` is just a placeholder.

Docker-only env (set in `docker-compose.yml`, not in `.env`):
- `frontend.environment.SERVER_API_URL=http://backend:8000` — lets Server Actions reach the backend container (NOT 127.0.0.1:8000, which points to the frontend container itself).
