"""
线索模块工具函数
"""
from models.lead import Lead


def serialize_lead_for_list(lead: Lead) -> dict:
    """
    手动序列化 Lead 对象用于列表展示
    避免 Pydantic 的 from_attributes 自动遍历关系导致的性能问题
    """
    # 过滤错误存储的大型数据（如 base64 图片），只保留正常的 URL（通常 < 500 字符）
    safe_images = []
    if lead.images:
        for img in lead.images:
            if isinstance(img, str) and len(img) < 500:
                safe_images.append(img)

    return {
        "id": lead.id,
        "community_name": lead.community_name,
        "is_hot": lead.is_hot or 0,
        "layout": lead.layout,
        "orientation": lead.orientation,
        "floor_info": lead.floor_info,
        "area": float(lead.area) if lead.area else None,
        "total_price": float(lead.total_price) if lead.total_price else None,
        "unit_price": float(lead.unit_price) if lead.unit_price else None,
        "eval_price": float(lead.eval_price) if lead.eval_price else None,
        "status": lead.status,
        "audit_reason": lead.audit_reason,
        "auditor_id": lead.auditor_id,
        "audit_time": lead.audit_time,
        "images": safe_images,
        "district": lead.district,
        "business_area": lead.business_area,
        "remarks": lead.remarks,
        "creator_id": lead.creator_id,
        # 只提取 nickname，避免序列化整个 User 对象
        "creator_name": lead.creator.nickname if lead.creator else None,
        "source_property_id": lead.source_property_id,
        "last_follow_up_at": lead.last_follow_up_at,
        "created_at": lead.created_at,
        "updated_at": lead.updated_at,
    }
