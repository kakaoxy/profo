"""ProjectService facade 单元测试.

验证 facade 正确初始化子服务，并将方法调用委托给对应子服务。
使用 mock 隔离子服务实现，仅测试委托行为。
"""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from schemas.project import ProjectCreate, ProjectResponse, StatusUpdate
from services.projects.facade import ProjectService
from services.projects.core import ProjectCoreService
from services.projects.finance import FinanceService
from services.projects.renovation import RenovationService
from services.projects.sales import SalesService


# ---------------------------------------------------------------------------
# __init__ 初始化测试
# ---------------------------------------------------------------------------


class TestProjectServiceInit:
    """ProjectService.__init__() 初始化测试."""

    def test_initializes_core_service(self, db_session: Session) -> None:
        """应初始化 ProjectCoreService 实例."""
        svc = ProjectService(db_session)
        assert isinstance(svc._core_service, ProjectCoreService)

    def test_initializes_renovation_service(self, db_session: Session) -> None:
        """应初始化 RenovationService 实例."""
        svc = ProjectService(db_session)
        assert isinstance(svc._renovation_service, RenovationService)

    def test_initializes_sales_service(self, db_session: Session) -> None:
        """应初始化 SalesService 实例."""
        svc = ProjectService(db_session)
        assert isinstance(svc._sales_service, SalesService)

    def test_initializes_finance_service(self, db_session: Session) -> None:
        """应初始化 FinanceService 实例."""
        svc = ProjectService(db_session)
        assert isinstance(svc._finance_service, FinanceService)

    def test_stores_db_session(self, db_session: Session) -> None:
        """应保存 db 会话引用."""
        svc = ProjectService(db_session)
        assert svc.db is db_session

    def test_sub_services_share_same_db(self, db_session: Session) -> None:
        """所有子服务应共享同一个 db 会话."""
        svc = ProjectService(db_session)
        assert svc._core_service.db is db_session
        assert svc._renovation_service.db is db_session
        assert svc._sales_service.db is db_session
        assert svc._finance_service.db is db_session


# ---------------------------------------------------------------------------
# Core 方法委托测试
# ---------------------------------------------------------------------------


class TestCreateProjectDelegation:
    """create_project() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.create_project()."""
        svc = ProjectService(db_session)
        mock_response = MagicMock(spec=ProjectResponse)

        with patch.object(svc._core_service, "create_project", return_value=mock_response) as mock_method:
            project_data = MagicMock(spec=ProjectCreate)
            result = svc.create_project(project_data)

            mock_method.assert_called_once_with(project_data)
            assert result is mock_response


class TestGetProjectDelegation:
    """get_project() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.get_project()."""
        svc = ProjectService(db_session)
        mock_response = MagicMock(spec=ProjectResponse)

        with patch.object(svc._core_service, "get_project", return_value=mock_response) as mock_method:
            result = svc.get_project("test-id", include_all=False)

            mock_method.assert_called_once_with("test-id", include_all=False)
            assert result is mock_response

    def test_delegates_with_include_all_true(self, db_session: Session) -> None:
        """include_all=True 应正确传递."""
        svc = ProjectService(db_session)
        mock_response = MagicMock(spec=ProjectResponse)

        with patch.object(svc._core_service, "get_project", return_value=mock_response) as mock_method:
            result = svc.get_project("test-id", include_all=True)

            mock_method.assert_called_once_with("test-id", include_all=True)
            assert result is mock_response


class TestGetProjectsDelegation:
    """get_projects() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.get_projects()."""
        svc = ProjectService(db_session)
        mock_result = {"items": [], "total": 0, "page": 1, "page_size": 50}

        with patch.object(svc._core_service, "get_projects", return_value=mock_result) as mock_method:
            result = svc.get_projects(status_filter="selling", community_name="test", page=2, page_size=10)

            mock_method.assert_called_once_with("selling", "test", 2, 10)
            assert result is mock_result

    def test_delegates_with_defaults(self, db_session: Session) -> None:
        """默认参数应正确传递."""
        svc = ProjectService(db_session)
        mock_result = {"items": [], "total": 0, "page": 1, "page_size": 50}

        with patch.object(svc._core_service, "get_projects", return_value=mock_result) as mock_method:
            result = svc.get_projects()

            mock_method.assert_called_once_with(None, None, 1, 50)
            assert result is mock_result


class TestDeleteProjectDelegation:
    """delete_project() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.delete_project()."""
        svc = ProjectService(db_session)

        with patch.object(svc._core_service, "delete_project", return_value=None) as mock_method:
            result = svc.delete_project("test-id")

            mock_method.assert_called_once_with("test-id")
            assert result is None


class TestUpdateStatusDelegation:
    """update_status() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.update_status()."""
        svc = ProjectService(db_session)
        mock_response = MagicMock(spec=ProjectResponse)
        status_update = MagicMock(spec=StatusUpdate)

        with patch.object(svc._core_service, "update_status", return_value=mock_response) as mock_method:
            result = svc.update_status("test-id", status_update)

            mock_method.assert_called_once_with("test-id", status_update)
            assert result is mock_response


class TestGetProjectStatsDelegation:
    """get_project_stats() 委托测试."""

    def test_delegates_to_core_service(self, db_session: Session) -> None:
        """应委托给 ProjectCoreService.get_project_stats()."""
        svc = ProjectService(db_session)
        mock_stats = {"signing": 1, "renovating": 2, "selling": 3, "sold": 4}

        with patch.object(svc._core_service, "get_project_stats", return_value=mock_stats) as mock_method:
            result = svc.get_project_stats()

            mock_method.assert_called_once_with()
            assert result is mock_stats
