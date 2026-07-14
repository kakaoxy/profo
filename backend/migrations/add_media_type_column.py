"""为 renovation_photos 表添加 media_type 列."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_media_type_to_renovation_photos(engine: Engine) -> None:
    """幂等添加 media_type 列到 renovation_photos 表."""
    inspector = inspect(engine)
    if "renovation_photos" not in inspector.get_table_names():
        return
    if any(col["name"] == "media_type" for col in inspector.get_columns("renovation_photos")):
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE renovation_photos ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'image'"))
