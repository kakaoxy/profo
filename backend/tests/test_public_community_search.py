"""C 端公开小区搜索：名称 / 地址 / 别名 三路匹配回归.

背景：小程序估价提交页的楼盘字典选择器依赖 `GET /public/communities/search`。
原实现只按 `Community.name` 模糊匹配，用户按地址或俗称（别名）搜索时无候选，
只能退回手工填写。本测试锁定公开搜索与 admin 字典搜索一致的三路命中口径。
"""

from sqlalchemy.orm import Session

from models.property import Community, CommunityAlias
from services.market.community_service import CommunityQueryService


def _community(community_id: str, name: str, *, address: str | None = None) -> Community:
    """构造一条最小可用小区记录."""
    return Community(
        id=community_id,
        name=name,
        district="静安区",
        business_circle="彭浦",
        address=address,
        is_active=True,
    )


def test_search_public_communities_matches_name(db_session: Session) -> None:
    """按小区名称模糊匹配（原有行为不回退）."""
    db_session.add(_community("c-name", "场中路1310弄"))
    db_session.commit()

    results = CommunityQueryService.search_public_communities(db_session, "场中路")

    assert [item.id for item in results] == ["c-name"]


def test_search_public_communities_matches_address(db_session: Session) -> None:
    """按小区地址模糊匹配（员工常用地址找小区）."""
    db_session.add(_community("c-addr", "场中路1310弄", address="静安区彭浦镇场中路1310弄"))
    db_session.commit()

    results = CommunityQueryService.search_public_communities(db_session, "彭浦镇")

    assert [item.id for item in results] == ["c-addr"]


def test_search_public_communities_matches_alias(db_session: Session) -> None:
    """按小区别名（俗称）匹配，返回主档名称."""
    db_session.add(_community("c-alias", "场中路1310弄"))
    db_session.add(
        CommunityAlias(
            community_id="c-alias",
            alias_name="海军小区",
            data_source="test",
            is_deleted=False,
        )
    )
    db_session.commit()

    results = CommunityQueryService.search_public_communities(db_session, "海军小区")

    assert [item.id for item in results] == ["c-alias"]
    assert results[0].name == "场中路1310弄"


def test_search_public_communities_ignores_deleted_alias(db_session: Session) -> None:
    """已删除别名不参与匹配，避免把历史俗称重新暴露给 C 端."""
    db_session.add(_community("c-deleted-alias", "场中路1310弄"))
    db_session.add(
        CommunityAlias(
            community_id="c-deleted-alias",
            alias_name="旧称小区",
            data_source="test",
            is_deleted=True,
        )
    )
    db_session.commit()

    results = CommunityQueryService.search_public_communities(db_session, "旧称小区")

    assert results == []


def test_search_public_communities_ignores_inactive_community(db_session: Session) -> None:
    """已归档小区不进入 C 端候选（与列表口径一致）."""
    archived = _community("c-archived", "已归档花园")
    archived.is_active = False
    db_session.add(archived)
    db_session.commit()

    results = CommunityQueryService.search_public_communities(db_session, "已归档花园")

    assert results == []
