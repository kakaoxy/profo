"""RenovationService.update_stage 无序完成测试.

验证放开顺序限制后：
1. 仅传 completed_stage（不传 renovation_stage）→ 记录指定阶段完成日期，renovation_stage 不流转
2. completed_stage 为非当前阶段 → 记录指定阶段（而非当前阶段）完成日期
3. 同时传 completed_stage + renovation_stage → 既记录完成日期又流转目标阶段
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from models import Project, ProjectRenovation
from models.common import ProjectStatus, RenovationStage
from schemas.project.renovation import RenovationUpdate
from services.projects.renovation import RenovationService


def _make_project(
    session: Session,
    *,
    project_id: str,
    renovation_stage: RenovationStage | None = None,
    status: ProjectStatus = ProjectStatus.RENOVATING,
) -> Project:
    """创建并持久化项目."""
    project = Project(
        id=uuid.uuid4(),
        name=f"测试项目-{project_id}",
        community_name="测试小区",
        address="测试地址",
        status=status,
        renovation_stage=renovation_stage,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_renovation(session: Session, *, project_id: str) -> ProjectRenovation:
    """创建并持久化装修记录."""
    renovation = ProjectRenovation(
        id=uuid.uuid4(),
        project_id=project_id,
        is_deleted=False,
    )
    session.add(renovation)
    session.commit()
    session.refresh(renovation)
    return renovation


class TestUpdateStageUnordered:
    """update_stage 无序完成测试."""

    def test_completed_stage_only_records_date_without_flow(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """仅传 completed_stage → 记录该阶段完成日期，renovation_stage 不变."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-completed-only",
            renovation_stage=RenovationStage.DEMOLITION,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)
        completed_at = datetime(2026, 1, 15, tzinfo=timezone.utc)
        payload = RenovationUpdate(
            completed_stage=RenovationStage.PLUMBING,
            stage_completed_at=completed_at,
        )

        service.update_stage(project.id, payload)

        session.refresh(project)
        renovation = session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first()
        assert renovation.stage_completed_dates == {"水电": "2026-01-15"}
        # renovation_stage 不变（未传 renovation_stage）
        assert project.renovation_stage == RenovationStage.DEMOLITION

    def test_completed_stage_non_current_records_specified_stage(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """completed_stage 为非当前阶段 → 记录指定阶段（而非当前阶段）完成日期."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-non-current",
            renovation_stage=RenovationStage.PLUMBING,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)
        completed_at = datetime(2026, 2, 20, tzinfo=timezone.utc)
        payload = RenovationUpdate(
            completed_stage=RenovationStage.DEMOLITION,
            stage_completed_at=completed_at,
        )

        service.update_stage(project.id, payload)

        session.refresh(project)
        renovation = session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first()
        # 记录的是"拆除"（completed_stage），而非"水电"（当前阶段）
        assert renovation.stage_completed_dates == {"拆除": "2026-02-20"}
        assert project.renovation_stage == RenovationStage.PLUMBING

    def test_completed_stage_and_renovation_stage_both(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """同时传 completed_stage + renovation_stage → 既记录完成日期又流转目标阶段."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-both",
            renovation_stage=RenovationStage.DEMOLITION,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)
        completed_at = datetime(2026, 3, 10, tzinfo=timezone.utc)
        payload = RenovationUpdate(
            completed_stage=RenovationStage.DESIGN,
            renovation_stage=RenovationStage.PLUMBING,
            stage_completed_at=completed_at,
        )

        service.update_stage(project.id, payload)

        session.refresh(project)
        renovation = session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first()
        assert renovation.stage_completed_dates == {"设计": "2026-03-10"}
        assert project.renovation_stage == RenovationStage.PLUMBING

    def test_all_stages_completed_auto_sets_end_date_and_stage(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """所有实际阶段均已完成 → 自动设置 actual_end_date 与 renovation_stage='已完成'."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-auto-complete",
            renovation_stage=RenovationStage.DELIVERY,
        )
        renovation = _make_renovation(session, project_id=project.id)
        # 预填 5 个阶段完成日期，仅差 "交付"
        renovation.stage_completed_dates = {
            "拆除": "2026-01-01",
            "设计": "2026-01-10",
            "水电": "2026-01-20",
            "木瓦": "2026-02-01",
            "油漆": "2026-02-15",
        }
        session.commit()
        session.refresh(renovation)

        service = RenovationService(db=session)
        completed_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
        payload = RenovationUpdate(
            completed_stage=RenovationStage.DELIVERY,
            stage_completed_at=completed_at,
        )

        service.update_stage(project.id, payload)

        session.refresh(project)
        session.refresh(renovation)
        # 所有 6 个阶段均有完成日期
        assert len(renovation.stage_completed_dates) == 6
        assert "交付" in renovation.stage_completed_dates
        # 自动设置竣工时间
        assert renovation.actual_end_date == completed_at
        # 自动流转到 "已完成"
        assert project.renovation_stage == RenovationStage.COMPLETED

    def test_partial_completion_does_not_auto_complete(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """仅完成部分阶段 → 不触发自动竣工."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-partial",
            renovation_stage=RenovationStage.DEMOLITION,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)
        completed_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
        payload = RenovationUpdate(
            completed_stage=RenovationStage.DEMOLITION,
            stage_completed_at=completed_at,
        )

        service.update_stage(project.id, payload)

        session.refresh(project)
        renovation = session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first()
        assert renovation.stage_completed_dates == {"拆除": "2026-04-01"}
        # 未全部完成，不设置竣工时间
        assert renovation.actual_end_date is None
        # renovation_stage 不流转（未传 renovation_stage）
        assert project.renovation_stage == RenovationStage.DEMOLITION

    def test_add_photo_allowed_in_selling_status(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """项目进入 selling 状态后仍允许上传装修照片."""
        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-selling-upload",
            renovation_stage=RenovationStage.COMPLETED,
            status=ProjectStatus.SELLING,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)
        photo = service.add_photo(
            project_id=project.id,
            stage="交付",
            url="https://example.com/photo.jpg",
        )

        assert photo.stage == "交付"
        assert photo.url == "https://example.com/photo.jpg"


class TestGetOrCreateRenovationConcurrency:
    """_get_or_create_renovation 并发安全测试."""

    def test_get_existing_renovation_uses_for_update(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """查询已有装修记录时应使用 with_for_update 加行级锁.

        验证修复：防止并发 update_stage 时 stage_completed_dates 被覆盖。
        """
        from unittest.mock import patch

        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-lock-check",
            renovation_stage=RenovationStage.DEMOLITION,
        )
        _make_renovation(session, project_id=project.id)

        service = RenovationService(db=session)

        # 拦截 query 链以验证 with_for_update 被调用
        original_query = session.query

        call_log: list[str] = []

        def tracking_query(*args, **kwargs):
            result = original_query(*args, **kwargs)
            # 包装返回的 query 对象以追踪方法调用
            original_with_for_update = result.with_for_update

            def tracked_with_for_update(*a, **kw):
                call_log.append("with_for_update")
                return original_with_for_update(*a, **kw)

            result.with_for_update = tracked_with_for_update
            return result

        with patch.object(session, "query", side_effect=tracking_query):
            service._get_or_create_renovation(project.id)

        assert "with_for_update" in call_log, "_get_or_create_renovation 必须使用 with_for_update 防止并发数据丢失"

    def test_concurrent_create_fallback_query_returns_existing(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """IntegrityError 回退路径：rollback 后重查应返回已有记录.

        模拟场景：两个事务同时发现 renovation 不存在并尝试插入，
        第二个事务收到 IntegrityError 后应通过重查获取第一个事务创建的记录。
        """
        from unittest.mock import patch

        from sqlalchemy.exc import IntegrityError

        session = seeded_db["session"]
        project = _make_project(
            session,
            project_id="proj-reno-concurrent-fallback",
            renovation_stage=RenovationStage.DEMOLITION,
        )

        # 预创建一条记录模拟"另一个事务已插入并提交"
        pre_created = ProjectRenovation(
            id=uuid.uuid4(),
            project_id=project.id,
            is_deleted=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(pre_created)
        session.commit()

        service = RenovationService(db=session)

        # 让 add+flush 抛出 IntegrityError，模拟并发插入冲突
        original_add = session.add
        add_called = [False]

        def add_then_raise(obj, *args, **kwargs):
            if isinstance(obj, ProjectRenovation) and not add_called[0]:
                add_called[0] = True
                dup_msg = "duplicate key"
                raise IntegrityError(dup_msg, None, None)
            return original_add(obj, *args, **kwargs)

        with patch.object(session, "add", side_effect=add_then_raise):
            result = service._get_or_create_renovation(project.id)

        assert result is not None
        assert result.project_id == project.id
