"""OperationLogService 单元测试.

覆盖审计日志写入与查询：
1. log_action：成功写入、Request 提取 IP/UA、写入失败不阻塞主流程
2. list_operation_logs：分页、按 action/resource_type/user_id/时间范围过滤、按 created_at 倒序
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock

from models.system import OperationLog
from services.system import operation_log_service


class TestLogAction:
    """log_action 审计日志写入测试."""

    def test_log_action_success(self, seeded_db: dict[str, Any]) -> None:
        """写入审计日志成功，返回 OperationLog 对象."""
        session = seeded_db["session"]

        log = operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
            resource_id="new-user-id",
            before={"name": "old"},
            after={"name": "new"},
        )

        assert log is not None
        assert isinstance(log, OperationLog)
        assert log.user_id == "admin-user"
        assert log.action == "create"
        assert log.resource_type == "user"
        assert log.resource_id == "new-user-id"
        assert log.before == {"name": "old"}
        assert log.after == {"name": "new"}

    def test_log_action_with_request(self, seeded_db: dict[str, Any]) -> None:
        """模拟 Request 对象，验证 IP 和 User-Agent 提取."""
        session = seeded_db["session"]

        request = MagicMock()
        request.client.host = "127.0.0.1"
        request.headers = {"user-agent": "test-agent/1.0"}

        log = operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="update",
            resource_type="role",
            request=request,
        )

        assert log is not None
        assert log.ip == "127.0.0.1"
        assert log.user_agent == "test-agent/1.0"

    def test_log_action_with_long_user_agent_truncated(self, seeded_db: dict[str, Any]) -> None:
        """User-Agent 超过 255 字符时被截断."""
        session = seeded_db["session"]

        long_ua = "A" * 300
        request = MagicMock()
        request.client.host = "10.0.0.1"
        request.headers = {"user-agent": long_ua}

        log = operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
            request=request,
        )

        assert log is not None
        assert len(log.user_agent) == 255
        assert log.user_agent == "A" * 255

    def test_log_action_without_request(self, seeded_db: dict[str, Any]) -> None:
        """不传 request 时 ip 和 user_agent 为 None."""
        session = seeded_db["session"]

        log = operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )

        assert log is not None
        assert log.ip is None
        assert log.user_agent is None

    def test_log_action_with_anonymous_user(self, seeded_db: dict[str, Any]) -> None:
        """未认证操作（user_id=None）也能记录审计日志."""
        session = seeded_db["session"]

        log = operation_log_service.log_action(
            session,
            user_id=None,
            action="sensitive_data_access",
            resource_type="system",
        )

        assert log is not None
        assert log.user_id is None
        assert log.action == "sensitive_data_access"

    def test_log_action_failure_returns_none(self, seeded_db: dict[str, Any]) -> None:
        """模拟数据库异常，验证返回 None 且不抛异常."""
        mock_db = MagicMock()
        mock_db.commit.side_effect = Exception("DB connection lost")

        result = operation_log_service.log_action(
            mock_db,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )

        assert result is None
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.rollback.assert_called_once()


class TestListOperationLogs:
    """list_operation_logs 审计日志查询测试."""

    def test_list_operation_logs_pagination(self, seeded_db: dict[str, Any]) -> None:
        """分页查询：写入多条日志后验证分页返回."""
        session = seeded_db["session"]

        # 写入 5 条日志
        for i in range(5):
            operation_log_service.log_action(
                session,
                user_id="admin-user",
                action="create",
                resource_type="user",
                resource_id=f"user-{i}",
            )

        # 第一页 2 条
        total, page1 = operation_log_service.list_operation_logs(session, page=1, page_size=2)
        assert total == 5
        assert len(page1) == 2

        # 第二页 2 条
        total, page2 = operation_log_service.list_operation_logs(session, page=2, page_size=2)
        assert total == 5
        assert len(page2) == 2

        # 第三页 1 条
        total, page3 = operation_log_service.list_operation_logs(session, page=3, page_size=2)
        assert total == 5
        assert len(page3) == 1

    def test_list_operation_logs_filter_by_action(self, seeded_db: dict[str, Any]) -> None:
        """按 action 过滤：仅返回指定操作的日志."""
        session = seeded_db["session"]

        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="update",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="delete",
            resource_type="user",
        )

        total, logs = operation_log_service.list_operation_logs(session, action="create")
        assert total == 1
        assert all(log.action == "create" for log in logs)

    def test_list_operation_logs_filter_by_resource_type(self, seeded_db: dict[str, Any]) -> None:
        """按 resource_type 过滤：仅返回指定资源类型的日志."""
        session = seeded_db["session"]

        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="role",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="permission",
        )

        total, logs = operation_log_service.list_operation_logs(session, resource_type="role")
        assert total == 1
        assert all(log.resource_type == "role" for log in logs)

    def test_list_operation_logs_filter_by_user_id(self, seeded_db: dict[str, Any]) -> None:
        """按 user_id 过滤：仅返回指定用户的日志."""
        session = seeded_db["session"]

        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="normal-user",
            action="update",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="delete",
            resource_type="user",
        )

        total, logs = operation_log_service.list_operation_logs(session, user_id="admin-user")
        assert total == 2
        assert all(log.user_id == "admin-user" for log in logs)

    def test_list_operation_logs_filter_by_time_range(self, seeded_db: dict[str, Any]) -> None:
        """按时间范围过滤：start_time/end_time 之间的日志."""
        session = seeded_db["session"]

        # 记录写入前时间（留 1 秒缓冲）
        before = datetime.now(timezone.utc) - timedelta(seconds=1)

        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )

        after = datetime.now(timezone.utc) + timedelta(seconds=1)

        # 时间范围包含日志 → 返回 1 条
        total, logs = operation_log_service.list_operation_logs(
            session,
            start_time=before,
            end_time=after,
        )
        assert total == 1
        assert len(logs) == 1

        # end_time 早于日志创建时间 → 返回 0 条
        total, empty_logs = operation_log_service.list_operation_logs(
            session,
            end_time=before,
        )
        assert total == 0
        assert empty_logs == []

    def test_list_operation_logs_order_by_created_at_desc(self, seeded_db: dict[str, Any]) -> None:
        """日志按 created_at 倒序排列（最新的在前）."""
        session = seeded_db["session"]

        for action in ["create", "update", "delete"]:
            operation_log_service.log_action(
                session,
                user_id="admin-user",
                action=action,
                resource_type="user",
            )

        total, logs = operation_log_service.list_operation_logs(session)
        assert total == 3

        # 验证 created_at 非递增（倒序）
        for i in range(len(logs) - 1):
            assert logs[i].created_at >= logs[i + 1].created_at

    def test_list_operation_logs_empty(self, seeded_db: dict[str, Any]) -> None:
        """无日志时返回空列表."""
        session = seeded_db["session"]

        total, logs = operation_log_service.list_operation_logs(session)
        assert total == 0
        assert logs == []

    def test_list_operation_logs_combined_filters(self, seeded_db: dict[str, Any]) -> None:
        """组合过滤：user_id + action + resource_type."""
        session = seeded_db["session"]

        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )
        operation_log_service.log_action(
            session,
            user_id="admin-user",
            action="create",
            resource_type="role",
        )
        operation_log_service.log_action(
            session,
            user_id="normal-user",
            action="create",
            resource_type="user",
        )

        total, logs = operation_log_service.list_operation_logs(
            session,
            user_id="admin-user",
            action="create",
            resource_type="user",
        )
        assert total == 1
        assert logs[0].user_id == "admin-user"
        assert logs[0].action == "create"
        assert logs[0].resource_type == "user"
