"""小区合并 · 字典楼栋树与业务单据改指（H3 修复，SPEC community-merge-union 拆分）.

[拆分理由] ``merger.py`` 本次修复新增约 700 行后破 1200 行，超 AGENTS「单文件
>500 行必须拆分」。本模块**整体搬运**既有 H3 逻辑（合并迁移字典楼栋/改指单据、
解除合并回迁），零行为改动——搬运内容由 ``test_bd_merge_conflict.py``（C1/C2/C2-a）
回归验证。

与宿主 ``CommunityMerger`` 共享：
- ``_DICT_DOC_MODELS``（单据模型常量，定义在宿主类体）；
- 事务边界：**全部方法内禁止 commit**，由宿主统一提交。
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from models import BdRoom

logger = logging.getLogger(__name__)


class MergeDictTreeMixin:
    """字典楼栋树 / 业务单据在合并与解除合并中的对称改指."""

    def _migrate_dict_buildings(self, primary_id: str, merge_ids: list[str], db: Session) -> dict[str, int]:
        """字典楼栋树跟随合并迁移（H3 修复，与 _migrate_properties 同事务）.

        - 主档须按楼栋号看得到被并小区的楼栋（总览/详情/FR-14 数据情况）；
        - 不迁移的话，被并小区虽已 is_active=False，仍是 bd_buildings 的持有者，
          且 delete_community 拦不住「本小区已被并入别处」→ 整树物理删除不可恢复。

        uq(community_id, building_no) 冲突（主档已有同号楼栋）的楼栋不迁移，
        保留在原小区（其归属在解除合并时自然还原），避免整笔事务失败。
        origin_community_id 记录原归属，供 unmerge 可逆回迁。

        **origin 只写一次**（``COALESCE(origin, community_id)``）：链式合并 B→A→C 时
        若直接覆盖，楼栋的最初归属 B 会变成中间主档 A，解除合并 C→B 时无法归位
        （SPEC §4.6 / 实测 S6）。

        冲突比较不能只看主档存量：同批多个被并小区之间也可能同号（真实数据里
        ``01``/``02`` 等楼栋号在 19.6k 个小区中重复率极高）。原实现只做
        ``NOT EXISTS(主档同号)``，同批两行同号时会双双通过检查 → 同一 UPDATE
        内两行都改判主档 → 撞 ``uq_bd_buildings_no`` 使整笔合并回滚（线上表现为
        合并永远 400「数据库操作失败」）。故追加同批内「同号只迁移 id 最小的一行」
        判定（同一语句内子查询看到的是语句开始时的快照，结果确定）。

        Returns:
            {"buildings": 迁移楼栋数, "rooms": 随之迁移的户室数}

        """
        from models import BdBuilding

        # 一条 SQL 完成迁移（避免逐楼栋往返）：主档已有同号、或同批中已有更小的
        # 同号行被迁移的那批留在原小区
        result = db.execute(
            text(
                """
                UPDATE bd_buildings b
                   SET community_id = :primary_id,
                       origin_community_id = COALESCE(b.origin_community_id, b.community_id),
                       updated_at = now()
                 WHERE b.community_id = ANY(:merge_ids)
                   AND NOT EXISTS (
                       SELECT 1 FROM bd_buildings p
                        WHERE p.community_id = :primary_id
                          AND p.building_no = b.building_no
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM bd_buildings s
                        WHERE s.community_id = ANY(:merge_ids)
                          AND s.building_no = b.building_no
                          AND s.id < b.id
                   )
                """
            ),
            {"primary_id": str(primary_id), "merge_ids": [str(i) for i in merge_ids]},
        )
        moved = result.rowcount or 0
        room_count = (
            db.query(BdRoom)
            .filter(
                BdRoom.building_id.in_(
                    db.query(BdBuilding.id).filter(
                        BdBuilding.community_id == str(primary_id),
                        BdBuilding.origin_community_id.in_([str(i) for i in merge_ids]),
                    )
                )
            )
            .count()
        )
        logger.info("小区合并：字典楼栋迁移 %d 个（户室 %d 个随之改归主档）", moved, room_count)
        return {"buildings": moved, "rooms": room_count}

    def _restore_dict_buildings(self, merged_id: str, primary_id: str, db: Session) -> list[int]:
        """解除合并：把合并时改指主档的字典楼栋按 origin_community_id 回迁原本小区.

        只回迁带 origin_community_id == 本被并小区 的楼栋（merge 迁移才有标记），
        手工改归主档的楼栋不回迁。

        Returns:
            本次回迁的楼栋 id 列表（供引用单据同步拆回）。

        """
        result = db.execute(
            text(
                """
                UPDATE bd_buildings
                   SET community_id = origin_community_id,
                       origin_community_id = NULL,
                       updated_at = now()
                 WHERE community_id = :primary_id
                   AND origin_community_id = :merged_id
             RETURNING id
                """
            ),
            {"primary_id": str(primary_id), "merged_id": str(merged_id)},
        )
        restored = [int(r[0]) for r in result.all()]
        if restored:
            logger.info("解除合并：字典楼栋回迁 %d 个到小区 %s", len(restored), merged_id)
        return restored

    def _migrate_business_docs(self, primary_id: str, merge_ids: list[str], db: Session) -> int:
        """单据小区改指主档（H3 配套修复）.

        合并把字典楼栋改判主档后，若引用了这些楼栋的单据仍指向被并（已归档）小区，
        就形成「单据小区 ≠ 楼栋小区」——三模块创建/编辑链路的
        ``validate_dict_ownership`` 会以「字典楼栋不属于所选小区」400 挡住此后
        任何编辑（含只改状态/发布态），单据永久不可编辑，只能人工先把小区改对。
        故与楼栋迁移同事务把 projects/leads/l4_marketing_projects 的
        ``community_id`` 一并改判主档（楼栋/户室 id 不变，仍指向已随迁的实表行）。

        只改指「小区级单据」与「楼栋已随迁的单据」：楼栋号撞号被留在原小区的
        那批（见 ``_migrate_dict_buildings``）引用的单据保持原小区，否则又会
        造出新的「单据小区 ≠ 楼栋小区」脏关联（正好是本方法要消除的问题）。

        ``community_name`` 冗余列按既有口径保留原值（与 dictionary_link_service
        绑定口径一致：不改写来源单据的小区名冗余）。

        Returns:
            改指的关联单据张数。

        """
        merged_strs = [str(i) for i in merge_ids]
        primary_str = str(primary_id)
        moved_building_ids = [
            int(r[0])
            for r in db.execute(
                text("SELECT id FROM bd_buildings WHERE community_id = :p AND origin_community_id = ANY(:m)"),
                {"p": primary_str, "m": merged_strs},
            ).all()
        ]
        total = 0
        for model in self._DICT_DOC_MODELS:
            # 1. 未选楼栋/户室的小区级单据：无归属可比对，直接随小区改指
            total += int(
                db.query(model)
                .filter(
                    model.community_id.in_(merged_strs),
                    model.building_id.is_(None),
                    model.room_id.is_(None),
                )
                .update(
                    {model.community_id: primary_str, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
                or 0
            )
            if not moved_building_ids:
                continue
            # 2. 引用了「已随迁楼栋」的单据（楼栋直连或经户室反查）
            rooms_of_moved = db.query(BdRoom.id).filter(BdRoom.building_id.in_(moved_building_ids))
            total += int(
                db.query(model)
                .filter(
                    model.community_id.in_(merged_strs),
                    or_(
                        model.building_id.in_(moved_building_ids),
                        model.room_id.in_(rooms_of_moved.scalar_subquery()),
                    ),
                )
                .update(
                    {model.community_id: primary_str, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
                or 0
            )
        if total:
            logger.info("小区合并：%d 张关联单据改指主档（项目/线索/营销）", total)
        return total

    def _restore_business_docs(
        self, merged_id: str, primary_id: str, restored_building_ids: list[int], db: Session
    ) -> int:
        """解除合并：把引用了回迁楼栋的单据一并拆回被并小区.

        只拆引用 ``_restore_dict_buildings`` 本次回迁楼栋的单据（主档自身单据、
        以及引用撞号留在原小区楼栋的单据都不受影响），与 merge 的改指对称。

        ⚠️ 未覆盖：合并时被改指主档的「小区级单据」（未选楼栋/户室）不在此拆回——
        它们与哪些楼栋一起回迁没有可判定依据，沿用既有口径「房源类需人工迁移」。
        """
        if not restored_building_ids:
            return 0
        total = 0
        for model in self._DICT_DOC_MODELS:
            room_ids_of_restored = db.query(BdRoom.id).filter(BdRoom.building_id.in_(restored_building_ids))
            restored = (
                db.query(model)
                .filter(
                    model.community_id == primary_id,
                    or_(
                        model.building_id.in_(restored_building_ids),
                        model.room_id.in_(room_ids_of_restored.scalar_subquery()),
                    ),
                )
                .update(
                    {model.community_id: merged_id, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
            )
            total += int(restored or 0)
        if total:
            logger.info("解除合并：%d 张关联单据拆回被并小区 %s", total, merged_id)
        return total
