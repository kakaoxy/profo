"""外站图片下载工具.

将外站图片（贝壳 ljcdn.com / 我爱我家 5i5j.com 等）下载到本地存储，
避免微信小程序 ``<image>`` 组件因 Referer 防盗链导致图片加载失败。

设计要点：
- 同步下载（调用方已在线程池中，如 ``run_in_threadpool``）
- SSRF 防护：禁止 localhost / 内网 IP
- 超时 10s，大小限制 10MB
- ``filetype`` 校验响应体确实是图片
- 通过 ``get_storage_backend()`` 上传（兼容 local / oss 双模式）
- 失败返回 None，调用方回退到原 URL
"""

import ipaddress
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import filetype
import httpx

from settings import settings
from utils.storage import get_storage_backend

logger = logging.getLogger(__name__)

# 下载超时（秒）
_DOWNLOAD_TIMEOUT = 10.0

# 最大重定向跳数（每跳都会重新校验 SSRF 安全）
_MAX_REDIRECTS = 5

# 下载大小上限（字节）：10MB
_MAX_IMAGE_BYTES = 10 * 1024 * 1024

# 允许的图片扩展名
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# 子目录名（与其他上传文件隔离）
_SUBDIR = "properties"

# 浏览器 UA：链家/我爱我家图床会拒绝非浏览器 UA（httpx 默认 UA 返回 403）
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# 请求头：伪装浏览器绕过 UA 防盗链（不带 Referer，与 admin 端 referrerPolicy="no-referrer" 等效）
_REQUEST_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}

# 链家 CDN 裁剪指令：bucket 未开放 m_original（原图）指令，
# 必须追加裁剪参数才能访问。与 admin getFloorPlan 的贝壳分支一致。
_LJCDN_CDN_PARAMS = "!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50"


def _apply_cdn_params(url: str) -> str:
    """对链家 CDN 图片追加裁剪指令.

    链家 CDN（ljcdn.com）采用指令制访问控制：原始 URL 请求 m_original 指令，
    但 bucket 未开放该指令会返回 403 CommandNotMatch。
    追加 ``!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50`` 裁剪指令即可正常访问。
    URL 已含 ``!m_`` 前缀的指令时跳过（幂等）。
    """
    parsed = urlparse(url)
    if "ljcdn.com" not in (parsed.hostname or ""):
        return url
    if "!m_" in url:
        return url
    return f"{url}{_LJCDN_CDN_PARAMS}"


def _is_private_ip(hostname: str) -> bool:
    """判断是否为内网/回环地址.

    利用标准库 ``ipaddress`` 模块精确判定，覆盖：
    127.x（回环）、10.x（A 类私网）、192.168.x（C 类私网）、
    169.254.x（link-local）、172.16-31.x（B 类私网）。

    非合法 IP 地址（如域名）返回 False。
    """
    try:
        addr = ipaddress.ip_address(hostname)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or addr.is_link_local


def _is_url_safe(url: str) -> bool:
    """SSRF 防护：校验 URL 是否安全可下载.

    禁止：非 http/https 协议、localhost、内网 IP。
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    hostname = parsed.hostname or ""
    return bool(hostname) and hostname != "localhost" and not _is_private_ip(hostname)


def _fetch_image(client: httpx.Client, url: str) -> httpx.Response:
    """发起 GET 请求并逐跳校验重定向目标.

    默认 ``follow_redirects=True`` 只校验初始 URL，重定向目标（Location）未经过
    安全校验，可能被重定向到内网/回环地址（SSRF）。这里手动跟随重定向，
    每一跳都调用 ``_is_url_safe`` 重新校验，超限抛 ``ValueError``。

    Args:
        client: 已配置超时/请求头的 httpx 客户端
        url: 初始 URL

    Returns:
        最终（非重定向）响应

    Raises:
        ValueError: 重定向目标不安全或跳数超限

    """
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        resp = client.get(current)
        if not (resp.is_redirect or resp.is_permanent_redirect):
            return resp
        location = resp.headers.get("location")
        # 注意参数顺序：URL(base).join(ref) 将 ref 解析到 base 上；
        # 误写为 URL(location).join(current) 会在 current 为绝对 URL 时
        # 恒等于 current（RFC 3986: ref 含 scheme 时直接返回 ref），
        # 导致重定向目标永远等于原始 URL，重定向无法被跟随。
        next_url = httpx.URL(current).join(location) if location else None
        if next_url is None or not _is_url_safe(str(next_url)):
            msg = f"非法重定向目标: {location}"
            raise ValueError(msg)
        current = str(next_url)
    msg = f"重定向次数超过上限: {_MAX_REDIRECTS}"
    raise ValueError(msg)


def _guess_extension(url: str, content_type: str | None) -> str:
    """从 Content-Type 或 URL 路径推断图片扩展名，默认 ``.jpg``."""
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        ext_map = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }
        if ct in ext_map:
            return ext_map[ct]
    # 从 URL 路径推断（剥离 query string 与 CDN 参数）
    path = url.split("?", 1)[0]
    ext = Path(path).suffix.lower()
    if ext in _IMAGE_EXTENSIONS:
        return ext
    return ".jpg"


def download_external_image(url: str) -> str | None:
    """下载外站图片到本地存储.

    下载成功后通过存储后端（local/oss）保存，返回访问 URL：
    - local 模式：``/static/uploads/properties/20260811_abc.jpg``
    - oss 模式：``{oss_public_base_url}/properties/20260811_abc.jpg``

    Args:
        url: 外站图片 URL（http/https）

    Returns:
        成功返回存储后端的访问 URL，失败返回 None（调用方回退原 URL）。

    """
    if not _is_url_safe(url):
        logger.warning("URL 不安全，跳过下载: %s", url)
        return None

    # 链家 CDN 需追加裁剪指令才能访问（原始 URL 返回 403 CommandNotMatch）
    download_url = _apply_cdn_params(url)

    try:
        with httpx.Client(
            timeout=_DOWNLOAD_TIMEOUT,
            # 手动跟随重定向并逐跳校验 SSRF，见 _fetch_image
            follow_redirects=False,
            trust_env=False,
            headers=_REQUEST_HEADERS,
        ) as client:
            resp = _fetch_image(client, download_url)
            resp.raise_for_status()

            content = resp.content
            if len(content) > _MAX_IMAGE_BYTES:
                logger.warning("图片过大（%d bytes），跳过: %s", len(content), url)
                return None

            # 校验响应体确实是图片
            kind = filetype.guess(content)
            if kind is None or not kind.mime.startswith("image/"):
                logger.warning("非图片内容，跳过: %s", url)
                return None

            content_type = resp.headers.get("content-type")
            ext = _guess_extension(url, content_type)
            filename = f"{datetime.now(timezone.utc).strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
            key = f"{_SUBDIR}/{filename}"

            # 写到本地临时文件（storage.upload_file 需要本地路径）
            local_path = Path(settings.upload_dir) / key
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_bytes(content)

            # 通过存储后端上传（local 模式同文件跳过复制，oss 模式上传后清理本地）
            storage = get_storage_backend()
            stored_url = storage.upload_file(local_path, key)

            if settings.storage_backend == "oss":
                local_path.unlink(missing_ok=True)

            logger.info("下载外站图片成功: %s -> %s", url, stored_url)
            return stored_url

    except Exception:
        logger.warning("下载外站图片失败: %s", url, exc_info=True)
        return None
