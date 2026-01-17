# backend/services/ AGENTS.md

## Overview

Business logic layer - 18 service modules with facade pattern.

## Where to Look

| File | Purpose |
|------|---------|
| `project_service.py` | Facade aggregating 4 sub-services |
| `project_core.py` | CRUD with SQLAlchemy optimization (defer/noload) |
| `auth_service.py` | JWT, password, WeChat auth |
| `csv_batch_importer.py` | Bulk CSV import |
| `importer.py` + `parser.py` | Data import pipeline |

## Conventions

- **File size**: ≤200 lines
- **Functions**: Single responsibility, focused
- **Imports**: No routers/ coupling
- **Types**: Receive plain types, return plain types
- **Exceptions**: `ProfoException` for business errors

## Anti-Patterns

**NEVER:**
- Import from `routers/` (cross-layer coupling)
- Handle HTTP headers or request parsing
- Use FastAPI `Depends()` directly
- Mix HTTP concerns with business logic
