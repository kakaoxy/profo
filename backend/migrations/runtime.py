from __future__ import annotations

from sqlalchemy.engine import Engine


def _get_sqlite_columns(engine: Engine, table_name: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.exec_driver_sql(f"PRAGMA table_info('{table_name}')").fetchall()
    return {row[1] for row in rows}


def ensure_project_physical_fields(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    existing = _get_sqlite_columns(engine, "projects")

    to_add: list[tuple[str, str]] = []
    if "rooms" not in existing:
        to_add.append(("rooms", "INTEGER"))
    if "halls" not in existing:
        to_add.append(("halls", "INTEGER"))
    if "baths" not in existing:
        to_add.append(("baths", "INTEGER"))
    if "orientation" not in existing:
        to_add.append(("orientation", "VARCHAR(50)"))
    if "layout" not in existing:
        to_add.append(("layout", "VARCHAR(50)"))

    if not to_add:
        return

    with engine.begin() as conn:
        for col, col_type in to_add:
            conn.exec_driver_sql(f"ALTER TABLE projects ADD COLUMN {col} {col_type}")

        if {"communities", "property_current"}.issubset(_get_existing_tables(engine)):
            conn.exec_driver_sql(
                """
                UPDATE projects
                SET
                  rooms = COALESCE(rooms, (
                    SELECT pc.rooms
                    FROM property_current pc
                    JOIN communities c ON c.id = pc.community_id
                    WHERE c.name = projects.community_name
                    LIMIT 1
                  )),
                  halls = COALESCE(halls, (
                    SELECT pc.halls
                    FROM property_current pc
                    JOIN communities c ON c.id = pc.community_id
                    WHERE c.name = projects.community_name
                    LIMIT 1
                  )),
                  baths = COALESCE(baths, (
                    SELECT pc.baths
                    FROM property_current pc
                    JOIN communities c ON c.id = pc.community_id
                    WHERE c.name = projects.community_name
                    LIMIT 1
                  )),
                  orientation = COALESCE(orientation, (
                    SELECT pc.orientation
                    FROM property_current pc
                    JOIN communities c ON c.id = pc.community_id
                    WHERE c.name = projects.community_name
                    LIMIT 1
                  ))
                WHERE community_name IS NOT NULL
                  AND (rooms IS NULL OR halls IS NULL OR baths IS NULL OR orientation IS NULL)
                """
            )

        conn.exec_driver_sql(
            """
            UPDATE projects
            SET layout = CASE
              WHEN layout IS NOT NULL THEN layout
              WHEN rooms IS NULL THEN NULL
              ELSE
                CAST(rooms AS TEXT) || '室' ||
                COALESCE(CAST(halls AS TEXT), '') || CASE WHEN halls IS NULL THEN '' ELSE '厅' END ||
                COALESCE(CAST(baths AS TEXT), '') || CASE WHEN baths IS NULL THEN '' ELSE '卫' END
            END
            WHERE layout IS NULL
            """
        )


def _get_existing_tables(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    return {row[0] for row in rows}


def ensure_project_snake_case_columns(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    existing = _get_sqlite_columns(engine, "projects")

    renames: list[tuple[str, str]] = [
        ("otherAgreements", "other_agreements"),
        ("extensionPeriod", "extension_period"),
        ("extensionRent", "extension_rent"),
        ("costAssumption", "cost_assumption"),
        ("channelManager", "channel_manager"),
        ("viewingRecords", "viewing_records"),
        ("offerRecords", "offer_records"),
        ("negotiationRecords", "negotiation_records"),
        ("soldPrice", "sold_price"),
        ("soldDate", "sold_date"),
        ("renovationStageDates", "renovation_stage_dates"),
    ]

    with engine.begin() as conn:
        for old, new in renames:
            if old in existing and new not in existing:
                conn.exec_driver_sql(
                    f'ALTER TABLE projects RENAME COLUMN "{old}" TO {new}'
                )


def ensure_projects_roi_numeric(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info('projects')").fetchall()

    col_types = {c[1]: (c[2] or "").upper() for c in cols}
    if col_types.get("roi") != "FLOAT":
        return

    with engine.begin() as conn:
        conn.exec_driver_sql('ALTER TABLE projects RENAME COLUMN "roi" TO roi_float')
        conn.exec_driver_sql(
            "ALTER TABLE projects ADD COLUMN roi NUMERIC(10, 2) NOT NULL DEFAULT 0"
        )
        conn.exec_driver_sql(
            "UPDATE projects SET roi = ROUND(roi_float, 2) WHERE roi_float IS NOT NULL"
        )
        conn.exec_driver_sql("ALTER TABLE projects DROP COLUMN roi_float")


def ensure_leads_area_numeric(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info('leads')").fetchall()

    col_types = {c[1]: (c[2] or "").upper() for c in cols}
    if col_types.get("area") != "FLOAT":
        return

    with engine.begin() as conn:
        conn.exec_driver_sql('ALTER TABLE leads RENAME COLUMN "area" TO area_float')
        conn.exec_driver_sql("ALTER TABLE leads ADD COLUMN area NUMERIC(10, 2)")
        conn.exec_driver_sql(
            "UPDATE leads SET area = ROUND(area_float, 2) WHERE area_float IS NOT NULL"
        )
        conn.exec_driver_sql("ALTER TABLE leads DROP COLUMN area_float")


def ensure_property_current_numeric_fields(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info('property_current')").fetchall()

    col_types = {c[1]: (c[2] or "").upper() for c in cols}
    if col_types.get("build_area") != "FLOAT":
        return

    has_inner_area = "inner_area" in col_types
    has_listed_price = "listed_price_wan" in col_types
    has_sold_price = "sold_price_wan" in col_types

    with engine.begin() as conn:
        _drop_property_current_indexes(conn)

        conn.exec_driver_sql(
            'ALTER TABLE property_current RENAME COLUMN "build_area" TO build_area_float'
        )
        conn.exec_driver_sql(
            "ALTER TABLE property_current ADD COLUMN build_area NUMERIC(10, 2) NOT NULL DEFAULT 0"
        )
        conn.exec_driver_sql(
            "UPDATE property_current SET build_area = ROUND(build_area_float, 2)"
        )

        if has_inner_area:
            conn.exec_driver_sql(
                'ALTER TABLE property_current RENAME COLUMN "inner_area" TO inner_area_float'
            )
            conn.exec_driver_sql(
                "ALTER TABLE property_current ADD COLUMN inner_area NUMERIC(10, 2)"
            )
            conn.exec_driver_sql(
                "UPDATE property_current SET inner_area = ROUND(inner_area_float, 2) WHERE inner_area_float IS NOT NULL"
            )

        if has_listed_price:
            conn.exec_driver_sql(
                'ALTER TABLE property_current RENAME COLUMN "listed_price_wan" TO listed_price_wan_float'
            )
            conn.exec_driver_sql(
                "ALTER TABLE property_current ADD COLUMN listed_price_wan NUMERIC(15, 2)"
            )
            conn.exec_driver_sql(
                "UPDATE property_current SET listed_price_wan = ROUND(listed_price_wan_float, 2) WHERE listed_price_wan_float IS NOT NULL"
            )

        if has_sold_price:
            conn.exec_driver_sql(
                'ALTER TABLE property_current RENAME COLUMN "sold_price_wan" TO sold_price_wan_float'
            )
            conn.exec_driver_sql(
                "ALTER TABLE property_current ADD COLUMN sold_price_wan NUMERIC(15, 2)"
            )
            conn.exec_driver_sql(
                "UPDATE property_current SET sold_price_wan = ROUND(sold_price_wan_float, 2) WHERE sold_price_wan_float IS NOT NULL"
            )

        conn.exec_driver_sql("ALTER TABLE property_current DROP COLUMN build_area_float")
        if has_inner_area:
            conn.exec_driver_sql("ALTER TABLE property_current DROP COLUMN inner_area_float")
        if has_listed_price:
            conn.exec_driver_sql(
                "ALTER TABLE property_current DROP COLUMN listed_price_wan_float"
            )
        if has_sold_price:
            conn.exec_driver_sql(
                "ALTER TABLE property_current DROP COLUMN sold_price_wan_float"
            )

        _create_property_current_indexes(conn)


def _drop_property_current_indexes(conn) -> None:
    indexes = [
        "idx_community_price",
        "idx_owner_visibility",
        "idx_status",
        "idx_price_range",
        "idx_area_range",
        "idx_rooms",
        "idx_floor_info",
        "idx_dates",
        "idx_build_year",
        "idx_property_type",
        "idx_orientation",
    ]
    for idx in indexes:
        conn.exec_driver_sql(f"DROP INDEX IF EXISTS {idx}")


def _create_property_current_indexes(conn) -> None:
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_community_price ON property_current (community_id, listed_price_wan)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_owner_visibility ON property_current (owner_id, visibility)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_status ON property_current (status)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_price_range ON property_current (listed_price_wan, sold_price_wan)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_area_range ON property_current (build_area)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_rooms ON property_current (rooms)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_floor_info ON property_current (floor_level, floor_number)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_dates ON property_current (listed_date, sold_date, updated_at)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_build_year ON property_current (build_year)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_property_type ON property_current (property_type)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_orientation ON property_current (orientation)"
    )


def ensure_leads_source_property_soft_ref(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('leads')").fetchall()}
        fk = conn.exec_driver_sql("PRAGMA foreign_key_list('leads')").fetchall()

    if "source_property_id" not in cols and "source_property_id_fk" not in cols:
        return

    has_property_fk = any(
        row[2] == "property_current"
        and row[3] in {"source_property_id", "source_property_id_fk"}
        for row in fk
    )
    if not has_property_fk:
        return

    if "source_property_id" in cols and "source_property_id_fk" in cols:
        source_property_expr = "COALESCE(source_property_id, source_property_id_fk)"
    elif "source_property_id_fk" in cols:
        source_property_expr = "source_property_id_fk"
    else:
        source_property_expr = "source_property_id"

    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS leads_tmp")
        conn.exec_driver_sql(
            """
            CREATE TABLE leads_tmp (
              id VARCHAR(36) NOT NULL,
              community_name VARCHAR(200) NOT NULL,
              is_hot INTEGER,
              layout VARCHAR(50),
              orientation VARCHAR(50),
              floor_info VARCHAR(50),
              total_price NUMERIC(15, 2),
              unit_price NUMERIC(15, 2),
              eval_price NUMERIC(15, 2),
              status VARCHAR(18) NOT NULL,
              audit_reason TEXT,
              auditor_id VARCHAR(36),
              audit_time DATETIME,
              images JSON,
              district VARCHAR(50),
              business_area VARCHAR(50),
              remarks TEXT,
              creator_id VARCHAR(36),
              source_property_id INTEGER,
              last_follow_up_at DATETIME,
              created_at DATETIME,
              updated_at DATETIME,
              area NUMERIC(10, 2),
              PRIMARY KEY (id),
              FOREIGN KEY(creator_id) REFERENCES users (id),
              FOREIGN KEY(auditor_id) REFERENCES users (id)
            )
            """
        )
        conn.exec_driver_sql(
            """
            INSERT INTO leads_tmp (
              id,
              community_name,
              is_hot,
              layout,
              orientation,
              floor_info,
              total_price,
              unit_price,
              eval_price,
              status,
              audit_reason,
              auditor_id,
              audit_time,
              images,
              district,
              business_area,
              remarks,
              creator_id,
              source_property_id,
              last_follow_up_at,
              created_at,
              updated_at,
              area
            )
            SELECT
              id,
              community_name,
              is_hot,
              layout,
              orientation,
              floor_info,
              total_price,
              unit_price,
              eval_price,
              status,
              audit_reason,
              auditor_id,
              audit_time,
              images,
              district,
              business_area,
              remarks,
              creator_id,
              """
            + source_property_expr
            + """,
              last_follow_up_at,
              created_at,
              updated_at,
              area
            FROM leads
            """
        )
        conn.exec_driver_sql("DROP TABLE leads")
        conn.exec_driver_sql("ALTER TABLE leads_tmp RENAME TO leads")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_lead_status ON leads (status)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_lead_community ON leads (community_name)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_lead_creator ON leads (creator_id)")


def ensure_mini_projects_project_soft_ref(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info('mini_projects')").fetchall()}
        fk = conn.exec_driver_sql("PRAGMA foreign_key_list('mini_projects')").fetchall()

    if "project_id" not in cols and "project_id_fk" not in cols:
        return

    has_project_fk = any(
        row[2] == "projects" and row[3] in {"project_id", "project_id_fk"} for row in fk
    )
    if not has_project_fk:
        return

    if "project_id" in cols and "project_id_fk" in cols:
        project_id_expr = "COALESCE(project_id, project_id_fk)"
    elif "project_id_fk" in cols:
        project_id_expr = "project_id_fk"
    else:
        project_id_expr = "project_id"

    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS mini_projects_tmp")
        conn.exec_driver_sql(
            """
            CREATE TABLE mini_projects_tmp (
              project_id VARCHAR(36),
              consultant_id VARCHAR(36),
              title VARCHAR(200) NOT NULL,
              cover_image TEXT,
              style VARCHAR(50),
              description TEXT,
              marketing_tags JSON,
              share_title VARCHAR(100),
              share_image TEXT,
              view_count INTEGER,
              address VARCHAR(500),
              area NUMERIC(10, 2),
              price NUMERIC(15, 2),
              layout VARCHAR(50),
              orientation VARCHAR(20),
              floor_info VARCHAR(100),
              sort_order INTEGER,
              is_published BOOLEAN,
              published_at DATETIME,
              id VARCHAR(36) NOT NULL,
              created_at DATETIME NOT NULL,
              updated_at DATETIME NOT NULL,
              PRIMARY KEY (id),
              FOREIGN KEY(consultant_id) REFERENCES consultants (id)
            )
            """
        )
        conn.exec_driver_sql(
            """
            INSERT INTO mini_projects_tmp (
              project_id,
              consultant_id,
              title,
              cover_image,
              style,
              description,
              marketing_tags,
              share_title,
              share_image,
              view_count,
              address,
              area,
              price,
              layout,
              orientation,
              floor_info,
              sort_order,
              is_published,
              published_at,
              id,
              created_at,
              updated_at
            )
            SELECT
              """
            + project_id_expr
            + """,
              consultant_id,
              title,
              cover_image,
              style,
              description,
              marketing_tags,
              share_title,
              share_image,
              view_count,
              address,
              area,
              price,
              layout,
              orientation,
              floor_info,
              sort_order,
              is_published,
              published_at,
              id,
              created_at,
              updated_at
            FROM mini_projects
            """
        )
        conn.exec_driver_sql("DROP TABLE mini_projects")
        conn.exec_driver_sql("ALTER TABLE mini_projects_tmp RENAME TO mini_projects")
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_mini_projects_published ON mini_projects (is_published, sort_order)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_mini_projects_project ON mini_projects (project_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_mini_projects_consultant ON mini_projects (consultant_id)"
        )
