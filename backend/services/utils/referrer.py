"""分享归因 referrer 统一校验.

C 端分享链路的 referrer 为明文员工 ID，可被恶意构造伪造归属/刷归因统计；
所有将客户端 referrer 落库的写路径（估价/房源/房源单/招募的 visit 与留资）
统一经 ``resolve_valid_referrer`` 校验：仅存在、active 且具备后台身份的
员工生效，无效一律静默置空（与估价线索 ``_resolve_referrer_id`` 原口径一致）。
"""

from sqlalchemy.orm import Session

from models import L4MarketingProject, Project, ProjectSale, SystemConfig, User

# 全局兜底负责人配置键（system_configs 表；value=员工ID，NULL/缺行=未设置）
GROWTH_GLOBAL_FALLBACK_KEY = "growth_center.global_fallback_employee_id"


def resolve_valid_referrer(db: Session, referrer: str | None) -> str | None:
    """校验分享归属员工 ID，无效时返回 None（静默降级为无归属）.

    口径：用户存在 + status=active + 具备后台身份（主角色或附加角色含后台
    角色，见 ``AuthService.has_backend_identity``），普通 C 端用户 ID 不生效，
    避免归因数据被非员工 ID 污染。

    Args:
        db: 同步数据库会话
        referrer: 客户端透传的分享归属员工 ID（可为空）

    Returns:
        校验通过的员工 ID；为空或无效（不存在/非 active/无后台身份）时返回 None

    """
    if not referrer:
        return None
    referrer_user = db.query(User).filter(User.id == referrer, User.status == "active").first()
    if referrer_user is None:
        return None
    # 方法内 import 避免与 services.system.auth 的潜在循环依赖
    from services.system.auth import AuthService

    if not AuthService.has_backend_identity(referrer_user):
        return None
    return referrer_user.id


def resolve_property_agent_referrer(db: Session, marketing_project_id: int) -> str | None:
    """按房源兜底链解析讲房人（无分享归因时的归属兜底）.

    链路：L4营销项目.project_id → Project.id → ProjectSale.property_agent_id
    （讲房人，软引用 users.id）。三级均过滤 ``is_deleted``（任一环节被软删除
    即视为链路失效），命中后经 ``resolve_valid_referrer`` 校验（存在 + active +
    后台身份）；任一环节缺失/软删除/讲房人账号无效时返回 None，由调用方降级。

    Args:
        db: 同步数据库会话
        marketing_project_id: L4 营销项目 ID（预约 marketing_project_id / 房源单
            source_property_id 同源）

    Returns:
        校验通过的讲房人员工 ID；链路缺失或无效时返回 None

    """
    row = (
        db.query(ProjectSale.property_agent_id)
        .join(Project, Project.id == ProjectSale.project_id)
        .join(L4MarketingProject, L4MarketingProject.project_id == Project.id)
        .filter(
            L4MarketingProject.id == marketing_project_id,
            L4MarketingProject.is_deleted.is_(False),
            Project.is_deleted.is_(False),
            ProjectSale.is_deleted.is_(False),
        )
        .first()
    )
    if row is None:
        return None
    return resolve_valid_referrer(db, row[0])


def resolve_global_fallback_referrer(db: Session) -> str | None:
    """解析全局兜底负责人（兜底链最后一环：分享归因/讲房人均未命中时）.

    读取 ``system_configs`` 表 ``GROWTH_GLOBAL_FALLBACK_KEY`` 配置值并经
    ``resolve_valid_referrer`` 校验（存在 + active + 后台身份）；未设置或
    员工已失效时返回 None，由调用方降级为无归属。

    Args:
        db: 同步数据库会话

    Returns:
        校验通过的全局兜底员工 ID；未设置或无效时返回 None

    """
    row = db.query(SystemConfig.value).filter(SystemConfig.key == GROWTH_GLOBAL_FALLBACK_KEY).first()
    if row is None or not row[0]:
        return None
    return resolve_valid_referrer(db, row[0])
