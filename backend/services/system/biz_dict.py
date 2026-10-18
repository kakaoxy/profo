"""业务字典服务（CRUD + 公开只读 + 宽松校验 + 文书模板读取）.

设计要点（spec ``techdebt-config-unify`` D1–D7）：
- 字典组白名单 ``SUPPORTED_DICTS``：未登记组一律 404，避免运营建出无人消费的死字典；
- **只增不删**（D6）：停用 ``enabled=False``，历史单据按存储值原样展示；
- 写路径全部经本 Service，变更写 ``operation_logs``（D7，action = ``dict.item.*``）；
- 公开端点进程内缓存 60s（spec §3.3），写入后本进程立即失效，其他 worker 最多 60s 生效；
- 宽松校验（D5）：``validate_channel`` 只做「是否纳管」判定，**永不拒绝请求**；
- 文书模板读取：字典优先 → ``constants/documents.py`` 常量回退（缺行/损坏时读取路径永远可用）。
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from constants.documents import DocumentTemplate, get_documents_for_business_form
from models.common.base import BusinessForm
from models.lead import ValuationVisit
from models.marketing import ProjectVisit, PropertySheetVisit
from models.system import BizDictItem
from schemas.biz_dict import (
    BizDictGroupResponse,
    BizDictItemCreate,
    BizDictItemResponse,
    BizDictItemUpdate,
    BizDictReorderRequest,
    BizDictUnmanagedResponse,
    BizDictUnmanagedValue,
    PublicDictItemResponse,
    PublicDictListResponse,
)
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from services.system.operation_log import OperationLogService

logger = logging.getLogger(__name__)

# 字典组元信息（dict_code → 中文名/用途说明）；同时作为白名单
SUPPORTED_DICTS: dict[str, tuple[str, str]] = {
    "lead_attr_channel": (
        "线索归因渠道",
        "访问埋点上报的进入渠道（大众投流/分享来源），字典外值照常落库并可在本页转正",
    ),
    "recruit_source": (
        "招募来源",
        "招募线索/访问的来源渠道（code 与小程序枚举值一致，改展示名不改落库值）",
    ),
    "document_template": (
        "文书模板",
        "新建项目时初始化的文书签收清单（按业务形式分组，历史项目不受影响）",
    ),
    "renovation_stage_alias": (
        "改造阶段别名",
        "改造阶段的展示名（仅影响前台展示，历史数据入库值不变）",
    ),
}

# 归因渠道原始值所在表（宽松校验的存量盘点与未纳管值查询共用）
_CHANNEL_SOURCE_COLUMNS = (ValuationVisit.source, PropertySheetVisit.source, ProjectVisit.source)

# 公开端点进程内缓存（dict_code → (过期时间 monotonic, 响应)）
_PUBLIC_CACHE: dict[str, tuple[float, PublicDictListResponse]] = {}
_PUBLIC_CACHE_TTL_SECONDS = 60.0

# 文档字典组编码（供文书模板读取复用）
DOCUMENT_TEMPLATE_DICT = "document_template"
LEAD_ATTR_CHANNEL_DICT = "lead_attr_channel"


@dataclass(frozen=True)
class ChannelValidation:
    """宽松校验结果（D5：永不拒绝，仅标记是否纳管）."""

    code: str | None
    unmanaged: bool


def _ensure_supported(dict_code: str) -> None:
    """校验字典组是否在支持清单中（未登记组 404）."""
    if dict_code not in SUPPORTED_DICTS:
        msg = f"不支持的字典组: {dict_code}"
        raise ResourceNotFoundError(msg)


def _to_response(item: BizDictItem) -> BizDictItemResponse:
    """ORM 行 → 响应（id 为 UUID 主键，契约层统一转字符串）."""
    return BizDictItemResponse(
        id=str(item.id),
        dict_code=item.dict_code,
        code=item.code,
        label=item.label,
        business_form=item.business_form,
        category=item.category,
        sort_order=item.sort_order,
        enabled=item.enabled,
        is_builtin=item.is_builtin,
        remark=item.remark,
        updated_at=item.updated_at,
    )


def _invalidate_public_cache(dict_code: str) -> None:
    """写入后失效本进程公开缓存（其他 worker 依赖 60s TTL 自然过期）."""
    _PUBLIC_CACHE.pop(dict_code, None)


def _load_items(db: Session, dict_code: str) -> list[BizDictItem]:
    """按 (sort_order, code) 取组内全部条目（含停用）."""
    return (
        db.query(BizDictItem)
        .filter(BizDictItem.dict_code == dict_code)
        .order_by(BizDictItem.sort_order.asc(), BizDictItem.code.asc())
        .all()
    )


def _next_sort_order(db: Session, dict_code: str) -> int:
    """追加到组尾的 sort_order（空组从 0 开始）."""
    max_value = db.query(func.max(BizDictItem.sort_order)).filter(BizDictItem.dict_code == dict_code).scalar()
    return 0 if max_value is None else int(max_value) + 10


def list_groups(db: Session) -> list[BizDictGroupResponse]:
    """字典组概览（顺序按 ``SUPPORTED_DICTS`` 声明顺序，即管理页展示顺序）."""
    rows = (
        db.query(
            BizDictItem.dict_code,
            func.count(BizDictItem.id),
            func.count(BizDictItem.id).filter(BizDictItem.enabled.is_(True)),
        )
        .group_by(BizDictItem.dict_code)
        .all()
    )
    counts = {row[0]: (int(row[1]), int(row[2])) for row in rows}
    groups: list[BizDictGroupResponse] = []
    for dict_code, (name, description) in SUPPORTED_DICTS.items():
        total, enabled = counts.get(dict_code, (0, 0))
        groups.append(
            BizDictGroupResponse(
                dict_code=dict_code,
                name=name,
                description=description,
                item_count=total,
                enabled_count=enabled,
            ),
        )
    return groups


def list_items(db: Session, dict_code: str, *, include_disabled: bool = True) -> list[BizDictItemResponse]:
    """管理端读取组内条目（默认含停用项，便于重新启用）."""
    _ensure_supported(dict_code)
    items = _load_items(db, dict_code)
    if not include_disabled:
        items = [item for item in items if item.enabled]
    return [_to_response(item) for item in items]


def get_public_items(db: Session, dict_code: str) -> PublicDictListResponse:
    """公开只读：仅启用项，按 sort_order 升序，进程内缓存 60s."""
    _ensure_supported(dict_code)
    cached = _PUBLIC_CACHE.get(dict_code)
    now = time.monotonic()
    if cached is not None and cached[0] > now:
        return cached[1]

    rows = (
        db.query(BizDictItem)
        .filter(BizDictItem.dict_code == dict_code, BizDictItem.enabled.is_(True))
        .order_by(BizDictItem.sort_order.asc(), BizDictItem.code.asc())
        .all()
    )
    response = PublicDictListResponse(
        dict_code=dict_code,
        items=[PublicDictItemResponse(code=row.code, label=row.label, sort_order=row.sort_order) for row in rows],
    )
    _PUBLIC_CACHE[dict_code] = (now + _PUBLIC_CACHE_TTL_SECONDS, response)
    return response


def label_map(db: Session, dict_code: str) -> dict[str, str]:
    """{code: label}（仅启用项；供后端内部展示用，未知 code 由调用方回退原值）."""
    if dict_code not in SUPPORTED_DICTS:
        return {}
    rows = (
        db.query(BizDictItem.code, BizDictItem.label)
        .filter(BizDictItem.dict_code == dict_code, BizDictItem.enabled.is_(True))
        .all()
    )
    return dict(rows)


def model_label_of(db: Session, dict_code: str, code: str | None) -> str | None:
    """展示名解析：字典命中返回 label，未命中/停用/空值回退原 code（D4 别名回退语义）."""
    if not code:
        return code
    return label_map(db, dict_code).get(code, code)


def validate_channel(db: Session, dict_code: str, raw: str | None) -> ChannelValidation:
    """宽松校验归因渠道（D5）：放行一切值，仅返回是否已纳管.

    白名单硬校验会挡存量自由文本与未发版的小程序端来源，归因数据宁可多不可丢；
    字典外值照常落库，运营在管理页补录字典项后自动转为已纳管。
    """
    if raw is None:
        return ChannelValidation(code=None, unmanaged=False)
    managed_codes = {code for (code,) in db.query(BizDictItem.code).filter(BizDictItem.dict_code == dict_code).all()}
    unmanaged = raw not in managed_codes
    if unmanaged:
        # 不拒绝、不改写：仅在日志标记，运营可在 /admin/settings/dicts 补录转正（D5）
        logger.debug("字典外渠道值放行落库: dict_code=%s value=%r", dict_code, raw)
    return ChannelValidation(code=raw, unmanaged=unmanaged)


def list_unmanaged(db: Session, dict_code: str) -> BizDictUnmanagedResponse:
    """字典外的存量原始值（按出现次数降序），供管理页一键转正.

    仅 ``lead_attr_channel`` 支持（其余字典组的落库值受枚举/常量约束，不存在自由文本）。
    """
    _ensure_supported(dict_code)
    if dict_code != LEAD_ATTR_CHANNEL_DICT:
        return BizDictUnmanagedResponse(dict_code=dict_code, items=[])

    managed_codes = {code for (code,) in db.query(BizDictItem.code).filter(BizDictItem.dict_code == dict_code).all()}
    counts: dict[str, int] = {}
    for column in _CHANNEL_SOURCE_COLUMNS:
        rows = db.query(column, func.count()).filter(column.isnot(None), column != "").group_by(column).all()
        for value, count in rows:
            counts[str(value)] = counts.get(str(value), 0) + int(count)

    items = [
        BizDictUnmanagedValue(value=value, count=count)
        for value, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        if value not in managed_codes
    ]
    return BizDictUnmanagedResponse(dict_code=dict_code, items=items)


def _log_change(
    db: Session,
    *,
    action: str,
    operator_id: str,
    item: BizDictItem,
    before: dict[str, Any] | None,
    request: Request | None,
) -> None:
    """写操作审计（D7）：失败不阻塞主流程（OperationLogService 内部已兜底）."""
    OperationLogService().log_action(
        db,
        user_id=operator_id,
        action=action,
        resource_type="biz_dict_item",
        resource_id=str(item.id),
        before=before,
        after={
            "dict_code": item.dict_code,
            "code": item.code,
            "label": item.label,
            "sort_order": item.sort_order,
            "enabled": item.enabled,
            "business_form": item.business_form,
            "category": item.category,
            "remark": item.remark,
        },
        request=request,
    )


def create_item(
    db: Session,
    dict_code: str,
    req: BizDictItemCreate,
    *,
    operator_id: str,
    request: Request | None = None,
) -> BizDictItemResponse:
    """新增字典条目（组内 code 唯一；重复 → 409）.

    ``request`` 不是冗余参数：它经 ``_log_change`` 透传给
    ``OperationLogService.log_action``，用于抽取审计日志的客户端 IP / User-Agent
    （见 D7 配置变更审计）。移除后审计行 ip/user_agent 会为空。
    """
    _ensure_supported(dict_code)
    code = req.code.strip()
    if not code:
        msg = "条目编码不能为空"
        raise ValidationError(msg)

    item = BizDictItem(
        dict_code=dict_code,
        code=code,
        label=req.label.strip(),
        business_form=req.business_form,
        category=req.category,
        sort_order=req.sort_order if req.sort_order is not None else _next_sort_order(db, dict_code),
        enabled=True,
        is_builtin=False,
        remark=req.remark,
    )
    db.add(item)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        msg = f"字典组 {dict_code} 下已存在编码 {code}"
        raise ConflictError(msg) from exc

    db.commit()
    db.refresh(item)
    _invalidate_public_cache(dict_code)
    _log_change(db, action="dict.item.create", operator_id=operator_id, item=item, before=None, request=request)
    return _to_response(item)


def _parse_item_id(item_id: str) -> uuid.UUID:
    """路径参数 → UUID（非法格式按「不存在」处理，不把 PG uuid 转换错误泄成 500）.

    ``BizDictItem.id`` 是原生 uuid 列：传入非法字符串时 PostgreSQL 会在参数绑定阶段
    抛 ``InvalidTextRepresentation``（DataError）。这里在应用层先解析，非法值直接 404，
    避免把可预期的「陈旧/伪造 ID」变成 500；同时**不**用 ``except Exception`` 兜底，
    让真实数据库/编程错误正常上抛（Fail Loud）。

    Raises:
        ResourceNotFoundError: 非法 UUID 格式

    """
    try:
        return uuid.UUID(item_id)
    except (AttributeError, TypeError, ValueError):
        msg = "字典条目不存在"
        raise ResourceNotFoundError(msg) from None


def _get_item(db: Session, dict_code: str, item_id: str) -> BizDictItem:
    """按组 + ID 取条目（跨组 ID 视为不存在，避免越权改别组）."""
    _ensure_supported(dict_code)
    item = db.query(BizDictItem).filter(BizDictItem.id == _parse_item_id(item_id)).first()
    if item is None or item.dict_code != dict_code:
        msg = "字典条目不存在"
        raise ResourceNotFoundError(msg)
    return item


def update_item(
    db: Session,
    dict_code: str,
    item_id: str,
    req: BizDictItemUpdate,
    *,
    operator_id: str,
    request: Request | None = None,
) -> BizDictItemResponse:
    """修改条目（label/排序/停用/备注；code 不可改，避免破坏落库值引用）.

    ``request`` 用于审计日志抽取 IP / User-Agent（同 ``create_item``，勿删）.
    """
    item = _get_item(db, dict_code, item_id)
    before = {
        "label": item.label,
        "sort_order": item.sort_order,
        "enabled": item.enabled,
        "business_form": item.business_form,
        "category": item.category,
        "remark": item.remark,
    }
    if req.label is not None:
        item.label = req.label.strip()
    if req.sort_order is not None:
        item.sort_order = req.sort_order
    if req.enabled is not None:
        item.enabled = req.enabled
    if req.business_form is not None:
        item.business_form = req.business_form
    if req.category is not None:
        item.category = req.category
    if req.remark is not None:
        item.remark = req.remark

    db.commit()
    db.refresh(item)
    _invalidate_public_cache(dict_code)
    _log_change(db, action="dict.item.update", operator_id=operator_id, item=item, before=before, request=request)
    return _to_response(item)


def reorder_items(
    db: Session,
    dict_code: str,
    req: BizDictReorderRequest,
    *,
    operator_id: str,
    request: Request | None = None,
) -> list[BizDictItemResponse]:
    """按 item_ids 顺序重排 sort_order（步长 10，未列出的条目保持原排序值）.

    ``request`` 用于审计日志抽取 IP / User-Agent（同 ``create_item``，勿删）.
    """
    _ensure_supported(dict_code)
    items = {str(item.id): item for item in _load_items(db, dict_code)}
    unknown = [item_id for item_id in req.item_ids if item_id not in items]
    if unknown:
        msg = f"字典条目不存在: {', '.join(unknown[:5])}"
        raise ResourceNotFoundError(msg)

    for index, item_id in enumerate(req.item_ids):
        items[item_id].sort_order = index * 10
    db.commit()

    ordered = [_to_response(items[item_id]) for item_id in req.item_ids]
    _invalidate_public_cache(dict_code)
    _log_change(
        db,
        action="dict.item.reorder",
        operator_id=operator_id,
        item=items[req.item_ids[0]],
        before=None,
        request=request,
    )
    return ordered


def get_document_templates(db: Session, business_form: BusinessForm | None) -> list[DocumentTemplate]:
    """按业务形式取文书模板：字典优先，缺行/损坏回退 ``constants/documents.py``.

    字典行 ``code`` = ``<business_form>:<文书名>``，``label`` 作文书名、``sort_order``
    作 display_order、``category`` 作文书分类（对齐 ``project_documents`` 落库字段）。
    """
    if business_form is None:
        return []

    rows = (
        db.query(BizDictItem)
        .filter(
            BizDictItem.dict_code == DOCUMENT_TEMPLATE_DICT,
            BizDictItem.enabled.is_(True),
            BizDictItem.business_form == business_form.value,
        )
        .order_by(BizDictItem.sort_order.asc(), BizDictItem.code.asc())
        .all()
    )
    if not rows:
        # 字典缺行（未种子/全部停用/损坏）→ 代码常量兜底，读取路径永远可用
        return get_documents_for_business_form(business_form)

    templates: list[DocumentTemplate] = []
    for row in rows:
        category = row.category or "other"
        templates.append(
            DocumentTemplate(
                document_name=row.label,
                display_order=row.sort_order,
                category=category,  # type: ignore[arg-type]
            ),
        )
    return templates


__all__ = [
    "SUPPORTED_DICTS",
    "ChannelValidation",
    "create_item",
    "get_document_templates",
    "get_public_items",
    "label_map",
    "list_groups",
    "list_items",
    "list_unmanaged",
    "model_label_of",
    "reorder_items",
    "update_item",
    "validate_channel",
]
