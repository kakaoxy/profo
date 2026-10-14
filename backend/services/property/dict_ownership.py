"""字典关联字段归属校验（M1 修复，三链路共用）.

主表单创建/更新（projects/leads/marketing）携带 ``building_id``（或 room_id）
落库时，校验楼栋/户室与单据的 ``community_id`` 同属一个小区：
dictionary-link 端点已有该校验，但主表单链路此前缺失，
小区切换后旧楼栋 ID 会静默落库形成脏关联。
"""

from sqlalchemy.orm import Session

from models import BdBuilding, BdRoom
from services.system.exceptions import ValidationError


def validate_dict_ownership(
    db: Session,
    *,
    community_id: str | None,
    building_id: int | None,
    room_id: int | None,
) -> None:
    """校验字典楼栋/户室归属单据小区（不一致时 400）.

    Args:
        db: 数据库会话
        community_id: 单据关联小区 ID（可空：小区未选时楼栋也不应选择，
            但此处不强约束，仅在有楼栋/户室时才需小区可比对）
        building_id: 字典楼栋 ID
        room_id: 字典户室 ID

    Raises:
        ValidationError: 楼栋不存在 / 楼栋不属于该小区 / 户室不存在 /
            户室所属楼栋不存在 / 户室不属于该小区 / 户室与楼栋不匹配

    """
    if building_id is None and room_id is None:
        return

    building: BdBuilding | None = None
    if building_id is not None:
        building = db.get(BdBuilding, building_id)
        if not building:
            msg = "字典楼栋不存在"
            raise ValidationError(msg)
        if community_id and building.community_id != community_id:
            msg = "字典楼栋不属于所选小区，请重新选择"
            raise ValidationError(msg)

    if room_id is not None:
        room = db.get(BdRoom, room_id)
        if not room:
            msg = "字典户室不存在"
            raise ValidationError(msg)
        if building is None:
            # 单据只传 room_id：通过户室反查楼栋，再校验楼栋归属单据小区
            building = db.get(BdBuilding, room.building_id)
            if not building:
                msg = "户室所属楼栋不存在"
                raise ValidationError(msg)
            if community_id and building.community_id != community_id:
                msg = "字典户室不属于所选小区，请重新选择"
                raise ValidationError(msg)
        elif room.building_id != building.id:
            msg = "字典户室与所选楼栋不匹配"
            raise ValidationError(msg)
