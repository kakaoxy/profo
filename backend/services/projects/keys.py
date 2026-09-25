"""后台钥匙管理 Service（Router 禁 ORM，权限过滤与留痕全部在此层）."""

import uuid
from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from models import KeyActorType, KeyAuditLog, KeyShare, KeyShareView, KeyStatus, ProjectKey, ProjectNormalKey, User
from schemas.keys import (
    GeneratedNormalKeyItem,
    KeyLogItem,
    KeyLogListResponse,
    KeyRevealResponse,
    KeysDetailResponse,
    KeySummaryResponse,
    ManagerKeyPutRequest,
    ManagerKeyResponse,
    NormalKeyBatchConfirmRequest,
    NormalKeyBatchCreateRequest,
    NormalKeyBatchDeleteResponse,
    NormalKeyCounts,
    NormalKeyGenerateRequest,
    NormalKeyGenerateResponse,
    NormalKeyItem,
    NormalKeyRegenerateRequest,
    NormalKeyUpdateRequest,
    ShareReferencedItem,
)
from services.projects.key_access import (
    active_share_key_refs,
    ensure_key_access,
    generate_six_digit,
    load_active_shares,
    load_existing_normal_key_ids,
    local_today,
    log_key_action,
    parse_share_items,
    utc_now,
)
from services.system.exceptions import ResourceNotFoundError, ValidationError


class KeyService:
    """后台钥匙管理：管理密码 + 普通密码 + 审计日志."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ==================== 内部助手 ====================

    def _user_names(self, user_ids: set[str]) -> dict[str, str]:
        """批量查询用户展示名快照."""
        from models import User as UserModel

        ids = {uid for uid in user_ids if uid}
        if not ids:
            return {}
        rows = self.db.query(UserModel).filter(UserModel.id.in_(ids)).all()
        return {str(u.id): (u.nickname or u.username) for u in rows}

    def _active_share_refs(self, project_ids: set[uuid.UUID]) -> tuple[dict[uuid.UUID, set[uuid.UUID]], int]:
        """进行中分享引用的密码组映射（project_id → {key_id}）.

        返回 (refs, active_share_total)：active_share_total 为涉及这些房源的
        进行中分享总数（分享中 N 按分享数而非条目数计）。
        密码组已删除的条目被过滤（分享 JSONB 残留引用不计入徽章）。
        """
        shares = load_active_shares(self.db)
        refs = active_share_key_refs(shares)
        filtered = {pid: keys for pid, keys in refs.items() if pid in project_ids}
        existing = load_existing_normal_key_ids(self.db, project_ids)
        filtered = {pid: keys & existing for pid, keys in filtered.items()}
        total = sum(
            1
            for share in shares
            if any(pid in project_ids and kid in existing for pid, kid in parse_share_items(share))
        )
        return filtered, total

    def _share_stats_for_keys(self, key_ids: set[uuid.UUID]) -> dict[uuid.UUID, tuple[int, datetime | None]]:
        """按密码组统计历史分享次数与最近分享时间（含已回收/已过期）.

        与 get_logs 同口径遍历全部分享反查 items JSONB（分享条目仅存 id，
        无冗余快照；房源维度数据量小，全表反查为项目既有可接受做法）。
        """
        stats: dict[uuid.UUID, tuple[int, datetime | None]] = {}
        if not key_ids:
            return stats
        for share in self.db.query(KeyShare).all():
            created_at = share.created_at
            for _, kid in parse_share_items(share):
                if kid in key_ids:
                    count, last = stats.get(kid, (0, None))
                    if last is None or (created_at is not None and created_at > last):
                        last = created_at
                    stats[kid] = (count + 1, last)
        return stats

    def _next_seq(self, project_id: uuid.UUID) -> int:
        """分配房源内下一个序号（当前最大值 +1；无行时从 1 开始）."""
        current = (
            self.db.query(func.max(ProjectNormalKey.seq)).filter(ProjectNormalKey.project_id == project_id).scalar()
        )
        return (current or 0) + 1

    def _manager_key(self, project_id: uuid.UUID) -> ProjectKey | None:
        return self.db.query(ProjectKey).filter(ProjectKey.project_id == project_id).first()

    def _normal_keys(self, project_id: uuid.UUID) -> list[ProjectNormalKey]:
        return (
            self.db.query(ProjectNormalKey)
            .filter(ProjectNormalKey.project_id == project_id)
            .order_by(ProjectNormalKey.seq.asc())
            .all()
        )

    def _manager_response(self, project_id: uuid.UUID) -> ManagerKeyResponse:
        row = self._manager_key(project_id)
        if row is None:
            return ManagerKeyResponse(set=False)
        # 操作人优先最近修改人，首次录入回退录入人
        operator_id = row.updated_by or row.created_by
        names = self._user_names({operator_id or ""})
        return ManagerKeyResponse(
            set=True,
            updated_at=row.updated_at,
            updated_by_name=names.get(operator_id or "") if operator_id else None,
        )

    def _normal_counts(self, keys: list[ProjectNormalKey]) -> NormalKeyCounts:
        counts = NormalKeyCounts()
        for k in keys:
            if k.status == KeyStatus.ACTIVE:
                counts.active += 1
            elif k.status == KeyStatus.PENDING_ENTRY:
                counts.pending += 1
            elif k.status == KeyStatus.DISABLED:
                counts.disabled += 1
        return counts

    # ==================== 概览 / 详情 ====================

    def get_summary(self, project_id: uuid.UUID, user: User) -> KeySummaryResponse:
        """右栏钥匙管理卡三行概要（不显密文）."""
        ensure_key_access(self.db, user, project_id)
        manager = self._manager_response(project_id)
        keys = self._normal_keys(project_id)
        counts = self._normal_counts(keys)
        _, active_share_count = self._active_share_refs({project_id})
        total_view_count = self.db.query(KeyShareView).filter(KeyShareView.project_id == project_id).count()
        # 最近更新组：keys 现按 seq 升序返回，最新按 created_at 取
        latest = max(keys, key=lambda k: k.created_at) if keys else None
        latest_name = None
        if latest is not None and latest.created_by:
            latest_name = self._user_names({latest.created_by}).get(latest.created_by)
        return KeySummaryResponse(
            manager_key=manager,
            normal_active_count=counts.active,
            normal_pending_count=counts.pending,
            normal_disabled_count=counts.disabled,
            normal_updated_at=latest.updated_at if latest else None,
            normal_updated_by_name=latest_name,
            active_share_count=active_share_count,
            total_view_count=total_view_count,
        )

    def get_detail(self, project_id: uuid.UUID, user: User) -> KeysDetailResponse:
        """房源钥匙详情（管理密码 + 普通密码列表 + 计数，不显密文）."""
        ensure_key_access(self.db, user, project_id)
        manager = self._manager_response(project_id)
        keys = self._normal_keys(project_id)
        refs, _ = self._active_share_refs({project_id})
        ref_keys = refs.get(project_id, set())
        share_stats = self._share_stats_for_keys({k.id for k in keys})
        creator_ids = {k.created_by or "" for k in keys}
        names = self._user_names(creator_ids)
        items = [
            NormalKeyItem(
                id=k.id,
                seq=k.seq,
                status=k.status.value,
                effective_date=k.effective_date,
                confirmed_at=k.confirmed_at,
                disabled_at=k.disabled_at,
                created_by_name=names.get(k.created_by or "") if k.created_by else None,
                created_at=k.created_at,
                updated_at=k.updated_at,
                share_active=k.id in ref_keys,
                share_count=share_stats.get(k.id, (0, None))[0],
                last_shared_at=share_stats.get(k.id, (0, None))[1],
            )
            for k in keys
        ]
        return KeysDetailResponse(
            manager_key=manager,
            normal_keys=items,
            counts=self._normal_counts(keys),
        )

    # ==================== 管理密码 ====================

    def put_manager_key(self, project_id: uuid.UUID, user: User, data: ManagerKeyPutRequest) -> ManagerKeyResponse:
        """管理密码录入/修改（一房一条，密文落库，留痕）."""
        ensure_key_access(self.db, user, project_id)
        row = self._manager_key(project_id)
        if row is None:
            row = ProjectKey(project_id=project_id, password_encrypted=data.password, created_by=str(user.id))
            self.db.add(row)
            action = "create"
        else:
            row.password_encrypted = data.password
            row.updated_by = str(user.id)
            action = "update"
        self.db.flush()
        log_key_action(
            self.db,
            project_id=project_id,
            action=action,
            actor_type=KeyActorType.USER,
            actor=user,
            detail={"object": "manager"},
        )
        self.db.commit()
        self.db.refresh(row)
        return self._manager_response(project_id)

    def reveal_manager_key(self, project_id: uuid.UUID, user: User) -> KeyRevealResponse:
        """查看管理密码明文（解密 + 留痕）."""
        ensure_key_access(self.db, user, project_id)
        row = self._manager_key(project_id)
        if row is None:
            msg = "管理密码未设置"
            raise ResourceNotFoundError(msg)
        log_key_action(
            self.db,
            project_id=project_id,
            action="view",
            actor_type=KeyActorType.USER,
            actor=user,
            detail={"object": "manager"},
        )
        self.db.commit()
        return KeyRevealResponse(password=row.password_encrypted)

    # ==================== 普通密码 ====================

    def create_normal_batch(
        self, project_id: uuid.UUID, user: User, data: NormalKeyBatchCreateRequest
    ) -> KeysDetailResponse:
        """路径一：手动批量录入（即录即生效，生效日期默认今日）."""
        ensure_key_access(self.db, user, project_id)
        passwords = [p.strip() for p in data.passwords]
        if any(not p for p in passwords):
            msg = "密码不能为空"
            raise ValidationError(msg)
        if len(set(passwords)) != len(passwords):
            msg = "密码组存在重复"
            raise ValidationError(msg)
        effective = data.effective_date or local_today()
        next_seq = self._next_seq(project_id)
        rows = [
            ProjectNormalKey(
                project_id=project_id,
                seq=next_seq + i,
                password_encrypted=p,
                status=KeyStatus.ACTIVE,
                effective_date=effective,
                confirmed_at=utc_now(),
                created_by=str(user.id),
            )
            for i, p in enumerate(passwords)
        ]
        self.db.add_all(rows)
        self.db.flush()
        log_key_action(
            self.db,
            project_id=project_id,
            action="create",
            actor_type=KeyActorType.USER,
            actor=user,
            detail={"count": len(rows), "key_ids": [str(r.id) for r in rows], "effective_date": str(effective)},
        )
        self.db.commit()
        return self.get_detail(project_id, user)

    def _create_generated_rows(self, project_id: uuid.UUID, user: User, count: int) -> list[ProjectNormalKey]:
        """生成 N 组待录入密码并落库（分配序号；返回内存暂存明文的行）."""
        next_seq = self._next_seq(project_id)
        rows = [
            ProjectNormalKey(
                project_id=project_id,
                seq=next_seq + i,
                password_encrypted=generate_six_digit(),
                status=KeyStatus.PENDING_ENTRY,
                created_by=str(user.id),
            )
            for i in range(count)
        ]
        self.db.add_all(rows)
        self.db.flush()
        return rows

    def _generate_response(
        self,
        project_id: uuid.UUID,
        user: User,
        action: str,
        rows: list[ProjectNormalKey],
        extra_detail: dict | None = None,
    ) -> NormalKeyGenerateResponse:
        """生成/换一批统一收尾：留痕（生成即揭示明文）→ 提交 → 组装响应."""
        log_key_action(
            self.db,
            project_id=project_id,
            action=action,
            actor_type=KeyActorType.USER,
            actor=user,
            detail={
                "count": len(rows),
                "key_ids": [str(r.id) for r in rows],
                "revealed": len(rows),  # 生成即返回明文（门锁录入场景），揭示留痕
                **(extra_detail or {}),
            },
        )
        self.db.commit()
        # 明文在内存暂存后组装响应（落库为密文，get_detail 不回明文）
        generated = {
            row.id: GeneratedNormalKeyItem(
                id=row.id,
                seq=row.seq,
                status=row.status.value,
                effective_date=row.effective_date,
                confirmed_at=row.confirmed_at,
                disabled_at=row.disabled_at,
                created_at=row.created_at,
                updated_at=row.updated_at,
                password=row.password_encrypted,  # flush 后 ORM 层透明解密回明文
            )
            for row in rows
        }
        detail = self.get_detail(project_id, user)
        return NormalKeyGenerateResponse(keys=list(generated.values()), detail=detail)

    def generate_normal(
        self, project_id: uuid.UUID, user: User, data: NormalKeyGenerateRequest
    ) -> NormalKeyGenerateResponse:
        """路径二：系统随机生成 6 位数字（生成即落库「待录入」并返回明文）."""
        ensure_key_access(self.db, user, project_id)
        rows = self._create_generated_rows(project_id, user, data.count)
        return self._generate_response(project_id, user, "generate", rows)

    def regenerate_normal(
        self, project_id: uuid.UUID, user: User, data: NormalKeyRegenerateRequest
    ) -> NormalKeyGenerateResponse:
        """换一批：整批替换未标记（待录入）组为新生成组（返回明文）."""
        ensure_key_access(self.db, user, project_id)
        pending = (
            self.db.query(ProjectNormalKey)
            .filter(ProjectNormalKey.project_id == project_id, ProjectNormalKey.status == KeyStatus.PENDING_ENTRY)
            .all()
        )
        if not pending:
            msg = "没有待录入的密码组可替换"
            raise ValidationError(msg)
        count = data.count if data.count is not None else len(pending)
        replaced_ids = [str(k.id) for k in pending]
        for row in pending:
            self.db.delete(row)
        rows = self._create_generated_rows(project_id, user, count)
        return self._generate_response(
            project_id,
            user,
            "regenerate",
            rows,
            extra_detail={"replaced": len(replaced_ids), "replaced_key_ids": replaced_ids},
        )

    def _confirm_rows(self, project_id: uuid.UUID, user: User, rows: list[ProjectNormalKey]) -> int:
        """标记已录入：pending → active（生效时间=标记日），返回确认数量."""
        today = local_today()
        confirmed: list[ProjectNormalKey] = []
        for row in rows:
            if row.status == KeyStatus.PENDING_ENTRY:
                row.status = KeyStatus.ACTIVE
                row.effective_date = today
                row.confirmed_at = utc_now()
                confirmed.append(row)
        if confirmed:
            log_key_action(
                self.db,
                project_id=project_id,
                action="confirm",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={"count": len(confirmed), "key_ids": [str(r.id) for r in confirmed]},
            )
        return len(confirmed)

    def confirm_normal(self, project_id: uuid.UUID, key_id: uuid.UUID, user: User) -> KeysDetailResponse:
        """单组标记已录入（C3 详情页行操作）."""
        ensure_key_access(self.db, user, project_id)
        row = self.db.get(ProjectNormalKey, key_id)
        if row is None or row.project_id != project_id:
            msg = "密码组不存在"
            raise ResourceNotFoundError(msg)
        if row.status != KeyStatus.PENDING_ENTRY:
            msg = "仅待录入状态可标记已录入"
            raise ValidationError(msg)
        self._confirm_rows(project_id, user, [row])
        self.db.commit()
        return self.get_detail(project_id, user)

    def batch_confirm_normal(
        self, project_id: uuid.UUID, user: User, data: NormalKeyBatchConfirmRequest
    ) -> KeysDetailResponse:
        """批量标记已录入（C5 批量录入页底部动作）."""
        ensure_key_access(self.db, user, project_id)
        rows = (
            self.db.query(ProjectNormalKey)
            .filter(ProjectNormalKey.id.in_(data.ids), ProjectNormalKey.project_id == project_id)
            .all()
        )
        if not rows:
            msg = "密码组不存在"
            raise ResourceNotFoundError(msg)
        confirmed_count = self._confirm_rows(project_id, user, rows)
        if confirmed_count == 0:
            msg = "所选密码组均不是待录入状态"
            raise ValidationError(msg)
        self.db.commit()
        return self.get_detail(project_id, user)

    def update_normal(
        self, project_id: uuid.UUID, key_id: uuid.UUID, user: User, data: NormalKeyUpdateRequest
    ) -> KeysDetailResponse:
        """普通密码修改/停用（已停用组不可再操作，仅查看）."""
        ensure_key_access(self.db, user, project_id)
        row = self.db.get(ProjectNormalKey, key_id)
        if row is None or row.project_id != project_id:
            msg = "密码组不存在"
            raise ResourceNotFoundError(msg)
        if row.status == KeyStatus.DISABLED:
            msg = "已停用的密码组不可修改"
            raise ValidationError(msg)
        if data.password is None and data.status is None:
            msg = "请提供修改内容"
            raise ValidationError(msg)
        if data.password is not None:
            row.password_encrypted = data.password
            log_key_action(
                self.db,
                project_id=project_id,
                action="update",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={"key_id": str(row.id)},
            )
        if data.status == "disabled":
            row.status = KeyStatus.DISABLED
            row.disabled_at = utc_now()
            log_key_action(
                self.db,
                project_id=project_id,
                action="disable",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={"key_id": str(row.id)},
            )
        self.db.commit()
        return self.get_detail(project_id, user)

    def reveal_normal(self, project_id: uuid.UUID, key_id: uuid.UUID, user: User) -> KeyRevealResponse:
        """查看普通密码明文（解密 + 留痕）."""
        ensure_key_access(self.db, user, project_id)
        row = self.db.get(ProjectNormalKey, key_id)
        if row is None or row.project_id != project_id:
            msg = "密码组不存在"
            raise ResourceNotFoundError(msg)
        log_key_action(
            self.db,
            project_id=project_id,
            action="view",
            actor_type=KeyActorType.USER,
            actor=user,
            detail={"object": "normal", "key_id": str(row.id)},
        )
        self.db.commit()
        return KeyRevealResponse(password=row.password_encrypted)

    def batch_delete_normal(
        self, project_id: uuid.UUID, user: User, ids: list[uuid.UUID]
    ) -> NormalKeyBatchDeleteResponse:
        """批量删除（物理删除，仅审计日志可追溯；返回分享引用提示数据）.

        二次确认由前端完成；被进行中分享引用的组删除后，
        分享页该组返回「密码已失效」语义，分享状态不变。
        """
        ensure_key_access(self.db, user, project_id)
        rows = (
            self.db.query(ProjectNormalKey)
            .filter(ProjectNormalKey.id.in_(ids), ProjectNormalKey.project_id == project_id)
            .all()
        )
        if len(rows) != len(set(ids)):
            msg = "包含不存在或不属于该房源的密码组"
            raise ValidationError(msg)
        target_ids = {row.id for row in rows}
        referenced: list[ShareReferencedItem] = []
        for share in load_active_shares(self.db):
            share_keys = {kid for pid, kid in parse_share_items(share) if pid == project_id}
            if share_keys & target_ids:
                referenced.append(ShareReferencedItem(share_id=share.id, token=share.token))
        for row in rows:
            self.db.delete(row)
        log_key_action(
            self.db,
            project_id=project_id,
            action="delete",
            actor_type=KeyActorType.USER,
            actor=user,
            detail={
                "count": len(rows),
                "key_ids": [str(rid) for rid in target_ids],
                "share_referenced_count": len(referenced),
            },
        )
        self.db.commit()
        return NormalKeyBatchDeleteResponse(
            deleted_count=len(rows),
            deleted_ids=sorted(target_ids, key=str),
            share_referenced=referenced,
        )

    # ==================== 审计日志 ====================

    def get_logs(self, project_id: uuid.UUID, user: User) -> KeyLogListResponse:
        """房源全量审计日志（含涉及该房源的分享级事件，倒序）."""
        ensure_key_access(self.db, user, project_id)
        # 涉及该房源的分享 ID（条目 JSONB 反查），用于把分享级日志并入房源时间线
        share_ids: set[uuid.UUID] = set()
        for share in self.db.query(KeyShare).all():
            for pid, _ in parse_share_items(share):
                if pid == project_id:
                    share_ids.add(share.id)
                    break
        condition = KeyAuditLog.project_id == project_id
        if share_ids:
            condition = or_(
                condition,
                and_(
                    KeyAuditLog.project_id.is_(None),
                    KeyAuditLog.detail["share_id"].astext.in_([str(sid) for sid in share_ids]),
                ),
            )
        logs = self.db.query(KeyAuditLog).filter(condition).order_by(KeyAuditLog.created_at.desc()).limit(500).all()
        return KeyLogListResponse(
            items=[
                KeyLogItem(
                    id=log.id,
                    created_at=log.created_at,
                    action=log.action,
                    actor_type=log.actor_type.value,
                    actor_id=log.actor_id,
                    actor_name=log.actor_name,
                    detail=log.detail,
                )
                for log in logs
            ]
        )
