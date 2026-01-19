# ProFo 房产数据中心

**Generated:** 2026-01-17 | **Commit:** 5160a9f | **Branch:** main

## Overview

全栈本地化应用 - FastAPI 后端 + Next.js 前端，房产数据管理平台。

## Structure

```
ProFo/
├── backend/           # Python/FastAPI (port 8000)
│   ├── main.py        # Entry: CORS, middleware, 13 routers
│   ├── routers/       # 16 API modules (kebab-case routes)
│   ├── services/      # 18 business logic modules
│   ├── models/        # SQLAlchemy (snake_case fields)
│   ├── schemas/       # Pydantic (request/response)
│   ├── tests/         # 16 pytest files
│   ├── db.py          # SQLite engine + session
│   └── settings.py    # JWT, CORS, env config
├── frontend/          # Next.js 16 (port 3000)
│   ├── src/app/       # App Router: (main)/, login/
│   ├── src/lib/       # 3 API clients, api-types.d.ts
│   ├── src/components/ui/  # shadcn/ui base
│   └── next.config.ts # React Compiler, Turbopack
├── deploy/            # PM2, nginx, SSL scripts
├── openapi.json       # API spec (pnpm gen-api source)
└── start.*            # Both-servers launcher
```

## Where to Look

| Task              | Location                                                 |
| ----------------- | -------------------------------------------------------- |
| Add API endpoint  | `backend/routers/` + `backend/services/`                 |
| Business logic    | `backend/services/` (facade: `project_service.py`)       |
| Frontend API call | `frontend/src/lib/` (api-server, api-client, api-upload) |
| Add page          | `frontend/src/app/(main)/` or `frontend/src/app/login/`  |
| shadcn component  | `frontend/src/components/ui/` + extend                   |
| Tests             | `backend/tests/` (pytest, in-memory SQLite)              |
| Config            | `backend/settings.py`, `frontend/src/lib/config.ts`      |

## Conventions (Deviations Only)

### Python (backend/)

- **Import order**: stdlib → third-party → local (relative paths first)
- **Quotes**: `"` double quotes only
- **Naming**: snake_case vars/funcs, PascalCase classes, UPPER_SNAKE_CASE constants
- **Routes**: kebab-case (`/api/v1/user-projects`)
- **File size**: ≤250 lines, split at 200
- **Type hints**: Mandatory params/returns, `Optional[T]` not `Union[T, None]`
- **Exceptions**: `ProfoException` (business), `HTTPException` (HTTP)

### TypeScript (frontend/)

- **Import order**: React → third-party → shadcn → @/\* → relative
- **Quotes**: `'` single quotes only
- **Semicolons**: Required
- **Naming**: PascalCase components, camelCase vars/funcs
- **File size**: Components ≤150 lines, split to `_components/`
- **Types**: No `any` (use `unknown` + type guards)
- **API types**: From `src/lib/api-types.d.ts` (run `pnpm gen-api` after backend changes)

## Anti-Patterns (THIS PROJECT)

**NEVER:**

- TODO/FIXME/HACK comments in code
- `any`, `@ts-ignore`, `@ts-expect-error`
- Empty catch blocks `catch(e) {}`
- Single quotes in Python, double quotes in TypeScript
- Missing type annotations on functions
- Files exceeding limits (250/200 lines)

## Commands

```bash
# Backend
uv run pytest                    # Tests
uv run python main.py            # Dev server (8000)
uv run pytest -v                 # Verbose tests

# Frontend
pnpm dev                         # Dev server (3000)
pnpm lint                        # ESLint
pnpm gen-api                     # Generate types from openapi.json
pnpm build                       # Production build

# Both
start.bat / start.sh             # Launch both servers
```

## Notes

- **No CI/CD**: Manual deploy via `deploy.bat`/`deploy.sh` + PM2
- **No frontend tests**: Only backend pytest configured
- **JWT secret**: Must set `JWT_SECRET_KEY` env (32+ chars, `openssl rand -hex 32`)
- **API type sync**: Run `pnpm gen-api` after any backend API change
