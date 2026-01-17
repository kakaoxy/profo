# backend/tests/ AGENTS.md

## Overview

Pytest test suite - 16 test files with in-memory SQLite.

## Where to Look

| File | Tests |
|------|-------|
| `test_auth.py` | Auth + multi-role user fixtures |
| `test_projects.py` | Project CRUD + lifecycle |
| `test_upload.py` | CSV import + Mock UploadFile |
| `test_status_flow.py` | Project state machine |
| `test_api.py` | Property query integration |
| Others | 11 more specialized tests |

## Conventions

- **Organization**: Class-based `TestClassName`
- **Docstrings**: Chinese
- **Methods**: `test_*` (snake_case)
- **Fixtures**: Inline (no conftest.py)
- **Database**: `sqlite:///:memory:` + dependency override

## Commands

```bash
uv run pytest                    # All tests
uv run pytest test_auth.py       # Single file
uv run pytest test_auth.py::test_login_success  # Single test
```

## Anti-Patterns

**NEVER:**
- Skip db_session/client fixtures
- Hardcode test data (use fixtures)
- Forget `app.dependency_overrides.clear()` after tests
