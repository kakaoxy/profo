import os
import sqlite3
from typing import Iterable


def table_exists(cur: sqlite3.Cursor, table_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cur.fetchone() is not None


def print_table_schema(cur: sqlite3.Cursor, table_name: str) -> None:
    if not table_exists(cur, table_name):
        print(f"\n== {table_name} MISSING ==")
        return

    print(f"\n== {table_name} schema ==")
    cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    row = cur.fetchone()
    print(row[0] if row else None)

    cur.execute(f"PRAGMA table_info({table_name})")
    info = cur.fetchall()
    print("columns:", [(c[1], c[2], c[3], c[4]) for c in info])


def print_fk_list(cur: sqlite3.Cursor, table_name: str) -> None:
    if not table_exists(cur, table_name):
        return
    cur.execute(f"PRAGMA foreign_key_list({table_name})")
    print(f"\nFK list for {table_name}:", cur.fetchall())


def print_row_count(cur: sqlite3.Cursor, table_name: str) -> None:
    if not table_exists(cur, table_name):
        return
    cur.execute(f"SELECT COUNT(*) FROM {table_name}")
    print(f"{table_name}:", cur.fetchone()[0])


def audit(db_path: str, tables: Iterable[str]) -> None:
    abs_db_path = os.path.abspath(db_path)
    print("DB:", abs_db_path)
    con = sqlite3.connect(abs_db_path)
    try:
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        print("tables:", [r[0] for r in cur.fetchall()])

        for t in tables:
            print_table_schema(cur, t)

        print("\n== PRAGMA foreign_keys ==")
        cur.execute("PRAGMA foreign_keys")
        print(cur.fetchone())

        for t in tables:
            print_fk_list(cur, t)

        print("\n== row counts ==")
        for t in tables:
            print_row_count(cur, t)

        if table_exists(cur, "mini_projects"):
            cur.execute("SELECT COUNT(*) FROM mini_projects WHERE project_id IS NULL")
            print("mini_projects.project_id IS NULL:", cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM mini_projects WHERE project_id IS NOT NULL")
            print("mini_projects.project_id IS NOT NULL:", cur.fetchone()[0])
    finally:
        con.close()


if __name__ == "__main__":
    audit(
        db_path=os.environ.get("PROFO_DB_PATH", "data.db"),
        tables=[
            "projects",
            "property_current",
            "mini_projects",
            "mini_project_photos",
            "leads",
            "lead_followups",
            "lead_price_history",
            "cashflow_records",
        ],
    )
