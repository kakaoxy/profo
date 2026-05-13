# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Profo 房产数据中心 — a real estate data center with a FastAPI backend (Python) and Next.js frontend (TypeScript), deployed on Alibaba Cloud with PM2 + Nginx. Uses SQLite as the database.

## Development Commands

### Backend (`backend/`)

```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000   # start dev server
uv run python init_db.py                                        # create all DB tables
uv run alembic upgrade head                                     # run pending migrations
uv run alembic revision --autogenerate -m "description"         # create new migration
uv run pytest                                                   # run tests (requires conftest.py env setup)
uv run pytest tests/test_file_upload_security.py -v             # run a single test file
uv sync                                                         # install dependencies
```

### Frontend (`frontend/`)

```bash
cd frontend
pnpm dev                    # start Next.js dev server (port 3000)
pnpm build                  # production build
pnpm lint                   # ESLint (max-warnings 0)
pnpm test                   # run Vitest unit tests
pnpm test:watch             # Vitest in watch mode
pnpm test:e2e               # Playwright E2E tests
pnpm gen-api                # regenerate API types from running backend's /openapi.json
```

### Deploy

```bash
cd deploy
.\deploy.bat                # Windows: build, upload, and restart on server via PM2
bash deploy.sh              # Linux/Mac equivalent
```

## Architecture

### Backend Structure

```
backend/
├── main.py              # FastAPI app entry point, route registration, exception handlers
├── db.py                # SQLAlchemy engine, SessionLocal, get_db() dependency, init_db()
├── settings.py          # Pydantic Settings (env vars, DB URL, JWT, WeChat, CORS, uploads)
├── common.py            # shared slowapi Limiter instance
├── conftest.py          # pytest session fixture (test DB, env vars)
├── models/              # SQLAlchemy ORM models by business domain
│   ├── __init__.py      #   re-exports all models + Base
│   ├── common/          #   Base, BaseModel, enum types (PropertyStatus, LeadStatus, etc.)
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
├── utils/auth/          # password hashing (passlib/bcrypt), JWT token create/decode/validate
└── alembic/             # Database migration scripts
```

### Key Backend Patterns

- **Dependency injection**: `DbSessionDep` (`Annotated[Session, Depends(get_db)]`) for DB sessions. Auth deps are predefined in `dependencies/auth.py` — use `CurrentUserDep`, `CurrentAdminUserDep`, etc.
- **Service exceptions**: Use `services/system/exceptions.py` (`ServiceException`, `AuthenticationError`, `ResourceNotFoundError`, etc.) in service layer. Routers catch these via registered exception handlers — never raise `HTTPException` from services.
- **Auth flow**: Supports JWT (`Authorization: Bearer` header or `access_token` httpOnly cookie) + API Key (`X-API-Key` header). Tokens stored in httpOnly cookies; no localStorage.
- **Rate limiting**: `slowapi` Limiter from `common.py` — defaults 200/day, 50/hour. Applied with `@limiter.limit("5/minute")` decorators on endpoints.
- **API prefix**: All routes under `/api/v1/` except root health check.

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
- **Dev proxy**: Next.js `rewrites` proxy `/api/*` to `http://127.0.0.1:8000/api/*` in dev, avoiding CORS cookie issues. Production uses direct backend URL.
- **Auth guard**: `(main)/layout.tsx` calls `GET /api/v1/auth/me` — if null/401, redirects to `/login`. Marked `force-dynamic` for cookie access.
- **shadcn/ui component library** with Tailwind CSS v4 and `tw-animate-css`.
- **State management**: SWR for data fetching, nuqs for URL search params state, react-hook-form + zod for forms.
- **Testing**: Vitest with jsdom for unit tests, Playwright for E2E. Test setup at `src/test/setup.ts`.

### Database

- SQLite with WAL mode via SQLAlchemy QueuePool (pool_size=10, foreign_keys enforced on connect)
- Alembic for migrations (SQLite batch mode for ALTER compatibility)
- Connection string from `DATABASE_URL` env var (default: `sqlite:///./data.db`)

### Environment Variables

Backend reads from `.env`. Required vars: `JWT_SECRET_KEY`, `WECHAT_APPID`, `WECHAT_SECRET`. See `backend/.env.example` for all options. Tests use `conftest.py` which sets dummy required vars and creates a temp `test.db`.
