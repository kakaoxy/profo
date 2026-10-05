"""小程序订阅消息模板 ID 配置服务.

存储：system_configs KV 表单键 ``wechat_subscribe_templates``
（value = JSON 全量 ``{"recruit_lead": ..., "valuation_price": ..., "customer_lead": ...}``）。

生效语义（spec 关键决策）：**DB 值优先，DB 留空回退 env**（``settings.wechat_*_template_id``）；
均空 = 功能关闭。读写模式照抄 services/projects/todo_board_config.py
（单键 JSON 全量 upsert、缺行/损坏 JSON 容忍回退、updated_by_id 审计）。
"""

import json

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import SystemConfig, User
from schemas.subscribe_template import (
    SubscribeTemplatesResponse,
    SubscribeTemplatesUpdateRequest,
    SubscribeTemplateValue,
)
from settings import settings

# system_configs 配置键（value = JSON 全量）
SUBSCRIBE_TEMPLATES_CONFIG_KEY = "wechat_subscribe_templates"

# 支持的模板 key；settings env 字段名为 f"wechat_{key}_template_id"，
# 非合法 key 一律回退 env 空串（读取路径永远可用）
TEMPLATE_KEYS = (
    "recruit_lead",
    "valuation_price",
    "customer_lead",
    "project_new",
    "project_price_change",
)


def _env_value(key: str) -> str:
    """读取 env 兜底值（未知 key 回退空串，保持读取路径永远可用）."""
    return getattr(settings, f"wechat_{key}_template_id", "")


def _load_db_values(value: str | None) -> dict[str, str]:
    """system_configs value（JSON 字符串）→ {key: db_value}（缺行/损坏 JSON 视同未配置）."""
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except (TypeError, ValueError):
        # 损坏 JSON 视同无 DB 配置（回退 env，读取路径永远可用）
        return {}
    if not isinstance(raw, dict):
        return {}
    return {k: v for k in TEMPLATE_KEYS if isinstance((v := raw.get(k)), str)}


def _user_display_name(db: Session, user_id: str | None) -> str | None:
    """修改人显示名（nickname 回退 username；用户不存在为 None）."""
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    return (user.nickname or user.username) if user else None


def _build_value(db_value: str, env_value: str) -> SubscribeTemplateValue:
    """单个模板 key 的 DB/env 值 → 生效状态投影."""
    return SubscribeTemplateValue(
        db_value=db_value,
        env_value=env_value,
        effective_value=db_value or env_value,
        source="db" if db_value else ("env" if env_value else "none"),
    )


def _build_response(db: Session, row: SystemConfig | None) -> SubscribeTemplatesResponse:
    """system_configs 行 → 响应（逐 key 计算 DB/env 生效状态 + 审计元信息）."""
    db_values = _load_db_values(row.value if row is not None else None)
    return SubscribeTemplatesResponse(
        **{key: _build_value(db_values.get(key, ""), _env_value(key)) for key in TEMPLATE_KEYS},
        updated_at=row.updated_at if row is not None else None,
        updated_by_name=_user_display_name(db, row.updated_by_id) if row is not None else None,
    )


def resolve_template_id(db: Session, key: str) -> str:
    """解析指定模板 key 的当前生效模板 ID（核心解析函数，消费点统一入口）.

    优先 DB 配置值（非空即用），否则回退 env 兜底值；均空返回空串 = 功能关闭。
    缺行/损坏 JSON/未知 key 均安全回退 env（损坏 JSON 视同无 DB 值）。
    """
    row_value = db.query(SystemConfig.value).filter(SystemConfig.key == SUBSCRIBE_TEMPLATES_CONFIG_KEY).scalar()
    db_value = _load_db_values(row_value).get(key, "")
    return db_value or _env_value(key)


def get_subscribe_templates(db: Session) -> SubscribeTemplatesResponse:
    """GET /system/subscribe-templates：三个模板的配置值 + 生效状态 + 审计元信息."""
    row = db.query(SystemConfig).filter(SystemConfig.key == SUBSCRIBE_TEMPLATES_CONFIG_KEY).first()
    return _build_response(db, row)


def save_subscribe_templates(
    db: Session,
    req: SubscribeTemplatesUpdateRequest,
    operator_id: str,
) -> SubscribeTemplatesResponse:
    """PUT /system/subscribe-templates：strip 后全量 upsert（并发保存回退，不 500）."""
    payload = json.dumps(
        {key: getattr(req, key).strip() for key in TEMPLATE_KEYS},
        ensure_ascii=False,
    )

    row = db.query(SystemConfig).filter(SystemConfig.key == SUBSCRIBE_TEMPLATES_CONFIG_KEY).with_for_update().first()
    if row is None:
        # 首次创建路径无行可锁：依赖 flush 撞唯一索引 uq_system_configs_key 后的
        # IntegrityError 回退 + 加锁重查（与 services/projects/todo_board_config.py 同口径）
        db.add(SystemConfig(key=SUBSCRIBE_TEMPLATES_CONFIG_KEY, value=payload, updated_by_id=operator_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
        row = (
            db.query(SystemConfig).filter(SystemConfig.key == SUBSCRIBE_TEMPLATES_CONFIG_KEY).with_for_update().first()
        )
    if row is None:
        # 理论不可达：唯一索引冲突必然意味着并发事务已提交该行
        msg = "订阅消息模板配置写入失败"
        raise RuntimeError(msg)
    row.value = payload
    row.updated_by_id = operator_id
    db.commit()
    db.refresh(row)
    return _build_response(db, row)
