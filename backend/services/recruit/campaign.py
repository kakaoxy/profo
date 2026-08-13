"""招募活动配置与主营商圈查询服务."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.property import Community
from models.recruit import RecruitCampaign, RecruitCampaignStatus
from schemas.recruit import RecruitCampaignCreate, RecruitCampaignUpdate
from services.system.exceptions import ResourceNotFoundError, ValidationError


class RecruitCampaignService:
    """招募活动配置服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, campaign_id: str) -> RecruitCampaign | None:
        """按 ID 获取活动."""
        return self.db.query(RecruitCampaign).filter(RecruitCampaign.id == campaign_id).first()

    def get_or_404(self, campaign_id: str) -> RecruitCampaign:
        """按 ID 获取活动，不存在抛 ResourceNotFoundError."""
        campaign = self.get(campaign_id)
        if campaign is None:
            msg = "招募活动不存在"
            raise ResourceNotFoundError(msg)
        return campaign

    def get_enabled(self, campaign_id: str) -> RecruitCampaign:
        """获取启用中的活动；不存在抛 404，停用抛 ValidationError."""
        campaign = self.get_or_404(campaign_id)
        if campaign.status != RecruitCampaignStatus.ENABLED:
            msg = "招募活动已停用"
            raise ValidationError(msg)
        return campaign

    def list_all(self) -> list[RecruitCampaign]:
        """活动列表（按创建时间倒序）."""
        return self.db.query(RecruitCampaign).order_by(RecruitCampaign.created_at.desc()).all()

    def create(self, data: RecruitCampaignCreate) -> RecruitCampaign:
        """创建活动."""
        campaign = RecruitCampaign(
            **data.model_dump(exclude_unset=True),
        )
        self.db.add(campaign)
        self.db.commit()
        self.db.refresh(campaign)
        return campaign

    def update(self, campaign_id: str, data: RecruitCampaignUpdate) -> RecruitCampaign:
        """更新活动（仅更新显式提供的字段）."""
        campaign = self.get_or_404(campaign_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(campaign, field, value)
        self.db.commit()
        self.db.refresh(campaign)
        return campaign

    def list_business_areas(self) -> list[tuple[str, int]]:
        """聚合小区表 distinct business_circle（按出现频次降序，过滤空值）."""
        rows = (
            self.db.query(Community.business_circle, func.count(Community.id))
            .filter(Community.business_circle.isnot(None))
            .filter(Community.business_circle != "")
            .group_by(Community.business_circle)
            .order_by(func.count(Community.id).desc())
            .all()
        )
        return [(name, int(cnt)) for name, cnt in rows if name]
