"""CommunityMerger 单元测试."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, call, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from services.market.merger import CommunityMerger, MergeResult


@pytest.fixture()
def merger() -> CommunityMerger:
    """提供 CommunityMerger 实例."""
    return CommunityMerger()


def _make_community_mock(
    id: int = 1,
    name: str = "测试小区",
    is_active: bool = True,
    total_properties: int = 0,
) -> MagicMock:
    """构造 Community 模型 mock."""
    c = MagicMock()
    c.id = id
    c.name = name
    c.is_active = is_active
    c.total_properties = total_properties
    c.updated_at = None
    return c


def _make_alias_mock(
    community_id: int = 1,
    alias_name: str = "别名A",
    data_source: str = "merge_operation",
) -> MagicMock:
    """构造 CommunityAlias 模型 mock."""
    a = MagicMock()
    a.community_id = community_id
    a.alias_name = alias_name
    a.data_source = data_source
    return a


def _setup_primary_query(db: MagicMock, primary: MagicMock) -> None:
    """配置主小区查询 mock 链."""
    primary_q = MagicMock()
    primary_q.filter.return_value = primary_q
    primary_q.first.return_value = primary
    db.query.side_effect = [primary_q]


# ---------------------------------------------------------------------------
# merge_communities — 成功路径
# ---------------------------------------------------------------------------


class TestMergeCommunitiesSuccess:
    """merge_communities 成功路径测试."""

    def test_successful_merge(self, merger: CommunityMerger) -> None:
        """正常合并应返回成功结果并 commit."""
        db = MagicMock()
        primary = _make_community_mock(id=1, name="主小区")
        merge_c1 = _make_community_mock(id=2, name="小区B")
        merge_c2 = _make_community_mock(id=3, name="小区C")

        # _validate_communities: 主小区查询 + 合并列表计数
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = primary

        merge_count_q = MagicMock()
        merge_count_q.filter.return_value = merge_count_q
        merge_count_q.count.return_value = 2

        # _count_affected_properties
        prop_count_q = MagicMock()
        prop_count_q.filter.return_value = prop_count_q
        prop_count_q.count.return_value = 5

        # merge_communities 查询
        merge_list_q = MagicMock()
        merge_list_q.filter.return_value = merge_list_q
        merge_list_q.all.return_value = [merge_c1, merge_c2]

        # _process_aliases 中的 _ensure_alias_exists + _transfer_existing_aliases
        alias_exist_q = MagicMock()
        alias_exist_q.filter.return_value = alias_exist_q
        alias_exist_q.first.return_value = None  # 别名不存在

        old_aliases_q = MagicMock()
        old_aliases_q.filter.return_value = old_aliases_q
        old_aliases_q.all.return_value = []  # 无旧别名

        # _migrate_properties
        migrate_q = MagicMock()
        migrate_q.filter.return_value = migrate_q

        # _refresh_primary_stats
        refresh_q = MagicMock()
        refresh_q.filter.return_value = refresh_q
        refresh_q.count.return_value = 5

        db.query.side_effect = [
            primary_q,        # _validate_communities: primary
            merge_count_q,    # _validate_communities: merge count
            merge_list_q,     # merge_communities: merge list
            prop_count_q,     # _count_affected_properties
            alias_exist_q,    # _ensure_alias_exists (小区B)
            old_aliases_q,    # _transfer_existing_aliases (小区B)
            alias_exist_q,    # _ensure_alias_exists (小区C)
            old_aliases_q,    # _transfer_existing_aliases (小区C)
            migrate_q,        # _migrate_properties
            refresh_q,        # _refresh_primary_stats
        ]

        result = merger.merge_communities(1, [2, 3], db)

        assert result.success is True
        assert result.affected_properties == 5
        assert "成功合并 2 个小区" in result.message
        db.commit.assert_called_once()
        db.rollback.assert_not_called()

    def test_archive_sets_inactive(self, merger: CommunityMerger) -> None:
        """_archive_communities 应将 is_active 设为 False 并更新 updated_at."""
        c1 = _make_community_mock(id=2, name="小区B")
        c2 = _make_community_mock(id=3, name="小区C")

        merger._archive_communities([c1, c2])

        assert c1.is_active is False
        assert c2.is_active is False
        assert c1.updated_at is not None
        assert c2.updated_at is not None

    def test_migrate_properties_updates_community_id(self, merger: CommunityMerger) -> None:
        """_migrate_properties 应将房源的 community_id 更新为主小区 ID."""
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        db.query.return_value = q

        merger._migrate_properties(1, [2, 3], db)

        q.update.assert_called_once()
        # update({PropertyCurrent.community_id: 1}, synchronize_session=False)
        pos_args = q.update.call_args[0]
        kw_args = q.update.call_args[1]
        assert kw_args == {"synchronize_session": False}
        # 验证 dict 的值为主小区 ID
        update_dict = pos_args[0]
        assert list(update_dict.values())[0] == 1

    def test_refresh_primary_stats_updates_count(self, merger: CommunityMerger) -> None:
        """_refresh_primary_stats 应更新主小区的 total_properties."""
        db = MagicMock()
        primary = _make_community_mock(id=1, total_properties=0)
        q = MagicMock()
        q.filter.return_value = q
        q.count.return_value = 10
        db.query.return_value = q

        merger._refresh_primary_stats(primary, db)

        assert primary.total_properties == 10
        assert primary.updated_at is not None


# ---------------------------------------------------------------------------
# merge_communities — 验证错误
# ---------------------------------------------------------------------------


class TestMergeCommunitiesValidation:
    """merge_communities 验证错误测试."""

    def test_primary_not_found(self, merger: CommunityMerger) -> None:
        """主小区不存在应返回失败."""
        db = MagicMock()
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = None

        db.query.return_value = primary_q

        result = merger.merge_communities(999, [2], db)

        assert result.success is False
        assert "主小区 ID 999 不存在" in result.message
        assert result.affected_properties == 0
        db.rollback.assert_called_once()

    def test_merge_ids_contain_invalid(self, merger: CommunityMerger) -> None:
        """合并列表包含无效 ID 应返回失败."""
        db = MagicMock()
        primary = _make_community_mock(id=1)
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = primary

        count_q = MagicMock()
        count_q.filter.return_value = count_q
        count_q.count.return_value = 1  # 只有1个有效，但请求了2个

        db.query.side_effect = [primary_q, count_q]

        result = merger.merge_communities(1, [2, 999], db)

        assert result.success is False
        assert "无效或已删除" in result.message
        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# merge_communities — 数据库错误
# ---------------------------------------------------------------------------


class TestMergeCommunitiesDBError:
    """merge_communities 数据库错误测试."""

    def test_sqlalchemy_error_rollback(self, merger: CommunityMerger) -> None:
        """SQLAlchemy 错误应回滚并返回失败."""
        db = MagicMock()
        db.query.side_effect = SQLAlchemyError("connection lost")

        result = merger.merge_communities(1, [2], db)

        assert result.success is False
        assert "数据库错误" in result.message
        db.rollback.assert_called_once()

    def test_unexpected_error_rollback(self, merger: CommunityMerger) -> None:
        """未知异常应回滚并返回失败."""
        db = MagicMock()
        primary = _make_community_mock(id=1)
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = primary

        merge_count_q = MagicMock()
        merge_count_q.filter.return_value = merge_count_q
        merge_count_q.count.return_value = 1

        # 在 merge_list 查询时抛出意外异常
        merge_list_q = MagicMock()
        merge_list_q.filter.return_value = merge_list_q
        merge_list_q.all.side_effect = RuntimeError("unexpected")

        db.query.side_effect = [primary_q, merge_count_q, merge_list_q]

        result = merger.merge_communities(1, [2], db)

        assert result.success is False
        assert "系统未知错误" in result.message
        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# _validate_communities
# ---------------------------------------------------------------------------


class TestValidateCommunities:
    """_validate_communities 测试."""

    def test_primary_inactive_raises(self, merger: CommunityMerger) -> None:
        """主小区已停用应抛出 ValueError."""
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = None  # is_active 过滤后查不到
        db.query.return_value = q

        with pytest.raises(ValueError, match="主小区 ID 1 不存在"):
            merger._validate_communities(1, [2], db)

    def test_merge_ids_count_mismatch_raises(self, merger: CommunityMerger) -> None:
        """合并列表中部分 ID 无效应抛出 ValueError."""
        db = MagicMock()
        primary = _make_community_mock(id=1)
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = primary

        count_q = MagicMock()
        count_q.filter.return_value = count_q
        count_q.count.return_value = 0  # 没有有效的合并 ID

        db.query.side_effect = [primary_q, count_q]

        with pytest.raises(ValueError, match="无效或已删除"):
            merger._validate_communities(1, [2, 3], db)

    def test_valid_returns_primary(self, merger: CommunityMerger) -> None:
        """全部有效应返回主小区对象."""
        db = MagicMock()
        primary = _make_community_mock(id=1)
        primary_q = MagicMock()
        primary_q.filter.return_value = primary_q
        primary_q.first.return_value = primary

        count_q = MagicMock()
        count_q.filter.return_value = count_q
        count_q.count.return_value = 2

        db.query.side_effect = [primary_q, count_q]

        result = merger._validate_communities(1, [2, 3], db)

        assert result is primary


# ---------------------------------------------------------------------------
# _count_affected_properties
# ---------------------------------------------------------------------------


class TestCountAffectedProperties:
    """_count_affected_properties 测试."""

    def test_returns_count(self, merger: CommunityMerger) -> None:
        """应返回活跃房源数量."""
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.count.return_value = 7
        db.query.return_value = q

        result = merger._count_affected_properties([2, 3], db)

        assert result == 7


# ---------------------------------------------------------------------------
# _process_aliases
# ---------------------------------------------------------------------------


class TestProcessAliases:
    """_process_aliases 测试."""

    def test_creates_alias_for_each_merge_community(self, merger: CommunityMerger) -> None:
        """每个被合并小区的名字应作为别名添加到主小区."""
        db = MagicMock()
        primary = _make_community_mock(id=1)
        merge_c1 = _make_community_mock(id=2, name="小区B")
        merge_c2 = _make_community_mock(id=3, name="小区C")

        # _ensure_alias_exists 查询：别名不存在
        alias_q = MagicMock()
        alias_q.filter.return_value = alias_q
        alias_q.first.return_value = None

        # _transfer_existing_aliases 查询：无旧别名
        old_q = MagicMock()
        old_q.filter.return_value = old_q
        old_q.all.return_value = []

        db.query.side_effect = [alias_q, old_q, alias_q, old_q]

        merger._process_aliases(primary, [merge_c1, merge_c2], db)

        # 应添加两个新别名
        assert db.add.call_count == 2


# ---------------------------------------------------------------------------
# _ensure_alias_exists
# ---------------------------------------------------------------------------


class TestEnsureAliasExists:
    """_ensure_alias_exists 测试."""

    def test_creates_new_alias_when_not_exists(self, merger: CommunityMerger) -> None:
        """别名不存在时应创建."""
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = None
        db.query.return_value = q

        merger._ensure_alias_exists(db, 1, "小区B", "merge_operation")

        db.add.assert_called_once()
        new_alias = db.add.call_args[0][0]
        assert new_alias.alias_name == "小区B"
        assert new_alias.community_id == 1
        assert new_alias.data_source == "merge_operation"

    def test_skips_when_alias_exists(self, merger: CommunityMerger) -> None:
        """别名已存在时应跳过."""
        db = MagicMock()
        existing = _make_alias_mock(community_id=1, alias_name="小区B")
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = existing
        db.query.return_value = q

        merger._ensure_alias_exists(db, 1, "小区B", "merge_operation")

        db.add.assert_not_called()


# ---------------------------------------------------------------------------
# _transfer_existing_aliases
# ---------------------------------------------------------------------------


class TestTransferExistingAliases:
    """_transfer_existing_aliases 测试."""

    def test_transfers_non_duplicate_alias(self, merger: CommunityMerger) -> None:
        """非重复别名应转移到新小区."""
        db = MagicMock()
        alias = _make_alias_mock(community_id=2, alias_name="别名X")

        old_q = MagicMock()
        old_q.filter.return_value = old_q
        old_q.all.return_value = [alias]

        dup_q = MagicMock()
        dup_q.filter.return_value = dup_q
        dup_q.count.return_value = 0  # 不重复

        db.query.side_effect = [old_q, dup_q]

        merger._transfer_existing_aliases(db, 2, 1)

        assert alias.community_id == 1

    def test_deletes_duplicate_alias(self, merger: CommunityMerger) -> None:
        """重复别名应删除旧记录."""
        db = MagicMock()
        alias = _make_alias_mock(community_id=2, alias_name="别名X")

        old_q = MagicMock()
        old_q.filter.return_value = old_q
        old_q.all.return_value = [alias]

        dup_q = MagicMock()
        dup_q.filter.return_value = dup_q
        dup_q.count.return_value = 1  # 重复

        db.query.side_effect = [old_q, dup_q]

        merger._transfer_existing_aliases(db, 2, 1)

        db.delete.assert_called_once_with(alias)
        assert alias.community_id == 2  # 未被修改


# ---------------------------------------------------------------------------
# MergeResult
# ---------------------------------------------------------------------------


class TestMergeResult:
    """MergeResult 值对象测试."""

    def test_success_result(self) -> None:
        """成功结果应正确初始化."""
        result = MergeResult(success=True, affected_properties=5, message="ok")
        assert result.success is True
        assert result.affected_properties == 5
        assert result.message == "ok"

    def test_failure_result(self) -> None:
        """失败结果应正确初始化."""
        result = MergeResult(success=False, affected_properties=0, message="err")
        assert result.success is False
        assert result.affected_properties == 0
        assert result.message == "err"
