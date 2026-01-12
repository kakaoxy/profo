# WeChat Mini Program Module Development Plan

## Goal
Implement a management module for the WeChat Mini Program within the existing ProFo system, including backend support (API, DB) and frontend admin interface.
**Principle**: Zero impact on existing 'Projects' and 'Properties' functionality. The new module will operate on independent tables and only *read* from existing tables.

## 1. Database Architecture (SQLite Compatible)
We will create 3 new tables using Alembic migrations.

### 1.1 Tables
1.  **`consultants`**: Independent consultant management.
2.  **`mini_projects`**:
    -   Links to `projects.id` (Foundational Data Source).
    -   Stores independent marketing content (Title, Cover, Tags).
    -   Stores "Snapshotted" physical data (Address, Area, Price - synced from main project but decoupled).
3.  **`mini_project_photos`**:
    -   Stores photos for the mini program.
    -   Two sources: `origin_photo_id` (Reference to main project photos) OR `image_url` (Direct upload).

### 1.2 Migration Strategy
-   Create a new Alembic revision.
-   Use `sa.String` for UUIDs (as per common SQLite pattern, or `GUID` type if Utils exist).
-   Use `sa.JSON` for `marketing_tags`.
-   Use `sa.Boolean` for status flags.

## 2. Backend Implementation (FastAPI)

### 2.1 Directory Structure
```
backend/
├── models/
│   └── mini.py          # New models (MiniProject, Consultant, MiniProjectPhoto)
├── schemas/
│   └── mini.py          # Pydantic models for Req/Res
├── routers/
│   ├── mini.py          # C-side APIs (/api/v1/mini/*)
│   └── admin/
│       ├── mini_projects.py # Admin Management APIs
│       └── consultants.py   # Consultant Management APIs
└── services/
    ├── mini_service.py  # Logic for Sync, Refresh, Publish
    └── photo_service.py # Logic for Photo mixing (Origin + Upload)
```

### 2.2 Key Features
1.  **Sync Mechanism**: `sync_projects_from_main()` - Scans `projects` table and creates `mini_projects` entries for new items. **Incremental only**.
2.  **Refresh Mechanism**: `refresh_basics(id)` - Overwrites specific physical fields (Area, Price) from Main Project -> Mini Project.
3.  **Photo Resolution**: Endpoint to merge "Origin Photos" (looked up dynamically) and "uploaded photos" into a single list for the frontend.

## 3. Frontend Implementation (Next.js - Admin Only)

### 3.1 Routes
Create new route group `(main)/miniprogram-management`:
-   `/miniprogram-management/projects`: List & Status management.
-   `/miniprogram-management/projects/[id]`: Editor (Marketing info, Photos).
-   `/miniprogram-management/consultants`: CRUD for consultants.

### 3.2 Key Components
1.  **Photo Selector (Complex)**:
    -   Left Panel: Source Photos (grouped by stage).
    -   Right Panel: Selected/Uploaded Photos (Sortable via `@dnd-kit`).
    -   Features: Drag to sort, Click to select, Local upload.
2.  **Sync Button**: Triggers backend sync task.
3.  **Preview Modal**: A simplified mobile-view preview of the listing.

## 4. Development Schedule & Phasing

### Phase 1: Foundation (Backend & DB) - 2 Days
-   [ ] Design SQLAlchemy Models & Generate Alembic Migration.
-   [ ] Implement `Consultant` CRUD APIs.
-   [ ] Implement `MiniProject` Basic CRUD & Sync Logic.
-   [ ] Implement `Photo` management logic (Dual source handling).

### Phase 2: Frontend Admin (Pages) - 2 Days
-   [ ] Create Consultant Management Page.
-   [ ] Create Mini Project List Page (with Sync capabilities).
-   [ ] Create Mini Project Edit Form (Basic Info).

### Phase 3: Advanced Features (Photo Manager) - 1 Day
-   [ ] Implement the Split-Pane Photo Selector.
-   [ ] Integrate `@dnd-kit` for sorting using `origin_photo_id` / `url` mix.

### Phase 4: C-Side API & Polish - 1 Day
-   [ ] Implement `/api/v1/mini/*` public read-only endpoints.
-   [ ] Verification & "Do No Harm" check (Ensure main project flows are untouched).

## 5. Verification Plan

### Automated Tests
-   **Backend Tests**:
    -   Unit tests for `sync_projects` logic (ensure no duplicates).
    -   Unit tests for `photo_resolution` (ensure mixed sources combine correctly).
    -   `pytest backend/tests/test_mini_routes.py`

### Manual Verification
-   **Sync Test**: Create a new "Main Project", click "Sync" in Mini Admin, verify it appears.
-   **Isolation Test**: Edit "Mini Project" title, verify "Main Project" name is UNCHANGED.
-   **Photo Flow**: Select 3 photos from Main Project, Upload 1 new photo. Check API response for `/mini/projects/{id}/renovation` returns 4 items correctly ordered.

## 6. Safety Checklist
-   [ ] No modifications to existing `models/project.py` or `models/property.py`.
-   [ ] No modifications to existing API routers.
-   [ ] Frontend pages added in new isolated directory.
