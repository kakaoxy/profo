"""微信 openid 解析（统一入口）.

**为什么抽出来**：迁移前全仓有 4 套同构实现（迭代二审计 §1）：
``services/recruit/attribution.py:251``、``services/leads/notify.py:35``、
``services/growth_center/customer_notify.py:64``、``services/marketing/notify.py:265``。
前 3 处（按列表返回全部 openid）已收敛到本模块（:func:`resolve_user_openids`）；
**第 4 处 ``services/marketing/notify.py`` 未收敛**——它用 ``.first()`` 只取第一个
carrier 并返回单个字符串（推送侧空快照回填语义），与「列表」语义不同，
改动它属行为变更，不在零回归范围内。

统一规则（本模块实现的是前 3 处）：

1. 主账号直接绑定 ``users.wechat_openid`` 非空 → 只用它；
2. 否则反查「已合并临时账号」：``users.merged_to_user_id == user_id
   AND status == 'merged' AND wechat_openid IS NOT NULL``；
3. 都没有 → 空列表（调用方按「无 openid」跳过并留痕）。

不改变任何一个原调用点的行为：本模块只做同一谓词的复用，不新增分支。
"""

from sqlalchemy.orm import Session

from models import User


def resolve_user_openids(db: Session, user_id: str) -> list[str]:
    """解析单个用户可用的微信 openid 列表（主账号优先，回退已合并临时账号）.

    Args:
        db: 数据库会话
        user_id: 目标用户ID

    Returns:
        可发送 openid 列表；用户不存在或无任何可用 openid 时返回空列表。

    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return []
    if user.wechat_openid:
        return [user.wechat_openid]
    return _resolve_merged_openids(db, user_id)


def resolve_users_openids(db: Session, user_ids: list[str]) -> dict[str, list[str]]:
    """批量解析多个用户的 openid（两次查询，消除 N+1）.

    Args:
        db: 数据库会话
        user_ids: 目标用户ID列表

    Returns:
        用户ID → openid 列表的映射；无可用 openid 的用户不在结果中。
        调用方应使用 ``.get(uid, [])`` 读取。

    """
    if not user_ids:
        return {}
    result: dict[str, list[str]] = {}
    direct = db.query(User.id, User.wechat_openid).filter(
        User.id.in_(user_ids),
        User.wechat_openid.is_not(None),
    )
    for uid, openid in direct.all():
        if openid:
            result[uid] = [openid]

    missing = [uid for uid in user_ids if uid not in result]
    if not missing:
        return result

    merged_rows = (
        db.query(User.merged_to_user_id, User.wechat_openid)
        .filter(
            User.merged_to_user_id.in_(missing),
            User.status == "merged",
            User.wechat_openid.is_not(None),
        )
        .all()
    )
    for target_id, openid in merged_rows:
        if target_id and openid:
            result.setdefault(target_id, []).append(openid)
    return result


def _resolve_merged_openids(db: Session, user_id: str) -> list[str]:
    """反查已合并临时账号持有的 openid（原 4 处实现的同一谓词）."""
    merged = (
        db.query(User)
        .filter(
            User.merged_to_user_id == user_id,
            User.status == "merged",
            User.wechat_openid.isnot(None),
        )
        .all()
    )
    return [u.wechat_openid for u in merged if u.wechat_openid]


__all__ = [
    "resolve_user_openids",
    "resolve_users_openids",
]
