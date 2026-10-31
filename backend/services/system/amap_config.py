"""高德地图 Key 配置服务.

存储：system_configs KV 表单键 ``amap_js_key``（value = Key 明文）。
读取路径永远可用：缺行/空值 = 未配置（地图降级为列表）。
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import SystemConfig, User
from schemas.amap_config import AmapConfigResponse

AMAP_CONFIG_KEY = "amap_js_key"


def _user_display_name(db: Session, user_id: str | None) -> str | None:
    """修改人显示名（nickname 回退 username；用户不存在为 None）."""
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    return (user.nickname or user.username) if user else None


def resolve_amap_js_key(db: Session) -> str:
    """解析当前生效的高德 Key（空串 = 未配置）."""
    value = db.query(SystemConfig.value).filter(SystemConfig.key == AMAP_CONFIG_KEY).scalar()
    return (value or "").strip()


def get_amap_config(db: Session) -> AmapConfigResponse:
    """读取高德地图配置与审计元信息."""
    row = db.query(SystemConfig).filter(SystemConfig.key == AMAP_CONFIG_KEY).first()
    js_key = (row.value or "").strip() if row is not None else ""
    return AmapConfigResponse(
        js_key=js_key,
        configured=bool(js_key),
        updated_at=row.updated_at if row is not None else None,
        updated_by_name=_user_display_name(db, row.updated_by_id) if row is not None else None,
    )


def save_amap_config(
    db: Session,
    *,
    js_key: str,
    operator_id: str,
) -> AmapConfigResponse:
    """保存高德 Key（strip 后落库；空串保留行但 configured=False）."""
    value = js_key.strip()
    row = db.query(SystemConfig).filter(SystemConfig.key == AMAP_CONFIG_KEY).with_for_update().first()
    if row is None:
        db.add(SystemConfig(key=AMAP_CONFIG_KEY, value=value, updated_by_id=operator_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
        row = db.query(SystemConfig).filter(SystemConfig.key == AMAP_CONFIG_KEY).with_for_update().first()
    if row is None:
        msg = "高德地图配置写入失败"
        raise RuntimeError(msg)
    row.value = value
    row.updated_by_id = operator_id
    db.commit()
    db.refresh(row)
    return get_amap_config(db)


__all__ = ["AMAP_CONFIG_KEY", "get_amap_config", "resolve_amap_js_key", "save_amap_config"]
