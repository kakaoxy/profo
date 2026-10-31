"""门店经纪人邀请二维码（V04 REQ-M06-006）.

短码作为微信小程序码 scene（≤32 字符），服务端保存门店/邀请员工/有效期，
扫码解析时校验有效期与门店状态；短码不可猜测，等效于签名防篡改。
"""

import base64
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models.merchant import MerchantStore, MerchantStoreQRCode
from models.user.user import User
from schemas.merchant import BrokerQRCodeResolveResponse, BrokerQRCodeResponse
from services.merchant.scope import ensure_store_visible
from services.system.exceptions import ResourceNotFoundError, ValidationError
from services.system.wechat import WeChatAuthService

logger = logging.getLogger(__name__)

QR_PAGE = "pages/merchant/home/index"
QR_EXPIRE_DAYS = 7
_CODE_BYTES = 8  # token_urlsafe(8) ≈ 11 字符，满足 scene ≤32


class MerchantBrokerQRCodeService:
    """门店邀请二维码服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def generate(self, user: User, store_id: str) -> BrokerQRCodeResponse:
        """门店归属员工生成二维码（邀请经纪人扫码注册自动绑定）."""
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)
        if store.status != "normal":
            msg = "门店已停用/已合并/已搬迁，不能生成邀请二维码"
            raise ValidationError(msg)

        expires_at = datetime.now(timezone.utc) + timedelta(days=QR_EXPIRE_DAYS)
        token = self._create_token(store, str(user.id), expires_at)
        image = WeChatAuthService.fetch_miniapp_unlimited_qrcode(token.code, page=QR_PAGE)
        return BrokerQRCodeResponse(
            code=token.code,
            image_base64=base64.b64encode(image).decode("ascii"),
            expires_at=expires_at,
            page=QR_PAGE,
        )

    def resolve(self, code: str) -> BrokerQRCodeResolveResponse:
        """解析二维码短码（扫码注册前展示门店与邀请员工）."""
        token = self.db.query(MerchantStoreQRCode).filter(MerchantStoreQRCode.code == code).first()
        if token is None:
            return BrokerQRCodeResolveResponse(
                valid=False,
                store_id=None,
                store_name=None,
                inviter_employee_id=None,
                expires_at=None,
                reason="二维码无效",
            )
        if token.expires_at <= datetime.now(timezone.utc):
            return BrokerQRCodeResolveResponse(
                valid=False,
                store_id=str(token.store_id),
                store_name=None,
                inviter_employee_id=str(token.inviter_employee_id),
                expires_at=token.expires_at,
                reason="二维码已过期",
            )
        store = self.db.query(MerchantStore).filter(MerchantStore.id == token.store_id).first()
        if store is None or store.is_deleted or store.status != "normal":
            return BrokerQRCodeResolveResponse(
                valid=False,
                store_id=str(token.store_id),
                store_name=store.store_name if store is not None else None,
                inviter_employee_id=str(token.inviter_employee_id),
                expires_at=token.expires_at,
                reason="门店不可用",
            )
        return BrokerQRCodeResolveResponse(
            valid=True,
            store_id=str(store.id),
            store_name=store.store_name,
            inviter_employee_id=str(token.inviter_employee_id),
            expires_at=token.expires_at,
            reason=None,
        )

    def get_valid_token(self, code: str) -> MerchantStoreQRCode | None:
        """返回有效短码记录（注册自动绑定用）."""
        resolved = self.resolve(code)
        if not resolved.valid:
            return None
        return self.db.query(MerchantStoreQRCode).filter(MerchantStoreQRCode.code == code).first()

    def _create_token(
        self,
        store: MerchantStore,
        inviter_employee_id: str,
        expires_at: datetime,
    ) -> MerchantStoreQRCode:
        """生成唯一短码并落库（撞码重试）."""
        for _attempt in range(5):
            code = secrets.token_urlsafe(_CODE_BYTES)
            exists = self.db.query(MerchantStoreQRCode.id).filter(MerchantStoreQRCode.code == code).first()
            if exists:
                continue
            token = MerchantStoreQRCode(
                code=code,
                store_id=store.id,
                inviter_employee_id=inviter_employee_id,
                expires_at=expires_at,
            )
            self.db.add(token)
            self.db.commit()
            self.db.refresh(token)
            return token
        msg = "二维码生成失败，请重试"
        raise ValidationError(msg)


__all__ = ["QR_EXPIRE_DAYS", "QR_PAGE", "MerchantBrokerQRCodeService"]
