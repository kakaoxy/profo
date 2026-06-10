"""JSON 推送 API 集成测试.

覆盖 /api/v1/push 端点的认证、参数校验和正常推送流程.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1/push"

VALID_PROPERTIES = [
    {"community_name": "测试小区", "address": "测试地址1号", "price": 100},
    {"community_name": "另一个小区", "address": "测试地址2号", "price": 200},
]


def _make_client_with_db(seeded_db: dict, headers: dict | None = None) -> tuple[TestClient, dict]:
    """辅助：创建 TestClient 并 override get_db，返回 (client, seeded_db)."""
    from main import app

    import db

    session = seeded_db["session"]

    def _override_get_db():
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, headers=headers)
    return client, seeded_db


def _cleanup_client() -> None:
    """辅助：清理 dependency_overrides."""
    from main import app

    app.dependency_overrides.clear()


# ─── API Key 认证 ───────────────────────────────────────────


class TestPushAuth:
    """推送端点 API Key 认证校验."""

    def test_no_api_key_returns_401(self, seeded_db: dict) -> None:
        """不提供 X-API-Key 返回 401."""
        client, _ = _make_client_with_db(seeded_db)
        try:
            resp = client.post(API_PREFIX, json=VALID_PROPERTIES)
        finally:
            _cleanup_client()
        assert resp.status_code == 401
        assert "API Key" in resp.json()["detail"]

    def test_invalid_api_key_returns_401(self, seeded_db: dict) -> None:
        """无效 API Key 返回 401."""
        client, _ = _make_client_with_db(seeded_db, headers={"X-API-Key": "invalid-key"})
        with patch("dependencies.auth.ApiKeyService.authenticate_by_api_key", side_effect=Exception("invalid")):
            try:
                resp = client.post(API_PREFIX, json=VALID_PROPERTIES)
            finally:
                _cleanup_client()
        assert resp.status_code == 401


# ─── 参数校验 ───────────────────────────────────────────────


class TestPushValidation:
    """推送端点参数校验."""

    def test_empty_body_returns_400(self, seeded_db: dict) -> None:
        """空数组请求体返回 400."""
        admin_user = seeded_db["users"]["admin"]
        client, _ = _make_client_with_db(seeded_db, headers={"X-API-Key": "test-key"})

        with patch("dependencies.auth.ApiKeyService.authenticate_by_api_key", return_value=admin_user):
            try:
                resp = client.post(API_PREFIX, json=[])
            finally:
                _cleanup_client()

        assert resp.status_code == 400
        assert "不能为空" in resp.json()["detail"]

    def test_too_many_records_returns_400(self, seeded_db: dict) -> None:
        """超过 10000 条记录返回 400."""
        admin_user = seeded_db["users"]["admin"]
        client, _ = _make_client_with_db(seeded_db, headers={"X-API-Key": "test-key"})
        large_payload = [{"id": i} for i in range(10001)]

        with patch("dependencies.auth.ApiKeyService.authenticate_by_api_key", return_value=admin_user):
            try:
                resp = client.post(API_PREFIX, json=large_payload)
            finally:
                _cleanup_client()

        assert resp.status_code == 400
        assert "10000" in resp.json()["detail"]


# ─── 正常推送 ───────────────────────────────────────────────


class TestPushSuccess:
    """推送端点正常推送流程."""

    def test_valid_push_returns_result(self, seeded_db: dict) -> None:
        """有效数据推送成功返回 PushResult."""
        from schemas import PushResult

        admin_user = seeded_db["users"]["admin"]
        client, _ = _make_client_with_db(seeded_db, headers={"X-API-Key": "test-key"})

        mock_result = PushResult(total=2, success=2, failed=0, errors=[])

        with (
            patch("dependencies.auth.ApiKeyService.authenticate_by_api_key", return_value=admin_user),
            patch("routers.common.push.JSONBatchImporter") as MockImporter,
        ):
            mock_importer = MockImporter.return_value
            mock_importer.batch_import_json.return_value = mock_result

            resp = client.post(API_PREFIX, json=VALID_PROPERTIES)

        _cleanup_client()

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["success"] == 2
        assert data["failed"] == 0
        assert data["errors"] == []

        # 验证 importer 被正确调用
        mock_importer.batch_import_json.assert_called_once()
        call_args = mock_importer.batch_import_json.call_args
        assert call_args[0][0] == VALID_PROPERTIES  # properties 参数
        assert call_args[0][2] == admin_user.id  # user_id 参数

    def test_push_with_import_failure(self, seeded_db: dict) -> None:
        """推送处理失败时返回 422."""
        admin_user = seeded_db["users"]["admin"]
        client, _ = _make_client_with_db(seeded_db, headers={"X-API-Key": "test-key"})

        with (
            patch("dependencies.auth.ApiKeyService.authenticate_by_api_key", return_value=admin_user),
            patch("routers.common.push.JSONBatchImporter") as MockImporter,
        ):
            mock_importer = MockImporter.return_value
            mock_importer.batch_import_json.side_effect = RuntimeError("数据库写入失败")

            resp = client.post(API_PREFIX, json=VALID_PROPERTIES)

        _cleanup_client()

        assert resp.status_code == 422
        assert "推送处理失败" in resp.json()["detail"]
