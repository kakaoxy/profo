# ProFo Project Context & Agent Guidelines

> **Role:** You are an expert Full-Stack Architect working on ProFo.
> **Mission:** Maintain and evolve a local-first Real Estate Fix & Flip Management System.
> **Core Philosophy:** Data Integrity, Strict Typing, and Domain Decoupling.

---

## 1. Business Domain Architecture (The 4-Stage Model)

**CRITICAL ARCHITECTURE RULE:** The system follows a **"Decoupled + Copy-on-Write"** strategy.

### L1: Market Intelligence (`property_current`)

- **Role:** The Reference (Raw Data).
- **Logic:** Read-only reference pool. Used for sourcing and comparison.
- **Relation:** **NO Foreign Keys** pointing to L2/L3.

### L2: Decision Validation (`leads`)

- **Role:** The Filter (Funnel Neck).
- **Logic:** Feasibility Analysis.
- **Core Metrics:** Must track `target_entry_price` (Cost), `estimated_renovation_cost` (Reno), and `predicted_profit` (ROI).
- **Relation:** "Soft Reference" to L1.

### L3: Asset Production (`projects`)

- **Role:** The Factory (Core ERP).
- **Logic:** The "Source of Truth" for physical assets currently under management.
- **Data Sovereignty:** Must store its own physical attributes (`rooms`, `area`, `layout`) independent of L1.
- **Risk Control:** Manages contract lifecycles, deposits, and renovation costs.
- **Relation:** Created via **Snapshot** from L2.

### L4: Marketing Portfolio (`mini_projects`)

- **Role:** The Storefront & Portfolio (CMS).
- **Logic:** A standalone Content Management System for external display.
- **Data Strategy:**
  - **Active Listings:** Sourced from L3 (Projects).
  - **Legacy/Showcase Cases:** Standalone records for historical success cases (no active L3 record).
- **Relation:** `project_id` is **Nullable**. If linked, it syncs status; if null, it acts as a static portfolio item.

---

## 2. Architectural Principles & Data Flow

### A. The "Copy-on-Write" Rule

- **Never** use JOINs across different Business Domains for critical logic.
- **Always** copy necessary data from the source stage to the next stage.

### B. Soft References & Optional Links

- Use `source_id` or `ref_id` columns to store the ID of the upstream record.
- **L4 Independence:** `mini_projects` must be able to exist without a `projects` parent. Logic must handle `project_id=None` gracefully.

### C. Naming Convention (STRICT)

- **Database & Python (Backend):** ALWAYS use `snake_case`.
  - ✅ `signing_price`, `other_agreements`, `sold_date`
  - ❌ `signingPrice`, `otherAgreements`, `soldDate`
- **TypeScript (Frontend):** ALWAYS use `camelCase` for variables and `PascalCase` for components.

---

## 3. Tech Stack & Engineering Standards

### Backend (FastAPI / Python)

- **Framework:** FastAPI (Async) + SQLAlchemy (AsyncSession).
- **Validation:** Pydantic v2.
- **Code Structure:**
  - Routes (`routers/`) handle HTTP and DTOs.
  - Services (`services/`) handle Business Logic and DB transactions.
  - **Limit:** Files should not exceed 250 lines. Split logic if necessary.
- **Type Hints:** Mandatory for all function arguments and returns.

### Frontend (Next.js / TypeScript)

- **Framework:** Next.js 16 (App Router).
- **UI Library:** shadcn/ui + Tailwind CSS.
- **Type Safety:** strict mode. No `any`. Use `openapi.json` generated types.

---

## 4. Schema Design Guidelines

When modifying or creating tables, adhere to these definitions:

- **Money Fields:** Use `NUMERIC(15, 2)` for all monetary values.
- **Status Fields:** Use String Enums (e.g., 'signed', 'renovating') instead of Integers.
- **JSON Fields:** Use JSON type for flexible, non-searchable data.
- **Physical Attributes:** `projects` table MUST contain: `rooms`, `halls`, `baths`, `orientation`, `area`.
- **Marketing Table (`mini_projects`):**
  - `project_id` must be **Nullable**.
  - Must include distinct `cover_image`, `marketing_title`, `marketing_tags` fields.

---

## 5. API Contract & Response Standards (New)

To ensure smooth `openapi-json` generation and frontend type consumption:

### A. Success Response (The "Direct Return" Rule)

- **Single Object:** Return the Pydantic Schema directly.
  - ✅ Return: `ProjectSchema(...)`
  - ❌ Avoid: `{"code": 200, "data": ProjectSchema(...)}` (Wrappers mess up generated types).
- **HTTP Codes:**
  - `200 OK`: Successful GET/PUT.
  - `201 Created`: Successful POST.
  - `204 No Content`: Successful DELETE.

### B. Pagination Format

All list endpoints must follow this Generic structure:

```json
{
  "items": [ ... ],
  "total": 100,
  "page": 1,
  "size": 20
}
```

### C. Error Response

Use standard HTTPException.

Format: {"detail": "Error message description"}.

Frontend Handling: The generic API client automatically catches non-2xx codes and triggers a Toast notification using the detail field.

## 6. Anti-Patterns (Refuse to Generate)

God Objects: Do not put all logic in main.py.

Mixed Naming: Do not mix camelCase and snake_case in the same file context.

Hard Coupling: Do not write SQL queries that fail if a mini_project has no parent project.

Implicit Any: Do not use any in TypeScript. Rely on generated API types.

```

```
