# frontend/src/lib/ AGENTS.md

## Overview

API clients and utilities - type-safe fetch layer.

## Where to Look

| File | Purpose |
|------|---------|
| `api-server.ts` | Server-side fetch (can read cookies) |
| `api-client.ts` | Client-side fetch + auth middleware |
| `api-upload.ts` | File upload specialized |
| `api-types.d.ts` | **Auto-generated** (177KB) |
| `config.ts` | API_BASE_URL, validation |
| `utils.ts` | cn() Tailwind class merger |

## Conventions

- **Client components**: `api-client.ts`
- **Server components**: `api-server.ts`
- **Types**: Never edit - run `pnpm gen-api`
- **Token refresh**: Middleware handles 5-min proactive refresh

## Commands

```bash
pnpm gen-api   # Regenerate types from openapi.json
```

## Anti-Patterns

**NEVER:**
- Edit `api-types.d.ts` (auto-generated, overwritten)
- Use direct `fetch()` calls (use API clients)
- Put business logic here (utils only)
- Skip `pnpm gen-api` after backend API changes
