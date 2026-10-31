"""协议 PDF 生成（V05 D4-C：手写签名 + PDF）.

使用 reportlab + 内置中文 CID 字体（STSong-Light），不依赖服务器字体文件。
签名图片从文件服务地址解析（本地 /static/uploads 或 http(s) 下载）。
"""

import logging
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

import httpx
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer

from settings import settings
from utils.storage import get_storage_backend

logger = logging.getLogger(__name__)

_FONT_NAME = "STSong-Light"
_FONT_REGISTERED = False


def _ensure_font() -> None:
    """注册中文字体（幂等）."""
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    pdfmetrics.registerFont(UnicodeCIDFont(_FONT_NAME))
    _FONT_REGISTERED = True


def _resolve_image_path(url: str) -> Path:
    """将签名图片 URL 解析为本地可读路径."""
    if url.startswith("/static/uploads/"):
        path = Path(settings.upload_dir) / url[len("/static/uploads/") :]
        if path.exists():
            return path
    if url.startswith(("http://", "https://")):
        suffix = Path(url.split("?", 1)[0]).suffix or ".png"
        with httpx.Client(trust_env=False, timeout=10) as client:
            response = client.get(url)
            response.raise_for_status()
        tmp = Path(tempfile.mkstemp(prefix="merchant-sign-", suffix=suffix)[1])
        tmp.write_bytes(response.content)
        return tmp
    msg = "签名图片不可用"
    raise ValueError(msg)


def generate_agreement_pdf(
    *,
    agreement_id: str,
    title: str,
    content: str,
    signer_name: str,
    signer_phone: str,
    signed_at: datetime,
    signature_url: str,
    subject_name: str | None,
) -> str:
    """生成协议 PDF 并上传，返回文件访问 URL."""
    _ensure_font()
    signature_path = _resolve_image_path(signature_url)

    key = f"merchant_agreements/{agreement_id}-{uuid.uuid4().hex[:8]}.pdf"
    temp_path = Path(tempfile.mkstemp(prefix="merchant-agreement-", suffix=".pdf")[1])
    body_style = ParagraphStyle(
        "agreement-body",
        fontName=_FONT_NAME,
        fontSize=10.5,
        leading=18,
        wordWrap="CJK",
    )
    title_style = ParagraphStyle(
        "agreement-title",
        fontName=_FONT_NAME,
        fontSize=16,
        leading=24,
        alignment=1,
        spaceAfter=12,
    )
    meta_style = ParagraphStyle(
        "agreement-meta",
        fontName=_FONT_NAME,
        fontSize=9.5,
        leading=16,
        textColor="#555555",
    )

    story = [
        Paragraph(escape(title), title_style),
        Paragraph(
            f"协议编号：{agreement_id}<br/>签约主体：{escape(subject_name or '—')}<br/>"
            f"签署人：{escape(signer_name)}　签署时间：{signed_at.strftime('%Y-%m-%d %H:%M')}",
            meta_style,
        ),
        Spacer(1, 6 * mm),
    ]
    for line in content.splitlines():
        if line.strip():
            story.append(Paragraph(escape(line), body_style))
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("签署人签名：", body_style))
    story.append(Image(str(signature_path), width=55 * mm, height=22 * mm, kind="proportional"))
    story.append(Paragraph(f"签署人手机号：{signer_phone}", meta_style))

    doc = SimpleDocTemplate(
        str(temp_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    doc.build(story)

    url = get_storage_backend().upload_file(temp_path, key)
    temp_path.unlink(missing_ok=True)
    if signature_path.name.startswith("merchant-sign-"):
        signature_path.unlink(missing_ok=True)
    return url


__all__ = ["generate_agreement_pdf"]
