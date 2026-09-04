"""数据治理: 小区响应别名字段(合并历史)回归测试.

覆盖:
- query_communities 返回的 CommunityResponse.aliases 字段类型为 list
- 无别名场景: aliases 为空列表
- 有别名场景: aliases 为非空列表,且只包含未软删除的别名
- update_community 返回的 CommunityResponse.aliases 同样被填充
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.property import Community, CommunityAlias
from schemas.community import CommunityAliasResponse, CommunityResponse, CommunityUpdateRequest
from services.market.community_service import CommunityQueryService


def _make_community(db_session: Session, *, name: str) -> Community:
    """创建并持久化一个最小可用小区."""
    community = Community(
        id=name,
        name=name,
        city_id=None,
        district=None,
        business_circle=None,
        avg_price_wan=None,
        total_properties=0,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(community)
    db_session.commit()
    db_session.refresh(community)
    return community


def _make_alias(
    db_session: Session,
    *,
    community_id: str,
    alias_name: str,
    data_source: str = "manual",
    is_deleted: bool = False,
) -> CommunityAlias:
    """创建并持久化一条小区别名记录."""
    alias = CommunityAlias(
        community_id=community_id,
        alias_name=alias_name,
        data_source=data_source,
        is_deleted=is_deleted,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(alias)
    db_session.commit()
    db_session.refresh(alias)
    return alias


def test_query_communities_returns_aliases_as_list_when_no_aliases(db_session: Session) -> None:
    """无别名场景: query_communities 返回的 aliases 字段应为空 list."""
    _make_community(db_session, name="无别名小区")

    result = CommunityQueryService.query_communities(db=db_session, search="无别名小区")

    assert result.total == 1
    item = result.items[0]
    assert isinstance(item, CommunityResponse)
    # 核心断言: aliases 字段类型为 list,且为空
    assert hasattr(item, "aliases")
    assert isinstance(item.aliases, list)
    assert item.aliases == []


def test_query_communities_returns_aliases_when_present(db_session: Session) -> None:
    """有别名场景: query_communities 返回的 aliases 应为非空 list,且排除软删除项."""
    community = _make_community(db_session, name="有别名校占位")
    _make_alias(
        db_session,
        community_id=community.id,
        alias_name="有别名校占位-旧名A",
        data_source="lianjia",
        is_deleted=False,
    )
    _make_alias(
        db_session,
        community_id=community.id,
        alias_name="有别名校占位-旧名B",
        data_source="beike",
        is_deleted=True,  # 软删除,不应出现在结果中
    )

    result = CommunityQueryService.query_communities(db=db_session, search="有别名校占位")

    assert result.total == 1
    item = result.items[0]
    # 核心断言: aliases 字段类型为 list,且非空
    assert isinstance(item.aliases, list)
    assert len(item.aliases) == 1
    alias = item.aliases[0]
    assert isinstance(alias, CommunityAliasResponse)
    assert alias.alias_name == "有别名校占位-旧名A"
    assert alias.data_source == "lianjia"


def test_update_community_returns_response_with_aliases(db_session: Session) -> None:
    """update_community 返回的 CommunityResponse 也应填充 aliases 字段."""
    community = _make_community(db_session, name="更新前别名小区")
    _make_alias(
        db_session,
        community_id=community.id,
        alias_name="更新前别名小区-原名",
        data_source="manual",
        is_deleted=False,
    )

    body = CommunityUpdateRequest(district="新城区")
    updated = CommunityQueryService.update_community(db_session, community.id, body)

    assert isinstance(updated, CommunityResponse)
    assert hasattr(updated, "aliases")
    assert isinstance(updated.aliases, list)
    assert len(updated.aliases) == 1
    assert updated.aliases[0].alias_name == "更新前别名小区-原名"
