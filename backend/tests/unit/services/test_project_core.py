"""ProjectCoreService 单元测试."""

import pytest
from sqlalchemy.orm import Session

from models import Role, User
from models.common import ProjectStatus
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate
from services.projects.core import ProjectCoreService
from services.system.exceptions import ResourceNotFoundError
from utils.auth import get_password_hash


@pytest.fixture()
def seed_user(db_session: Session) -> User:
    """创建测试所需的 Role 和 User."""
    role = Role(id="test-role", name="测试角色", code="test", permissions=["view_data"])
    db_session.add(role)
    db_session.commit()

    user = User(
        id="test-user",
        username="testuser",
        password=get_password_hash("Test123!"),
        nickname="测试用户",
        role_id="test-role",
        status="active",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture()
def svc(db_session: Session) -> ProjectCoreService:
    """创建 ProjectCoreService 实例."""
    return ProjectCoreService(db_session)


def _make_create_data(**overrides) -> ProjectCreate:
    """构造 ProjectCreate 测试数据."""
    defaults = {
        "community_name": "测试小区",
        "address": "测试地址1号",
        "contract_no": "MFB-202606-0001",
    }
    defaults.update(overrides)
    return ProjectCreate(**defaults)


class TestCreateProject:
    """create_project 测试."""

    def test_success(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """正常创建项目应返回 ProjectResponse."""
        data = _make_create_data()
        result = svc.create_project(data)

        assert result.id is not None
        assert result.community_name == "测试小区"
        assert result.address == "测试地址1号"
        assert result.status == ProjectStatus.SIGNING.value
        assert result.is_deleted is False

    def test_with_owner_info(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """创建项目时提供业主信息应一并保存."""
        data = _make_create_data(owner_name="张三", owner_phone="13800000001")
        result = svc.create_project(data)

        assert result.id is not None
        assert result.owner_name == "张三"
        assert result.owner_phone == "13800000001"


class TestGetProject:
    """get_project 测试."""

    def test_existing_project(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """获取已有项目应返回 ProjectResponse."""
        data = _make_create_data()
        created = svc.create_project(data)

        result = svc.get_project(created.id)
        assert result is not None
        assert result.id == created.id
        assert result.community_name == "测试小区"

    def test_non_existent_raises_resource_not_found(self, db_session: Session, svc: ProjectCoreService) -> None:
        """获取不存在的项目应抛出 ResourceNotFoundError."""
        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            svc.get_project("non-existent-id")


class TestGetProjects:
    """get_projects 测试."""

    def test_list_all(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """无筛选条件应返回所有项目."""
        svc.create_project(_make_create_data(contract_no="MFB-001"))
        svc.create_project(_make_create_data(community_name="另一小区", contract_no="MFB-002"))

        result = svc.get_projects()
        assert result["total"] == 2
        assert len(result["items"]) == 2

    def test_filter_by_status(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """按状态筛选项目."""
        created = svc.create_project(_make_create_data())

        # 签约中的项目
        result = svc.get_projects(status_filter=ProjectStatus.SIGNING.value)
        assert result["total"] == 1

        # 在售项目应为0
        result = svc.get_projects(status_filter=ProjectStatus.SELLING.value)
        assert result["total"] == 0

    def test_filter_by_community_name(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """按小区名称筛选项目."""
        svc.create_project(_make_create_data(community_name="阳光花园"))
        svc.create_project(_make_create_data(community_name="月光花园", contract_no="MFB-002"))

        result = svc.get_projects(community_name="阳光")
        assert result["total"] == 1
        assert result["items"][0].community_name == "阳光花园"

    def test_pagination(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """分页参数应正确生效."""
        for i in range(5):
            svc.create_project(_make_create_data(community_name=f"小区{i}", contract_no=f"MFB-00{i}"))

        page1 = svc.get_projects(page=1, page_size=2)
        assert page1["total"] == 5
        assert len(page1["items"]) == 2
        assert page1["page"] == 1
        assert page1["page_size"] == 2

        page2 = svc.get_projects(page=2, page_size=2)
        assert len(page2["items"]) == 2

        page3 = svc.get_projects(page=3, page_size=2)
        assert len(page3["items"]) == 1


class TestUpdateProject:
    """update_project 测试."""

    def test_success(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """更新已有项目应返回更新后的 ProjectResponse."""
        created = svc.create_project(_make_create_data())

        update = ProjectUpdate(community_name="新小区名")
        result = svc.update_project(created.id, update)

        assert result.community_name == "新小区名"

    def test_non_existent_raises_resource_not_found(self, db_session: Session, svc: ProjectCoreService) -> None:
        """更新不存在的项目应抛出 ResourceNotFoundError."""
        update = ProjectUpdate(community_name="不存在")
        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            svc.update_project("non-existent-id", update)


class TestDeleteProject:
    """delete_project 测试."""

    def test_success(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """软删除已有项目应标记 is_deleted 和 status."""
        created = svc.create_project(_make_create_data())

        svc.delete_project(created.id)

        # 删除后 get_project 应抛出 ResourceNotFoundError（因为查询过滤了 is_deleted）
        with pytest.raises(ResourceNotFoundError):
            svc.get_project(created.id)

    def test_non_existent_raises_resource_not_found(self, db_session: Session, svc: ProjectCoreService) -> None:
        """删除不存在的项目应抛出 ResourceNotFoundError."""
        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            svc.delete_project("non-existent-id")


class TestUpdateStatus:
    """update_status 测试."""

    def test_success(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """更新项目状态应返回更新后的 ProjectResponse."""
        created = svc.create_project(_make_create_data())

        # signing -> renovating 是合法流转
        status_update = StatusUpdate(status=ProjectStatus.RENOVATING)
        result = svc.update_status(created.id, status_update)

        assert result.status == ProjectStatus.RENOVATING.value

    def test_non_existent_raises_resource_not_found(self, db_session: Session, svc: ProjectCoreService) -> None:
        """更新不存在的项目状态应抛出 ResourceNotFoundError."""
        status_update = StatusUpdate(status=ProjectStatus.RENOVATING)
        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            svc.update_status("non-existent-id", status_update)


class TestGetProjectStats:
    """get_project_stats 测试."""

    def test_empty_stats(self, db_session: Session, svc: ProjectCoreService) -> None:
        """无项目时应返回全零统计."""
        stats = svc.get_project_stats()
        assert stats == {"signing": 0, "renovating": 0, "selling": 0, "sold": 0}

    def test_with_projects(self, db_session: Session, svc: ProjectCoreService, seed_user: User) -> None:
        """有项目时应返回正确统计."""
        svc.create_project(_make_create_data(contract_no="MFB-001"))
        svc.create_project(_make_create_data(community_name="另一小区", contract_no="MFB-002"))

        # 两个项目默认都是 signing 状态
        stats = svc.get_project_stats()
        assert stats["signing"] == 2
        assert stats["renovating"] == 0
