"""为 renovation_photos 表添加 media_type 列（PostgreSQL 使用 enum 类型）."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _backfill_media_type(engine: Engine) -> None:
    """根据 URL 后缀回填 media_type，纠正被 DEFAULT 'image' 误标的存量视频.

    幂等：仅更新 media_type='image' 且 URL 后缀为视频的行，已正确的行不受影响。
    """
    # patterns 由硬编码后缀生成，无注入风险；::text[] 显式指定类型避免 record 数组推断
    video_extensions = (".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v")
    patterns = [f"%{ext}" for ext in video_extensions]
    with engine.begin() as conn:
        # PG: ILIKE ANY 一次匹配多后缀（不区分大小写），直接传 list 作为 text[]
        # 用 CAST 而非 :: 避免 SQLAlchemy text() 对 :param::type 的误解析
        conn.execute(
            text(
                "UPDATE renovation_photos SET media_type = 'video' "
                "WHERE media_type = 'image' AND url ILIKE ANY(CAST(:patterns AS text[]))"
            ),
            {"patterns": patterns},
        )


def add_media_type_to_renovation_photos(engine: Engine) -> None:
    """幂等添加 media_type 列到 renovation_photos 表.

    - PostgreSQL: 使用 enum 类型 `mediakind`（与 SQLEnum(MediaKind) 默认名一致）。
      若列已存在且为 VARCHAR(10)（旧迁移创建），自动转为 mediakind enum。
    - 幂等：列已存在且为所需类型则跳过列添加；回填始终执行（仅纠正误标行）。
    """
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _column_exists 定义前导入本模块
    from migrations import _column_exists

    inspector = inspect(engine)
    if "renovation_photos" not in inspector.get_table_names():
        return

    if not _column_exists(engine, "renovation_photos", "media_type"):
        # 列不存在，添加
        # PG: 先创建 enum 类型再添加列
        # 注意：PostgreSQL 不支持 CREATE TYPE IF NOT EXISTS，用 DO 块 + EXCEPTION 实现幂等
        with engine.begin() as conn:
            conn.execute(
                text(
                    "DO $$ BEGIN "
                    "CREATE TYPE mediakind AS ENUM ('image', 'video'); "
                    "EXCEPTION WHEN duplicate_object THEN null; END $$;"
                ),
            )
            conn.execute(
                text("ALTER TABLE renovation_photos ADD COLUMN media_type mediakind NOT NULL DEFAULT 'image'"),
            )
    else:
        # 列已存在，检查 PG 类型是否需要转为 enum
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = 'renovation_photos' AND column_name = 'media_type'"
                ),
            ).first()
        if row and row[0] == "character varying":
            # VARCHAR 转 enum
            # 注意：若列有 DEFAULT 'image'（字符串字面量），PG 无法自动 cast 到 enum，
            # 需先 DROP DEFAULT，转换类型后再 SET DEFAULT 'image'::mediakind
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "DO $$ BEGIN "
                        "CREATE TYPE mediakind AS ENUM ('image', 'video'); "
                        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
                    ),
                )
                conn.execute(
                    text("ALTER TABLE renovation_photos ALTER COLUMN media_type DROP DEFAULT"),
                )
                conn.execute(
                    text(
                        "ALTER TABLE renovation_photos ALTER COLUMN media_type "
                        "TYPE mediakind USING media_type::text::mediakind"
                    ),
                )
                conn.execute(
                    text("ALTER TABLE renovation_photos ALTER COLUMN media_type SET DEFAULT 'image'::mediakind"),
                )

    # 回填存量数据：根据 URL 后缀纠正被 DEFAULT 'image' 误标的视频（幂等）
    _backfill_media_type(engine)
