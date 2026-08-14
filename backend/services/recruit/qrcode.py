"""招募活动小程序码生成与短码解析服务."""

import base64
import logging
import secrets
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.recruit import RecruitCampaign, RecruitCampaignStatus
from models.recruit.recruit import RecruitQRScene
from services.system.exceptions import ResourceNotFoundError, ValidationError
from services.system.wechat import WeChatAuthService

logger = logging.getLogger(__name__)

_MAX_RETRY = 5
_CODE_LENGTH = 8
_QR_PAGE = "pages/recruit/detail/index"


class RecruitQRCodeService:
    """招募活动小程序码服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def generate(self, campaign_id: str, employee_id: str | None = None) -> dict[str, str]:
        """生成活动小程序码.

        同一（campaign_id, employee_id）组合复用已有短码。
        校验活动存在且启用，微信接口生成小程序码图片返回 base64。

        Args:
            campaign_id: 活动ID
            employee_id: 归属员工ID（可选）

        Returns:
            {code: 短码, image_base64: 图片 base64}

        Raises:
            ResourceNotFoundError: 活动不存在
            ValidationError: 活动已停用 或 微信接口失败

        """
        # 校验活动存在且启用
        campaign = self.db.query(RecruitCampaign).filter(RecruitCampaign.id == campaign_id).first()
        if campaign is None:
            msg = "招募活动不存在"
            raise ResourceNotFoundError(msg)
        if campaign.status != RecruitCampaignStatus.ENABLED:
            msg = "招募活动已停用，无法生成小程序码"
            raise ValidationError(msg)

        # 复用已有短码
        existing = (
            self.db.query(RecruitQRScene)
            .filter(
                RecruitQRScene.campaign_id == campaign_id,
                RecruitQRScene.employee_id == employee_id,
            )
            .first()
        )
        if existing is not None:
            code = existing.code
        else:
            # 预检查与插入非原子：并发同组合 / 随机撞码时靠唯一索引兜底，
            # 捕获 IntegrityError 后复用已有记录或换码重试，而非向用户抛冲突
            for _attempt in range(_MAX_RETRY):
                code = self._generate_unique_code()
                scene = RecruitQRScene(
                    id=str(uuid.uuid4()),
                    code=code,
                    campaign_id=campaign_id,
                    employee_id=employee_id,
                )
                self.db.add(scene)
                try:
                    self.db.commit()
                    self.db.refresh(scene)
                except IntegrityError:
                    self.db.rollback()
                    # 并发下同 (campaign_id, employee_id) 已被插入：复用已有短码
                    concurrent = (
                        self.db.query(RecruitQRScene)
                        .filter(
                            RecruitQRScene.campaign_id == campaign_id,
                            RecruitQRScene.employee_id == employee_id,
                        )
                        .first()
                    )
                    if concurrent is not None:
                        code = concurrent.code
                        break
                    # 否则为短码撞码（同 code 已被其它组合占用）：换码重试
                    continue
                except Exception:
                    self.db.rollback()
                    raise
                break
            else:
                msg = "短码冲突，请重试"
                raise ValidationError(msg)

        # 调微信接口生成小程序码
        scene_param = f"code={code}"
        image_bytes = WeChatAuthService.fetch_miniapp_unlimited_qrcode(scene_param, _QR_PAGE)
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        return {"code": code, "image_base64": image_base64}

    def resolve(self, code: str) -> dict[str, str | None]:
        """解析短码获取活动ID与来源员工ID.

        Args:
            code: 8位短码

        Returns:
            {campaign_id: str, referrer: str | None}

        Raises:
            ResourceNotFoundError: 短码不存在
            ValidationError: 活动已停用

        """
        scene = self.db.query(RecruitQRScene).filter(RecruitQRScene.code == code).first()
        if scene is None:
            msg = "短码无效"
            raise ResourceNotFoundError(msg)

        # 校验活动仍启用
        campaign = self.db.query(RecruitCampaign).filter(RecruitCampaign.id == scene.campaign_id).first()
        if campaign is None:
            msg = "活动不存在"
            raise ResourceNotFoundError(msg)
        if campaign.status != RecruitCampaignStatus.ENABLED:
            msg = "招募活动已停用"
            raise ValidationError(msg)

        return {"campaign_id": scene.campaign_id, "referrer": scene.employee_id}

    def _generate_unique_code(self) -> str:
        """生成 8 位安全随机码（冲突重试）."""
        for _attempt in range(_MAX_RETRY):
            code = secrets.token_hex(_CODE_LENGTH // 2)[:_CODE_LENGTH]
            exists = self.db.query(RecruitQRScene.id).filter(RecruitQRScene.code == code).first() is not None
            if not exists:
                return code
        msg = "短码冲突，请重试"
        raise ValidationError(msg)
