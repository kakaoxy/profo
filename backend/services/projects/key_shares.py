"""钥匙分享 Service（小程序员工端）.

员工端：我可操作的房源聚合、生成分享、分享记录、回收、延长有效期。
经纪人端（免登录/访客态）见 key_share_public.py（拆分以满足 ≤500 行约束）。
过期为派生状态（active && expires_at < now）；回收为硬失效。
"""

import secrets
import uuid
from datetime import timedelta

from sqlalchemy.orm import Session

from models import (
    KeyActorType,
    KeyAuditLog,
    KeyShare,
    KeyShareStatus,
    KeyShareView,
    KeyStatus,
    Project,
    ProjectKey,
    ProjectNormalKey,
    User,
)
from schemas.keys import (
    KeyShareActionResponse,
    KeyShareCreatedResponse,
    KeyShareCreateRequest,
    KeyShareDetailItem,
    KeyShareDetailResponse,
    KeyShareExtendRequest,
    KeyShareListItem,
    KeyShareListResponse,
    KeyShareTimelineItem,
    KeysPropertiesResponse,
    KeysPropertyItem,
)
from services.projects.key_access import (
    active_share_key_refs,
    ensure_key_access,
    is_admin_user,
    is_share_expired,
    list_accessible_projects,
    load_active_shares,
    load_existing_normal_key_ids,
    log_key_action,
    parse_share_items,
    user_names_map,
    utc_now,
)
from services.system.exceptions import PermissionDeniedError, ResourceNotFoundError, ValidationError


class KeyShareService:
    """钥匙分享：员工端发起与管理（经纪人端见 key_share_public.py）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ==================== 内部助手 ====================

    def _get_share(self, share_id: uuid.UUID) -> KeyShare:
        share = self.db.get(KeyShare, share_id)
        if share is None:
            msg = "分享不存在"
            raise ResourceNotFoundError(msg)
        return share

    def _share_views(self, share_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[KeyShareView]]:
        if not share_ids:
            return {}
        rows = self.db.query(KeyShareView).filter(KeyShareView.share_id.in_(share_ids)).all()
        grouped: dict[uuid.UUID, list[KeyShareView]] = {}
        for row in rows:
            grouped.setdefault(row.share_id, []).append(row)
        return grouped

    def _ensure_share_owner(self, share: KeyShare, user: User) -> None:
        """分享记录仅分享人与 admin 可管理."""
        if not is_admin_user(user) and share.sharer_id != str(user.id):
            msg = "仅分享人可管理该分享"
            raise PermissionDeniedError(msg)

    # ==================== 员工端：房源聚合 ====================

    def list_my_properties(self, user: User) -> KeysPropertiesResponse:
        """我可操作的房源 + 钥匙徽章聚合（不显密文）."""
        projects = list_accessible_projects(self.db, user)
        project_ids = {p.id for p in projects}
        if not project_ids:
            return KeysPropertiesResponse(items=[])

        manager_rows = self.db.query(ProjectKey).filter(ProjectKey.project_id.in_(project_ids)).all()
        manager_set = {row.project_id for row in manager_rows}
        normal_rows = self.db.query(ProjectNormalKey).filter(ProjectNormalKey.project_id.in_(project_ids)).all()

        _, share_count = self._share_refs_and_counts(project_ids)
        view_rows = self.db.query(KeyShareView).filter(KeyShareView.project_id.in_(project_ids)).all()
        view_count: dict[uuid.UUID, int] = {}
        for row in view_rows:
            view_count[row.project_id] = view_count.get(row.project_id, 0) + 1

        normal_stats: dict[uuid.UUID, dict[str, int]] = {}
        for row in normal_rows:
            stats = normal_stats.setdefault(row.project_id, {"active": 0, "pending": 0, "disabled": 0})
            if row.status == KeyStatus.ACTIVE:
                stats["active"] += 1
            elif row.status == KeyStatus.PENDING_ENTRY:
                stats["pending"] += 1
            elif row.status == KeyStatus.DISABLED:
                stats["disabled"] += 1

        items = [
            KeysPropertyItem(
                project_id=p.id,
                name=p.name,
                community_name=p.community_name,
                address=p.address,
                status=p.status.value if p.status else None,
                area=p.area,
                manager_key_set=p.id in manager_set,
                normal_active_count=normal_stats.get(p.id, {}).get("active", 0),
                normal_pending_count=normal_stats.get(p.id, {}).get("pending", 0),
                normal_disabled_count=normal_stats.get(p.id, {}).get("disabled", 0),
                active_share_count=share_count.get(p.id, 0),
                total_view_count=view_count.get(p.id, 0),
            )
            for p in projects
        ]
        return KeysPropertiesResponse(items=items)

    def _share_refs_and_counts(
        self, project_ids: set[uuid.UUID]
    ) -> tuple[dict[uuid.UUID, set[uuid.UUID]], dict[uuid.UUID, int]]:
        """进行中分享引用映射与每房源分享计数（过滤密码组已删除的条目）."""
        shares = load_active_shares(self.db)
        refs = active_share_key_refs(shares)
        filtered = {pid: keys for pid, keys in refs.items() if pid in project_ids}
        existing = load_existing_normal_key_ids(self.db, project_ids)
        filtered = {pid: keys & existing for pid, keys in filtered.items()}
        counts: dict[uuid.UUID, int] = {}
        for share in shares:
            # 该分享对某房源存在 ≥1 条密码组仍存在的条目才计入「分享中」
            touched = {pid for pid, kid in parse_share_items(share) if pid in project_ids and kid in existing}
            for pid in touched:
                counts[pid] = counts.get(pid, 0) + 1
        return filtered, counts

    # ==================== 员工端：分享 CRUD ====================

    def create_share(self, user: User, data: KeyShareCreateRequest) -> KeyShareCreatedResponse:
        """生成分享：校验每组均属该房源且状态=有效；token 唯一；默认 1 天."""
        if not data.items:
            msg = "分享条目不能为空"
            raise ValidationError(msg)
        seen_projects: set[uuid.UUID] = set()
        entries: list[dict[str, str]] = []
        for item in data.items:
            if item.project_id in seen_projects:
                msg = "同一房源不能重复分享"
                raise ValidationError(msg)
            seen_projects.add(item.project_id)
            ensure_key_access(self.db, user, item.project_id)
            key = self.db.get(ProjectNormalKey, item.key_id)
            if key is None or key.project_id != item.project_id:
                msg = "密码组不存在或不属于该房源"
                raise ValidationError(msg)
            if key.status != KeyStatus.ACTIVE:
                msg = "仅「有效」状态的密码组可分享"
                raise ValidationError(msg)
            entries.append({"project_id": str(item.project_id), "key_id": str(item.key_id)})

        now = utc_now()
        if data.expires_at is not None:
            if data.expires_at <= now:
                msg = "失效时间必须晚于当前时间"
                raise ValidationError(msg)
            expires_at = data.expires_at
        else:
            expires_at = now + timedelta(days=data.expires_in_days or 1)

        # token 唯一（碰撞重试，secrets.token_urlsafe 熵足够，仅防御性兜底）
        token = secrets.token_urlsafe(32)
        for _ in range(3):
            exists = self.db.query(KeyShare.id).filter(KeyShare.token == token).first()
            if exists is None:
                break
            token = secrets.token_urlsafe(32)

        share = KeyShare(token=token, sharer_id=str(user.id), items=entries, expires_at=expires_at)
        self.db.add(share)
        self.db.flush()
        # 每个涉及房源写一条分享日志（后台房源日志/分享时间线均可追溯）
        for entry_project in seen_projects:
            log_key_action(
                self.db,
                project_id=entry_project,
                action="share_create",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={"share_id": str(share.id), "token": token, "expires_at": expires_at.isoformat()},
            )
        self.db.commit()
        return KeyShareCreatedResponse(id=share.id, token=share.token, expires_at=share.expires_at)

    def list_shares(self, user: User, status: str | None) -> KeyShareListResponse:
        """分享记录列表（分享人视角；状态过滤：进行中/已过期/已回收）."""
        query = self.db.query(KeyShare).filter(KeyShare.sharer_id == str(user.id))
        if status == "revoked":
            query = query.filter(KeyShare.status == KeyShareStatus.REVOKED)
        elif status in ("active", "expired"):
            # 过期为派生态：先取未回收，再在 Python 侧按 expires_at 细分
            query = query.filter(KeyShare.status == KeyShareStatus.ACTIVE)
        shares = query.order_by(KeyShare.created_at.desc()).all()
        views = self._share_views([s.id for s in shares])

        items: list[KeyShareListItem] = []
        for share in shares:
            expired = is_share_expired(share)
            if status == "active" and expired:
                continue
            if status == "expired" and not expired:
                continue
            entries = parse_share_items(share)
            share_views = views.get(share.id, [])
            viewed_key_ids = {v.key_id for v in share_views}
            viewer_names: list[str] = []
            for v in share_views:
                if v.viewer_name and v.viewer_name not in viewer_names:
                    viewer_names.append(v.viewer_name)
            items.append(
                KeyShareListItem(
                    id=share.id,
                    token=share.token,
                    status=share.status.value,
                    is_expired=expired,
                    items_count=len(entries),
                    viewed_count=len({kid for kid in viewed_key_ids if kid in {k for _, k in entries}}),
                    viewer_names=viewer_names,
                    expires_at=share.expires_at,
                    created_at=share.created_at,
                    revoked_at=share.revoked_at,
                )
            )
        return KeyShareListResponse(items=items)

    def get_share_detail(self, user: User, share_id: uuid.UUID) -> KeyShareDetailResponse:
        """分享详情：逐房源查看进度 + 查看记录时间线."""
        share = self._get_share(share_id)
        self._ensure_share_owner(share, user)
        entries = parse_share_items(share)

        project_ids = {pid for pid, _ in entries}
        key_ids = {kid for _, kid in entries}
        projects = {p.id: p for p in self.db.query(Project).filter(Project.id.in_(project_ids)).all()}
        keys = {k.id: k for k in self.db.query(ProjectNormalKey).filter(ProjectNormalKey.id.in_(key_ids)).all()}
        share_views = self._share_views([share.id]).get(share.id, [])

        items: list[KeyShareDetailItem] = []
        for pid, kid in entries:
            project = projects.get(pid)
            key_views = [v for v in share_views if v.key_id == kid]
            viewer_names: list[str] = []
            for v in key_views:
                if v.viewer_name and v.viewer_name not in viewer_names:
                    viewer_names.append(v.viewer_name)
            last_viewed = max((v.viewed_at for v in key_views), default=None)
            items.append(
                KeyShareDetailItem(
                    project_id=pid,
                    project_name=project.name if project else "",
                    address=project.address if project else "",
                    key_id=kid,
                    key_deleted=kid not in keys,
                    viewed=bool(key_views),
                    last_viewed_at=last_viewed,
                    viewer_names=viewer_names,
                )
            )

        # 时间线：share_create/open_share/agent_view/share_revoke/share_extend/share_expire
        logs = (
            self.db.query(KeyAuditLog)
            .filter(KeyAuditLog.detail["share_id"].astext == str(share.id))
            .order_by(KeyAuditLog.created_at.desc())
            .limit(200)
            .all()
        )
        timeline = [
            KeyShareTimelineItem(
                time=log.created_at,
                action=log.action,
                actor_type=log.actor_type.value,
                actor_name=log.actor_name,
                project_name=projects[log.project_id].name if log.project_id in projects else None,
                detail=log.detail,
            )
            for log in logs
        ]

        sharer_names = user_names_map(self.db, {share.sharer_id})
        return KeyShareDetailResponse(
            id=share.id,
            token=share.token,
            status=share.status.value,
            is_expired=is_share_expired(share),
            expires_at=share.expires_at,
            created_at=share.created_at,
            revoked_at=share.revoked_at,
            sharer_name=sharer_names.get(share.sharer_id, ""),
            items=items,
            timeline=timeline,
        )

    def revoke_share(self, user: User, share_id: uuid.UUID) -> KeyShareActionResponse:
        """手动回收=硬失效（经纪人页立即阻断），已产生的查看记录保留."""
        share = self._get_share(share_id)
        self._ensure_share_owner(share, user)
        if share.status == KeyShareStatus.REVOKED:
            msg = "分享已回收"
            raise ValidationError(msg)
        share.status = KeyShareStatus.REVOKED
        share.revoked_at = utc_now()
        share_projects = {pid for pid, _ in parse_share_items(share)}
        for project in self.db.query(Project).filter(Project.id.in_(share_projects)).all():
            log_key_action(
                self.db,
                project_id=project.id,
                action="share_revoke",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={
                    "share_id": str(share.id),
                    "token": share.token,
                    "revoked_at": share.revoked_at.isoformat(),
                },
            )
        self.db.commit()
        return KeyShareActionResponse(
            id=share.id, status=share.status.value, expires_at=share.expires_at, revoked_at=share.revoked_at
        )

    def extend_share(self, user: User, share_id: uuid.UUID, data: KeyShareExtendRequest) -> KeyShareActionResponse:
        """延长有效期：以 max(now, 当前失效时间) 为基准顺延."""
        share = self._get_share(share_id)
        self._ensure_share_owner(share, user)
        if share.status == KeyShareStatus.REVOKED:
            msg = "分享已回收，不可延长"
            raise ValidationError(msg)
        now = utc_now()
        if data.expires_at is not None:
            if data.expires_at <= now:
                msg = "新失效时间必须晚于当前时间"
                raise ValidationError(msg)
            new_expires = data.expires_at
        elif data.expires_in_days is not None:
            base = max(now, share.expires_at)
            new_expires = base + timedelta(days=data.expires_in_days)
        else:
            msg = "请提供延长天数或新失效时间"
            raise ValidationError(msg)
        old_expires = share.expires_at
        share.expires_at = new_expires
        for pid, _ in parse_share_items(share):
            log_key_action(
                self.db,
                project_id=pid,
                action="share_extend",
                actor_type=KeyActorType.USER,
                actor=user,
                detail={
                    "share_id": str(share.id),
                    "old_expires_at": old_expires.isoformat(),
                    "new_expires_at": new_expires.isoformat(),
                },
            )
        self.db.commit()
        return KeyShareActionResponse(
            id=share.id, status=share.status.value, expires_at=share.expires_at, revoked_at=share.revoked_at
        )
