"""户型图识别工具（Python 移植版）.

与前端 ``frontend/src/app/(main)/admin/properties/columns.tsx:getFloorPlan``
+ ``frontend/src/lib/validators.ts:isValidUrl`` 完全等价。

策略：基于**数据源字段 + URL 模式匹配 + 数组位置 fallback** 三层组合，
不读图片内容。返回的户型图 URL 在贝壳分支下会追加链家 CDN 裁剪指令
（与 ``utils/image_download._apply_cdn_params`` 一致），确保下载可成功。
"""

from urllib.parse import urlparse

# 复用 image_download 的 CDN 参数常量，确保前后端一致
from utils.image_download import _LJCDN_CDN_PARAMS

_BEIKE_DATA_SOURCE = "贝壳"
_5I5J_DATA_SOURCE = "我爱我家"
# 贝壳分支 fallback：hdic-frame 未命中时取第 3 张（索引 2）
_BEIKE_FALLBACK_INDEX = 2
_BEIKE_FALLBACK_MIN_LENGTH = 3


def is_valid_url(value: str) -> bool:
    """校验字符串是否为合法的绝对 URL（http/https）或相对路径.

    与前端 ``isValidUrl`` 等价：
    - ``/`` 开头的相对路径视为有效
    - 合法的 http/https URL 视为有效
    - 其他（如 ``"q_80"``、空串、``javascript:``）视为无效

    Args:
        value: 待校验的字符串

    Returns:
        True 表示有效，False 表示无效

    """
    if not isinstance(value, str) or not value:
        return False
    if value.startswith("/"):
        return True
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _apply_ljcdn_params(url: str) -> str:
    """对链家 CDN 图片追加裁剪指令（幂等）.

    与 ``utils.image_download._apply_cdn_params`` 等价但作用范围更窄：
    仅判断 URL 中是否已含 ``!m_fill`` 指令，未含则追加 ``_LJCDN_CDN_PARAMS``。
    链家 CDN 未开放 ``m_original`` 指令，必须追加裁剪参数才能访问。

    Args:
        url: 原始 URL

    Returns:
        追加 CDN 参数后的 URL（若已含 ``!m_fill`` 则原样返回）

    """
    if "!m_fill" in url:
        return url
    return f"{url}{_LJCDN_CDN_PARAMS}"


def get_floor_plan(
    data_source: str | None,
    links: list[str] | None,
) -> str | None:
    """从图片 URL 列表中选出户型图 URL.

    与前端 ``getFloorPlan`` 完全等价（Python 移植版），基于**数据源字段 +
    URL 模式匹配 + 数组位置 fallback** 三层组合。

    Args:
        data_source: 数据源名称（如 ``"贝壳"`` / ``"我爱我家"``）
        links: 图片 URL 列表（可能含脏数据如 ``"q_80"``）

    Returns:
        户型图 URL，无合法 URL 时返回 ``None``。
        贝壳分支返回的 URL 已追加 CDN 裁剪参数。

    """
    if not links:
        return None

    # 1. 预过滤：清洗非法字符串（与前端 isValidUrl 等价）
    valid_links = [link for link in links if is_valid_url(link)]
    if not valid_links:
        return None

    source = data_source or ""

    # 2. 单次遍历预匹配 hdic-frame / floorplan/layout，缓存 lower 结果
    hdic_frame_image: str | None = None
    floor_plan_image: str | None = None

    for link in valid_links:
        lower = link.lower()
        if hdic_frame_image is None and "hdic-frame" in lower:
            hdic_frame_image = link
        if floor_plan_image is None and ("floorplan" in lower or "layout" in lower):
            floor_plan_image = link
        if hdic_frame_image is not None and floor_plan_image is not None:
            break

    # 3. 按数据源分支决策
    image_url: str | None = None

    if source == _BEIKE_DATA_SOURCE:
        # 贝壳：hdic-frame 优先 -> 第 3 张 -> 第 1 张
        # Python 列表越界会抛 IndexError，需显式判断长度
        if hdic_frame_image is not None:
            image_url = hdic_frame_image
        elif len(valid_links) >= _BEIKE_FALLBACK_MIN_LENGTH:
            image_url = valid_links[_BEIKE_FALLBACK_INDEX]
        else:
            image_url = valid_links[0]
        # 追加 CDN 裁剪参数（幂等）
        image_url = _apply_ljcdn_params(image_url)
    elif source == _5I5J_DATA_SOURCE:
        # 我爱我家：floorplan/layout 优先 -> 最后一张
        image_url = floor_plan_image if floor_plan_image is not None else valid_links[-1]
    else:
        # 其他/空：默认第 1 张
        image_url = valid_links[0]

    return image_url or None
