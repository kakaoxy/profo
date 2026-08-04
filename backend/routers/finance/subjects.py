"""科目管理路由层.

按 AGENTS.md 规范：
- Router 禁 SQLAlchemy 查询，全部通过 FinanceService 编排
- 直接返回 Pydantic 模型，不包装 code/msg/data
- 404/400/409 由 ServiceException 子类统一异常处理器返回
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from dependencies.auth import (
    DbSessionDep,
    SubjectReadPermDep,
    SubjectWritePermDep,
)
from models.common import SubjectLevel, SubjectStage
from schemas.project.finance import (
    FinanceSubjectCreate,
    FinanceSubjectFilter,
    FinanceSubjectResponse,
    FinanceSubjectUpdate,
)
from services import FinanceService
from utils.common import RateLimits, limiter

router = APIRouter(
    prefix="/admin/subjects",
    tags=["finance-subjects"],
)


def get_finance_service(db: DbSessionDep) -> FinanceService:
    """创建财务服务实例."""
    return FinanceService(db)


_FinanceServiceDep = Annotated[FinanceService, Depends(get_finance_service)]


@router.get(
    "",
    summary="获取科目列表",
)
def list_subjects(
    service: _FinanceServiceDep,
    _current_user: SubjectReadPermDep,
    mode: Annotated[str | None, Query(description="按业务模式筛选(agent/acquire)")] = None,
    stage: Annotated[SubjectStage | None, Query(description="按业务阶段筛选")] = None,
    level: Annotated[SubjectLevel | None, Query(description="按成本层级筛选")] = None,
    system: Annotated[bool | None, Query(description="按系统预置/自定义筛选")] = None,
    is_deleted: Annotated[bool, Query(description="是否包含已删除(默认仅未删除)")] = False,
    search: Annotated[str | None, Query(max_length=50, description="模糊搜索科目名称")] = None,
) -> list[FinanceSubjectResponse]:
    """查询科目列表（支持 mode/stage/level/system/is_deleted/search 筛选）."""
    filter_data = FinanceSubjectFilter(
        mode=mode,
        stage=stage,
        level=level,
        system=system,
        is_deleted=is_deleted,
        search=search,
    )
    return service.list_subjects(filter_data)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="创建科目",
)
@limiter.limit(RateLimits.SUBJECT_WRITE)
def create_subject(
    request: Request,
    data: FinanceSubjectCreate,
    service: _FinanceServiceDep,
    _current_user: SubjectWritePermDep,
) -> FinanceSubjectResponse:
    """创建用户自定义科目（system 强制为 False）.

    速率限制：100次/小时.
    """
    return service.create_subject(data)


@router.patch(
    "/{subject_id}",
    summary="更新科目",
)
@limiter.limit(RateLimits.SUBJECT_WRITE)
def update_subject(
    request: Request,
    subject_id: Annotated[str, Path(description="科目ID")],
    data: FinanceSubjectUpdate,
    service: _FinanceServiceDep,
    _current_user: SubjectWritePermDep,
) -> FinanceSubjectResponse:
    """更新科目（系统预置科目的 name/level 不可修改）.

    速率限制：100次/小时.
    """
    return service.update_subject(subject_id, data)


@router.delete(
    "/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除科目",
)
@limiter.limit(RateLimits.SUBJECT_DELETE)
def delete_subject(
    request: Request,
    subject_id: Annotated[str, Path(description="科目ID")],
    service: _FinanceServiceDep,
    _current_user: SubjectWritePermDep,
) -> None:
    """软删除科目（系统预置科目不可删除）.

    速率限制：20次/小时.
    """
    service.delete_subject(subject_id)
