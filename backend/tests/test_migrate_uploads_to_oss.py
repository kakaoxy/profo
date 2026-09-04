"""migrate_uploads_to_oss 迁移脚本单元测试.

覆盖纯函数（_compute_oss_key / _rewrite_url / _rewrite_json_array_urls）、
DB 改写函数（_rewrite_simple_url_fields / _rewrite_json_array_field）、
文件上传函数（_upload_local_files）、编排入口（migrate_uploads_to_oss）。
DB 测试使用 migration_engine fixture（function 级 TRUNCATE 隔离）。
"""

import json
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations.migrate_uploads_to_oss import (
    _column_exists,
    _compute_oss_key,
    _rewrite_json_array_field,
    _rewrite_json_array_urls,
    _rewrite_simple_url_fields,
    _rewrite_url,
    _upload_local_files,
    migrate_uploads_to_oss,
)
from settings import settings

_OSS_BASE = "https://cdn.test.com"


# ---------------------------------------------------------------------------
# 纯函数测试（无 DB，无文件 I/O）
# ---------------------------------------------------------------------------


class TestComputeOssKey:
    """根据本地文件路径计算 OSS key."""

    def test_simple_file(self, tmp_path: Path) -> None:
        """普通文件 → 相对路径（仅文件名）."""
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        local_path = upload_dir / "20260722_abc.jpg"

        key = _compute_oss_key(local_path, upload_dir)

        assert key == "20260722_abc.jpg"

    def test_subdir_file(self, tmp_path: Path) -> None:
        """子目录文件 → 包含子目录路径."""
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        (upload_dir / "thumbs").mkdir()
        local_path = upload_dir / "thumbs" / "xxx.webp"

        key = _compute_oss_key(local_path, upload_dir)

        assert key == "thumbs/xxx.webp"

    def test_deep_nested_file(self, tmp_path: Path) -> None:
        """多级子目录文件 → 完整相对路径（posix 风格）."""
        upload_dir = tmp_path / "uploads"
        (upload_dir / "a" / "b").mkdir(parents=True)
        local_path = upload_dir / "a" / "b" / "c.mp4"

        key = _compute_oss_key(local_path, upload_dir)

        assert key == "a/b/c.mp4"


class TestRewriteUrl:
    """本地 /static/uploads/ URL 改写为 OSS URL."""

    def test_local_url_to_oss(self) -> None:
        """本地 uploads URL → OSS URL."""
        result = _rewrite_url("/static/uploads/test.jpg", _OSS_BASE)
        assert result == f"{_OSS_BASE}/test.jpg"

    def test_already_oss_url_returns_none(self) -> None:
        """已是 OSS URL → None（无需改写）."""
        result = _rewrite_url(f"{_OSS_BASE}/test.jpg", _OSS_BASE)
        assert result is None

    def test_non_uploads_url_returns_none(self) -> None:
        """非 uploads URL（如外部链接） → None."""
        result = _rewrite_url("https://example.com/img.jpg", _OSS_BASE)
        assert result is None

    def test_empty_string_returns_none(self) -> None:
        """空字符串 → None."""
        result = _rewrite_url("", _OSS_BASE)
        assert result is None

    def test_url_with_query_params_preserved(self) -> None:
        """URL 带查询参数 → 后缀（含参数）保留."""
        result = _rewrite_url("/static/uploads/test.jpg?v=1", _OSS_BASE)
        assert result == f"{_OSS_BASE}/test.jpg?v=1"

    def test_subdir_url(self) -> None:
        """含子目录的 URL → 子目录路径保留."""
        result = _rewrite_url("/static/uploads/thumbs/abc.webp", _OSS_BASE)
        assert result == f"{_OSS_BASE}/thumbs/abc.webp"


class TestRewriteJsonArrayUrls:
    """JSON 数组中 URL 改写."""

    def test_string_list_rewrites_uploads_url(self) -> None:
        """字符串列表：uploads URL 被改写，非 uploads URL 保留."""
        result = _rewrite_json_array_urls(["/static/uploads/a.jpg", "https://cdn.com/b.jpg"], _OSS_BASE)
        assert result is not None
        assert result[0] == f"{_OSS_BASE}/a.jpg"
        assert result[1] == "https://cdn.com/b.jpg"

    def test_dict_list_rewrites_url_field(self) -> None:
        """字典列表：url 字段被改写，其他字段保留."""
        result = _rewrite_json_array_urls([{"url": "/static/uploads/a.jpg", "name": "test"}], _OSS_BASE)
        assert result is not None
        assert result[0]["url"] == f"{_OSS_BASE}/a.jpg"
        assert result[0]["name"] == "test"

    def test_dict_with_multiple_url_fields(self) -> None:
        """字典含 url + thumbnail_url → 两个字段都改写."""
        result = _rewrite_json_array_urls(
            [{"url": "/static/uploads/a.jpg", "thumbnail_url": "/static/uploads/t.webp"}],
            _OSS_BASE,
        )
        assert result is not None
        assert result[0]["url"] == f"{_OSS_BASE}/a.jpg"
        assert result[0]["thumbnail_url"] == f"{_OSS_BASE}/t.webp"

    def test_already_oss_urls_returns_none(self) -> None:
        """已全部是 OSS URL → None（无需改写）."""
        result = _rewrite_json_array_urls([f"{_OSS_BASE}/a.jpg"], _OSS_BASE)
        assert result is None

    def test_json_string_input(self) -> None:
        """JSON 字符串输入 → 解析后改写."""
        result = _rewrite_json_array_urls('["/static/uploads/a.jpg"]', _OSS_BASE)
        assert result is not None
        assert result[0] == f"{_OSS_BASE}/a.jpg"

    def test_invalid_json_string_returns_none(self) -> None:
        """无效 JSON 字符串 → None."""
        result = _rewrite_json_array_urls("not valid json", _OSS_BASE)
        assert result is None

    def test_none_input_returns_none(self) -> None:
        """None 输入 → None."""
        result = _rewrite_json_array_urls(None, _OSS_BASE)
        assert result is None

    def test_empty_list_returns_none(self) -> None:
        """空列表 → None."""
        result = _rewrite_json_array_urls([], _OSS_BASE)
        assert result is None

    def test_empty_string_returns_none(self) -> None:
        """空字符串 → None."""
        result = _rewrite_json_array_urls("", _OSS_BASE)
        assert result is None

    def test_mixed_types(self) -> None:
        """混合类型（str + dict + int）→ 正确处理 str/dict，保留 int."""
        result = _rewrite_json_array_urls(
            ["/static/uploads/a.jpg", {"url": "/static/uploads/b.jpg"}, 42],
            _OSS_BASE,
        )
        assert result is not None
        assert result[0] == f"{_OSS_BASE}/a.jpg"
        assert result[1]["url"] == f"{_OSS_BASE}/b.jpg"
        assert result[2] == 42

    def test_json_string_not_list_returns_none(self) -> None:
        """JSON 字符串解析后非列表（如 dict） → None."""
        result = _rewrite_json_array_urls('{"url": "/static/uploads/a.jpg"}', _OSS_BASE)
        assert result is None

    def test_dict_does_not_mutate_original(self) -> None:
        """改写不修改原始字典（使用 dict(item) 浅拷贝）."""
        original = [{"url": "/static/uploads/a.jpg"}]
        result = _rewrite_json_array_urls(original, _OSS_BASE)
        assert result is not None
        # 原始字典未被修改
        assert original[0]["url"] == "/static/uploads/a.jpg"
        assert result[0]["url"] == f"{_OSS_BASE}/a.jpg"


# ---------------------------------------------------------------------------
# 数据库测试（migration_engine fixture）
# ---------------------------------------------------------------------------


@pytest.fixture
def migration_engine(test_engine: Engine) -> Engine:
    """复用会话级 PG 引擎，每个测试前后 TRUNCATE 相关表.

    迁移函数使用独立 connection，无法依赖 SAVEPOINT 隔离，
    因此通过 TRUNCATE 保证测试间数据隔离。
    """
    tables = (
        "renovation_photos",
        "property_media",
        "l4_marketing_media",
        "l4_marketing_projects",
    )
    with test_engine.begin() as conn:
        for table in tables:
            conn.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
    yield test_engine
    with test_engine.begin() as conn:
        for table in tables:
            conn.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))


class TestColumnExists:
    """检查某列是否已存在."""

    def test_table_and_column_exist(self, migration_engine: Engine) -> None:
        """表存在且列存在 → True."""
        assert _column_exists(migration_engine, "property_media", "url") is True

    def test_column_not_exist(self, migration_engine: Engine) -> None:
        """表存在但列不存在 → False."""
        assert _column_exists(migration_engine, "property_media", "nonexistent_col") is False

    def test_table_not_exist(self, migration_engine: Engine) -> None:
        """表不存在 → False."""
        assert _column_exists(migration_engine, "nonexistent_table", "url") is False


class TestRewriteSimpleUrlFields:
    """改写普通字符串 URL 字段."""

    def _insert_renovation_photo(self, engine: Engine, *, url: str, photo_id: str | None = None) -> str:
        """插入一条 renovation_photos 记录，返回其 id（id/project_id 均为 UUID 列）."""
        pid = photo_id or str(uuid.uuid4())
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO renovation_photos "
                    "(id, project_id, stage, url, media_type, is_deleted, created_at, updated_at) "
                    "VALUES (:id, :pid, '设计', :url, 'image', false, NOW(), NOW())"
                ),
                {"id": pid, "pid": str(uuid.uuid4()), "url": url},
            )
        return pid

    def _insert_property_media(self, engine: Engine, *, url: str, media_id: int | None = None) -> None:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO property_media "
                    "(data_source, source_property_id, media_type, url, sort_order, created_at) "
                    "VALUES (:ds, :spid, 'INTERIOR', :url, 0, NOW())"
                ),
                {"ds": "test_source", "spid": f"prop_{url[-6:]}", "url": url},
            )

    def _insert_l4_marketing_media(self, engine: Engine, *, file_url: str, thumbnail_url: str | None = None) -> None:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO l4_marketing_media "
                    "(marketing_project_id, media_type, photo_category, file_url, thumbnail_url, "
                    "sort_order, is_deleted, created_at, updated_at) "
                    "VALUES (1, 'image', 'marketing', :furl, :turl, 0, false, NOW(), NOW())"
                ),
                {"furl": file_url, "turl": thumbnail_url},
            )

    def test_rewrites_renovation_photos_url(self, migration_engine: Engine) -> None:
        """renovation_photos.url 被 REPLACE 改写为 OSS URL."""
        pid = self._insert_renovation_photo(migration_engine, url="/static/uploads/renov1.jpg")

        rewritten = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)

        assert rewritten >= 1
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT url FROM renovation_photos WHERE id = :pid"), {"pid": pid}).fetchone()
            assert row is not None
            assert row[0] == f"{_OSS_BASE}/renov1.jpg"

    def test_rewrites_property_media_url(self, migration_engine: Engine) -> None:
        """property_media.url 被改写."""
        self._insert_property_media(migration_engine, url="/static/uploads/media1.jpg")

        rewritten = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)

        assert rewritten >= 1
        with migration_engine.begin() as conn:
            row = conn.execute(
                text("SELECT url FROM property_media WHERE url LIKE :pattern"),
                {"pattern": f"{_OSS_BASE}%"},
            ).fetchone()
            assert row is not None
            assert row[0] == f"{_OSS_BASE}/media1.jpg"

    def test_rewrites_l4_marketing_media_fields(self, migration_engine: Engine) -> None:
        """l4_marketing_media.file_url 和 thumbnail_url 同时改写."""
        self._insert_l4_marketing_media(
            migration_engine,
            file_url="/static/uploads/file1.jpg",
            thumbnail_url="/static/uploads/thumb1.webp",
        )

        rewritten = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)

        assert rewritten >= 2
        with migration_engine.begin() as conn:
            row = conn.execute(
                text("SELECT file_url, thumbnail_url FROM l4_marketing_media WHERE file_url LIKE :p"),
                {"p": f"{_OSS_BASE}%"},
            ).fetchone()
            assert row is not None
            assert row[0] == f"{_OSS_BASE}/file1.jpg"
            assert row[1] == f"{_OSS_BASE}/thumb1.webp"

    def test_idempotent_second_run_rewrites_zero(self, migration_engine: Engine) -> None:
        """第二次调用改写 0 条（已是 OSS URL）."""
        self._insert_renovation_photo(migration_engine, url="/static/uploads/renov_idem.jpg")

        first = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)
        assert first >= 1

        second = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)
        assert second == 0

    def test_skips_non_uploads_urls(self, migration_engine: Engine) -> None:
        """非 /static/uploads/ URL 不被改写."""
        pid = self._insert_renovation_photo(migration_engine, url="https://other.com/image.jpg")

        rewritten = _rewrite_simple_url_fields(migration_engine, _OSS_BASE)

        assert rewritten == 0
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT url FROM renovation_photos WHERE id = :pid"), {"pid": pid}).fetchone()
            assert row is not None
            assert row[0] == "https://other.com/image.jpg"


class TestRewriteJsonArrayField:
    """改写 l4_marketing_projects.images JSON 数组字段."""

    def _insert_marketing_project(self, engine: Engine, *, images: list, project_id: int = 1) -> None:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO l4_marketing_projects "
                    "(community_id, layout, orientation, floor_info, area, total_price, unit_price, "
                    "title, images, tags, sort_order, publish_status, project_status, is_deleted, "
                    "created_at, updated_at) "
                    "VALUES (:cid, '三室两厅', '南北通透', '15/28层', 100.00, 500.00, 5.00, "
                    "'测试标题', :images, '[]', 0, '草稿', '在售', false, NOW(), NOW())"
                ),
                {"cid": "test-community", "images": json.dumps(images)},
            )

    def test_rewrites_json_string_urls(self, migration_engine: Engine) -> None:
        """Images 中字符串 URL 被改写."""
        self._insert_marketing_project(
            migration_engine,
            images=["/static/uploads/json1.jpg", "/static/uploads/json2.jpg"],
        )

        rewritten = _rewrite_json_array_field(migration_engine, "l4_marketing_projects", "images", _OSS_BASE)

        assert rewritten == 1
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT images FROM l4_marketing_projects WHERE id = 1")).fetchone()
            assert row is not None
            images = row[0]
            assert images[0] == f"{_OSS_BASE}/json1.jpg"
            assert images[1] == f"{_OSS_BASE}/json2.jpg"

    def test_rewrites_json_dict_urls(self, migration_engine: Engine) -> None:
        """Images 中 dict 的 url 字段被改写."""
        self._insert_marketing_project(
            migration_engine,
            images=[{"url": "/static/uploads/dict1.jpg", "name": "pic1"}],
        )

        rewritten = _rewrite_json_array_field(migration_engine, "l4_marketing_projects", "images", _OSS_BASE)

        assert rewritten == 1
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT images FROM l4_marketing_projects WHERE id = 1")).fetchone()
            assert row is not None
            images = row[0]
            assert images[0]["url"] == f"{_OSS_BASE}/dict1.jpg"
            assert images[0]["name"] == "pic1"

    def test_idempotent_second_run(self, migration_engine: Engine) -> None:
        """第二次调用改写 0 条."""
        self._insert_marketing_project(
            migration_engine,
            images=["/static/uploads/idem1.jpg"],
        )

        first = _rewrite_json_array_field(migration_engine, "l4_marketing_projects", "images", _OSS_BASE)
        assert first == 1

        second = _rewrite_json_array_field(migration_engine, "l4_marketing_projects", "images", _OSS_BASE)
        assert second == 0

    def test_skips_non_uploads_json(self, migration_engine: Engine) -> None:
        """Images 中无 /static/uploads/ URL → 不改写."""
        self._insert_marketing_project(
            migration_engine,
            images=["https://cdn.com/already.jpg"],
        )

        rewritten = _rewrite_json_array_field(migration_engine, "l4_marketing_projects", "images", _OSS_BASE)

        assert rewritten == 0


# ---------------------------------------------------------------------------
# 文件 I/O 测试（mock storage backend + tmp_path）
# ---------------------------------------------------------------------------


class TestUploadLocalFiles:
    """上传本地 uploads 目录文件到 OSS."""

    def test_dir_not_exist_returns_zero(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Uploads 目录不存在 → (0, 0)."""
        monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "nonexistent"))

        with patch("migrations.migrate_uploads_to_oss.get_storage_backend"):
            uploaded, skipped = _upload_local_files()

        assert uploaded == 0
        assert skipped == 0

    def test_empty_dir_returns_zero(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Uploads 目录为空 → (0, 0)."""
        (tmp_path / "uploads").mkdir()
        monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))

        with patch("migrations.migrate_uploads_to_oss.get_storage_backend"):
            uploaded, skipped = _upload_local_files()

        assert uploaded == 0
        assert skipped == 0

    def test_all_files_skipped_when_exists(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """所有文件已存在于 OSS → 全跳过."""
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        (upload_dir / "a.jpg").write_bytes(b"a")
        (upload_dir / "b.jpg").write_bytes(b"b")
        monkeypatch.setattr(settings, "upload_dir", str(upload_dir))

        mock_storage = MagicMock()
        mock_storage.file_exists.return_value = True
        with patch("migrations.migrate_uploads_to_oss.get_storage_backend", return_value=mock_storage):
            uploaded, skipped = _upload_local_files()

        assert uploaded == 0
        assert skipped == 2
        mock_storage.upload_file.assert_not_called()

    def test_all_files_uploaded_when_not_exists(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """所有文件不存在于 OSS → 全上传."""
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        (upload_dir / "a.jpg").write_bytes(b"a")
        (upload_dir / "b.jpg").write_bytes(b"b")
        monkeypatch.setattr(settings, "upload_dir", str(upload_dir))

        mock_storage = MagicMock()
        mock_storage.file_exists.return_value = False
        with patch("migrations.migrate_uploads_to_oss.get_storage_backend", return_value=mock_storage):
            uploaded, skipped = _upload_local_files()

        assert uploaded == 2
        assert skipped == 0
        assert mock_storage.upload_file.call_count == 2

    def test_mixed_exists_and_not(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """部分存在部分不存在 → 正确计数."""
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        (upload_dir / "exists.jpg").write_bytes(b"e")
        (upload_dir / "new.jpg").write_bytes(b"n")
        monkeypatch.setattr(settings, "upload_dir", str(upload_dir))

        mock_storage = MagicMock()
        mock_storage.file_exists.side_effect = [True, False]
        with patch("migrations.migrate_uploads_to_oss.get_storage_backend", return_value=mock_storage):
            uploaded, skipped = _upload_local_files()

        assert uploaded == 1
        assert skipped == 1

    def test_subdir_file_key_computed(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """子目录文件的 key 正确计算（含子目录路径）."""
        upload_dir = tmp_path / "uploads"
        (upload_dir / "thumbs").mkdir(parents=True)
        (upload_dir / "thumbs" / "abc.webp").write_bytes(b"thumb")
        monkeypatch.setattr(settings, "upload_dir", str(upload_dir))

        mock_storage = MagicMock()
        mock_storage.file_exists.return_value = False
        with patch("migrations.migrate_uploads_to_oss.get_storage_backend", return_value=mock_storage):
            _upload_local_files()

        mock_storage.upload_file.assert_called_once()
        call_args = mock_storage.upload_file.call_args
        key = call_args[0][1]
        assert key == "thumbs/abc.webp"


# ---------------------------------------------------------------------------
# 编排函数测试
# ---------------------------------------------------------------------------


class TestMigrateUploadsToOss:
    """migrate_uploads_to_oss 公共入口编排测试."""

    def test_skips_when_storage_not_oss(self, migration_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
        """storage_backend != 'oss' → 立即返回."""
        monkeypatch.setattr(settings, "storage_backend", "local")

        migrate_uploads_to_oss(migration_engine)

        # 无副作用，无异常即通过

    def test_skips_when_oss_base_url_empty(self, migration_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
        """oss_public_base_url 为空 → 立即返回."""
        monkeypatch.setattr(settings, "storage_backend", "oss")
        monkeypatch.setattr(settings, "oss_public_base_url", "")

        migrate_uploads_to_oss(migration_engine)

    def test_skips_when_redis_done_marker_exists(
        self,
        migration_engine: Engine,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Redis done 标记存在 → 跳过迁移."""
        monkeypatch.setattr(settings, "storage_backend", "oss")
        monkeypatch.setattr(settings, "oss_public_base_url", _OSS_BASE)
        monkeypatch.setattr(settings, "upload_dir", str(tmp_path))

        mock_redis = MagicMock()
        mock_redis.get.return_value = b"1"
        with (
            patch("utils.redis_client.get_redis_client", return_value=mock_redis),
            patch("migrations.migrate_uploads_to_oss.get_storage_backend") as mock_get_storage,
            patch("migrations.migrate_uploads_to_oss._upload_local_files") as mock_upload,
            patch("migrations.migrate_uploads_to_oss._rewrite_simple_url_fields") as mock_simple,
            patch("migrations.migrate_uploads_to_oss._rewrite_json_array_field") as mock_json,
        ):
            migrate_uploads_to_oss(migration_engine)

            mock_get_storage.assert_not_called()
            mock_upload.assert_not_called()
            mock_simple.assert_not_called()
            mock_json.assert_not_called()

    def test_continues_when_redis_unavailable(
        self,
        migration_engine: Engine,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Redis 不可用（get_redis_client 抛异常）→ 继续执行迁移."""
        monkeypatch.setattr(settings, "storage_backend", "oss")
        monkeypatch.setattr(settings, "oss_public_base_url", _OSS_BASE)
        monkeypatch.setattr(settings, "upload_dir", str(tmp_path))

        mock_storage = MagicMock()
        mock_storage.file_exists.return_value = False
        with (
            patch(
                "utils.redis_client.get_redis_client",
                side_effect=Exception("Redis unavailable"),
            ),
            patch(
                "migrations.migrate_uploads_to_oss.get_storage_backend",
                return_value=mock_storage,
            ),
        ):
            # 不应抛异常，迁移应正常完成
            migrate_uploads_to_oss(migration_engine)

    def test_full_flow_with_mocked_storage_and_redis(
        self,
        migration_engine: Engine,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """完整流程：mock redis + 真实 DB，验证启动期仅做 DB URL 改写 + Redis 标记写入.

        新版拆分后，启动期 migrate_uploads_to_oss 不再上传文件（由带外脚本执行），
        只改写 DB URL 并写入 _DB_REWRITE_DONE_KEY 标记。
        """
        monkeypatch.setattr(settings, "storage_backend", "oss")
        monkeypatch.setattr(settings, "oss_public_base_url", _OSS_BASE)
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir()
        (upload_dir / "test.jpg").write_bytes(b"test content")
        monkeypatch.setattr(settings, "upload_dir", str(upload_dir))

        # 插入含本地 URL 的 DB 记录（id/project_id 均为 UUID 列）
        pid = str(uuid.uuid4())
        with migration_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO renovation_photos "
                    "(id, project_id, stage, url, media_type, is_deleted, created_at, updated_at) "
                    "VALUES (:id, :pid, '设计', '/static/uploads/test.jpg', 'image', false, NOW(), NOW())"
                ),
                {"id": pid, "pid": str(uuid.uuid4())},
            )

        mock_redis = MagicMock()
        # get 调用顺序：先查 _DB_REWRITE_DONE_KEY（返回 None → 执行改写），
        # 再查 _FILE_UPLOAD_DONE_KEY（返回 None → 打印警告日志）
        mock_redis.get.return_value = None

        with (
            patch("utils.redis_client.get_redis_client", return_value=mock_redis),
            patch(
                "migrations.migrate_uploads_to_oss.get_storage_backend",
            ) as mock_get_storage,
        ):
            migrate_uploads_to_oss(migration_engine)

            # 启动期不应调用 storage backend（文件上传改为带外执行）
            mock_get_storage.assert_not_called()

        # 验证 DB URL 已改写
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT url FROM renovation_photos WHERE id = :pid"), {"pid": pid}).fetchone()
            assert row is not None
            assert row[0] == f"{_OSS_BASE}/test.jpg"

        # 验证 Redis DB 改写完成标记已写入（仅一次 set，文件上传标记不在启动期写入）
        mock_redis.set.assert_called_once()
        set_args = mock_redis.set.call_args
        assert set_args[0][0] == "profo:migration:oss_db_rewrite_done"
        assert set_args[0][1] == "1"
