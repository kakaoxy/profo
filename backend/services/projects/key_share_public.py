"""经纪人端钥匙分享 Service（免登录/访客态）.

从 key_shares.py 拆分（单文件 ≤500 行约束）：免登录取分享（掩码）、
登录后查看明文（即时写 KeyShareView + 审计日志）、惰性过期/首访日志。
"""

import uuid

from sqlalchemy.orm import Session

from models import (
    KeyActorType,
    KeyAuditLog,
    KeyShare,
    KeyShareStatus,
    KeyShareView,
    KeyStatus,
    Project,
    ProjectNormalKey,
    User,
)
from schemas.keys import PublicKeyShareItem, PublicKeyShareResponse, PublicKeyShareRevealResponse
from services.projects.key_access import (
    is_share_expired,
    log_key_action,
    parse_share_items,
    user_display_name,
    user_names_map,
    utc_now,
)
from services.system.exceptions import BusinessLogicError, ResourceNotFoundError, ValidationError


class KeySharePublicService:
    """经纪人端（访客态）钥匙分享查看."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_public_share(self, token: str, viewer: User | None) -> PublicKeyShareResponse:
        """免登录获取分享信息（掩码，不含任何明文/密文）.

        回收 → 专用响应态（D2，无密码数据）；过期 → 仅返回掩码条目与 is_expired
        （前端不再提供查看入口，明文取回由 reveal_public_key 阻断）；
        首次读取到已过期时惰性写 system 过期日志；已登录则记「打开分享页」首访。
        """
        share = self.db.query(KeyShare).filter(KeyShare.token == token).first()
        if share is None:
            msg = "分享不存在或已失效"
            raise ResourceNotFoundError(msg)
        sharer_name = user_names_map(self.db, {share.sharer_id}).get(share.sharer_id, "")

        if share.status == KeyShareStatus.REVOKED:
            return PublicKeyShareResponse(
                status="revoked",
                is_expired=False,
                revoked_at=share.revoked_at,
                sharer_name=sharer_name,
                items_count=0,
                viewed_by_me_count=0,
                items=[],
            )

        expired = is_share_expired(share)
        if expired:
            self._lazily_log_expire(share)

        entries = parse_share_items(share)
        project_ids = {pid for pid, _ in entries}
        key_ids = {kid for _, kid in entries}
        projects = {p.id: p for p in self.db.query(Project).filter(Project.id.in_(project_ids)).all()}
        keys = {k.id: k for k in self.db.query(ProjectNormalKey).filter(ProjectNormalKey.id.in_(key_ids)).all()}
        # 经纪人可取回明文的密码组：仅「有效」状态（已删除无行 / 已停用 → 统一呈现「密码已失效」）
        valid_key_ids = {kid for kid in key_ids if kid in keys and keys[kid].status == KeyStatus.ACTIVE}

        my_views: dict[uuid.UUID, KeyShareView] = {}
        if viewer is not None:
            rows = (
                self.db.query(KeyShareView)
                .filter(
                    KeyShareView.share_id == share.id,
                    KeyShareView.viewer_user_id == str(viewer.id),
                )
                .all()
            )
            my_views = {row.key_id: row for row in rows}
            self._lazily_log_open(share, viewer)

        items = [
            PublicKeyShareItem(
                project_id=pid,
                project_name=projects[pid].name if pid in projects else "",
                address=projects[pid].address if pid in projects else "",
                key_id=kid,
                key_deleted=kid not in valid_key_ids,
                key_note=projects[pid].key_note if pid in projects else None,
                viewed=kid in my_views,
                last_viewed_at=my_views[kid].viewed_at if kid in my_views else None,
            )
            for pid, kid in entries
        ]
        return PublicKeyShareResponse(
            status="active",
            is_expired=expired,
            expires_at=share.expires_at,
            revoked_at=None,
            sharer_name=sharer_name,
            items_count=len(items),
            viewed_by_me_count=sum(1 for item in items if item.viewed),
            items=items,
        )

    def reveal_public_key(self, token: str, key_id: uuid.UUID, viewer: User) -> PublicKeyShareRevealResponse:
        """经纪人查看明文：需 C 端登录；写 KeyShareView + 审计日志后返回明文.

        分享已回收 / 已过期 → 拒绝；密码组已删除/已停用 → 「密码已失效」业务语义。
        即「回收 / 过期 / 删除 / 停用」四种失效态一律不可查看明文（过期后延长有效期可恢复）。
        """
        share = self.db.query(KeyShare).filter(KeyShare.token == token).first()
        if share is None:
            msg = "分享不存在或已失效"
            raise ResourceNotFoundError(msg)
        if share.status == KeyShareStatus.REVOKED:
            msg = "分享已回收，请联系分享人"
            raise BusinessLogicError(msg)
        if is_share_expired(share):
            msg = "分享已过期，密码不可查看，请联系分享人重新获取"
            raise BusinessLogicError(msg)

        # key_id 必须在分享条目中（防止借 token 探测任意密码组）
        entry_project = next((pid for pid, kid in parse_share_items(share) if kid == key_id), None)
        if entry_project is None:
            msg = "该密码不在此分享中"
            raise ValidationError(msg)
        key = self.db.get(ProjectNormalKey, key_id)
        # 失效口径：密码组已删除（无行）或已停用（≠active）——员工停用后经纪人不得再取回明文
        if key is None or key.project_id != entry_project or key.status != KeyStatus.ACTIVE:
            msg = "密码已失效，请联系分享人"
            raise BusinessLogicError(msg)

        project = self.db.get(Project, entry_project)
        now = utc_now()
        self.db.add(
            KeyShareView(
                share_id=share.id,
                project_id=entry_project,
                key_id=key_id,
                viewer_user_id=str(viewer.id),
                viewer_name=user_display_name(viewer),
                viewed_at=now,
            )
        )
        log_key_action(
            self.db,
            project_id=entry_project,
            action="agent_view",
            actor_type=KeyActorType.AGENT,
            actor_name=user_display_name(viewer),
            detail={
                "share_id": str(share.id),
                "token": share.token,
                "key_id": str(key_id),
                "viewer_id": str(viewer.id),
            },
        )
        self.db.commit()
        return PublicKeyShareRevealResponse(
            key_id=key_id,
            project_id=entry_project,
            project_name=project.name if project else "",
            password=key.password_encrypted,
        )

    # ==================== 惰性日志 ====================

    def _lazily_log_expire(self, share: KeyShare) -> None:
        """首次读取到已过期时写 system 过期日志（幂等：已有则跳过）."""
        exists = (
            self.db.query(KeyAuditLog.id)
            .filter(
                KeyAuditLog.action == "share_expire",
                KeyAuditLog.detail["share_id"].astext == str(share.id),
            )
            .first()
        )
        if exists is not None:
            return
        log_key_action(
            self.db,
            project_id=None,
            action="share_expire",
            actor_type=KeyActorType.SYSTEM,
            actor_name="system",
            detail={
                "share_id": str(share.id),
                "token": share.token,
                "expires_at": share.expires_at.isoformat(),
                "project_ids": [str(pid) for pid, _ in parse_share_items(share)],
            },
        )
        self.db.commit()

    def _lazily_log_open(self, share: KeyShare, viewer: User) -> None:
        """已登录经纪人首次打开分享页记「打开分享页」（幂等按 viewer）."""
        exists = (
            self.db.query(KeyAuditLog.id)
            .filter(
                KeyAuditLog.action == "open_share",
                KeyAuditLog.detail["share_id"].astext == str(share.id),
                KeyAuditLog.detail["viewer_id"].astext == str(viewer.id),
            )
            .first()
        )
        if exists is not None:
            return
        log_key_action(
            self.db,
            project_id=None,
            action="open_share",
            actor_type=KeyActorType.AGENT,
            actor_name=user_display_name(viewer),
            detail={
                "share_id": str(share.id),
                "token": share.token,
                "viewer_id": str(viewer.id),
                "viewer_name": user_display_name(viewer),
            },
        )
        self.db.commit()
