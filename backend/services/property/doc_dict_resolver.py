"""单据字典地址名称批量解析数据类（surface-dict-binding-info）.

供项目/线索/营销三模块列表与详情响应组装复用：按单据的
(community_id, building_id, room_id, dict_status) 批量解析出
``building_no / room_no / floor`` 名称；``dict_status=pending`` 且
楼栋/户室 ID 为空时回退审核池待审名称（「未审核」语义）。
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DocDictKey:
    """单据字典关联键（一条业务单据一条）.

    Attributes:
        doc_id: 单据 ID 字符串（项目 UUID / 线索 UUID / 营销项目 int），用于关联结果
        community_id: 单据小区 ID（可为空=未绑定）
        building_id: 字典楼栋 ID（可为空）
        room_id: 字典户室 ID（可为空）
        dict_status: 字典关联状态（linked/pending/manual/rejected 或 None）
        source_type: 审核池来源类型（project/lead/marketing），pending 名称解析用

    """

    doc_id: str
    community_id: str | None = None
    building_id: int | None = None
    room_id: int | None = None
    dict_status: str | None = None
    source_type: str | None = None


@dataclass(frozen=True, slots=True)
class DocDictNames:
    """单条单据的解析结果（字段可空 = 未绑定或无字典行）."""

    building_no: str | None = None
    room_no: str | None = None
    floor: int | None = None
