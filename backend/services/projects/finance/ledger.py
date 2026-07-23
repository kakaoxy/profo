"""资金账本列表/统计/导出."""

import csv
import io
import logging
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import case, func, or_

from models import FinanceRecord, Project, ProjectContract
from models.common import CashFlowType
from settings import settings
from utils.csv_exporter import sanitize_csv_cell
from utils.file_security import get_safe_file_path
from utils.formatters import escape_like

logger = logging.getLogger(__name__)

# 票据文件下载超时（秒）：单个 OSS 文件下载上限
_RECEIPT_DOWNLOAD_TIMEOUT = 30.0

# 票据文件下载大小上限（字节）：防止单次下载导致内存耗尽
_RECEIPT_MAX_BYTES = 50 * 1024 * 1024


def _fetch_receipt_bytes(url: str, upload_dir: Path) -> bytes | None:  # noqa: PLR0911
    """获取票据文件内容.

    - OSS URL (以 http 开头): 通过 HTTP 下载（CDN/公开 Bucket 直连）
    - local URL (/static/uploads/...): 从本地磁盘读取

    SSRF 防护：``receipt_urls`` 可被用户通过 LedgerRecordCreate/Update 写入，
    故 http URL 必须满足：(1) 当前为 oss 模式；(2) URL 的 hostname 与配置的
    ``oss_public_base_url`` 的 hostname 精确相等（避免前缀/UserInfo 绕过）。
    下载采用流式读取并设置大小上限，防止内存耗尽；重定向后最终 URL 的 host
    仍需在白名单内。

    Args:
        url: 票据文件 URL
        upload_dir: 本地上传目录（仅 local 模式使用）

    Returns:
        文件内容 bytes, 失败时返回 None（已记录 warning）

    """
    if url.startswith("http"):
        # SSRF 防护：仅 oss 模式 + 白名单 hostname 才允许远程下载
        if settings.storage_backend != "oss":
            logger.warning("拒绝下载远程票据文件（当前非 oss 模式）: %s", url)
            return None
        oss_base = (settings.oss_public_base_url or "").rstrip("/")
        if not oss_base:
            logger.warning("拒绝下载远程票据文件（oss_public_base_url 未配置）: %s", url)
            return None
        # 精确比对 hostname，避免 url.startswith(oss_base) 的前缀/UserInfo 绕过
        # 例：https://cdn.example.com.evil.com 或 https://cdn.example.com@evil.com
        base_host = urlparse(oss_base).hostname
        url_host = urlparse(url).hostname
        if not base_host or not url_host or url_host != base_host:
            logger.warning("拒绝下载非白名单 hostname 票据文件: %s", url)
            return None
        try:
            with httpx.stream(
                "GET", url, timeout=_RECEIPT_DOWNLOAD_TIMEOUT, follow_redirects=True
            ) as resp:
                resp.raise_for_status()
                # 校验重定向后最终 URL 的 hostname 仍在白名单内
                final_host = urlparse(str(resp.url)).hostname
                if final_host != base_host:
                    logger.warning(
                        "拒绝下载重定向至非白名单 hostname 的票据文件: %s -> %s", url, resp.url
                    )
                    return None
                # 预检 Content-Length（恶意服务端可省略/伪造，仍需流式兜底）
                content_length = resp.headers.get("content-length")
                try:
                    cl = int(content_length) if content_length else None
                except (TypeError, ValueError):
                    cl = None
                if cl is not None and cl > _RECEIPT_MAX_BYTES:
                    logger.warning(
                        "票据文件超过大小上限 %d 字节（Content-Length）: %s",
                        _RECEIPT_MAX_BYTES, url,
                    )
                    return None
                # 流式读取并累计，超限即中止
                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > _RECEIPT_MAX_BYTES:
                        logger.warning(
                            "票据文件超过大小上限 %d 字节，中止下载: %s",
                            _RECEIPT_MAX_BYTES, url,
                        )
                        return None
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.HTTPError:
            logger.warning("下载票据文件失败 (OSS): %s", url, exc_info=True)
            return None

    # local 模式: 从本地磁盘读取
    rel_path = url.split("/static/uploads/", 1)[1] if "/static/uploads/" in url else url.lstrip("/")
    try:
        file_path = get_safe_file_path(upload_dir, rel_path)
    except ValueError:
        logger.warning("票据文件名不安全或路径非法: %s", rel_path)
        return None
    if file_path.is_file():
        if file_path.stat().st_size > _RECEIPT_MAX_BYTES:
            logger.warning("票据文件超过大小上限 %d 字节: %s", _RECEIPT_MAX_BYTES, file_path)
            return None
        return file_path.read_bytes()
    logger.warning("票据文件不存在: %s", file_path)
    return None


class _LedgerMixin:
    """资金账本列表/统计/导出方法."""

    # ==================== 资金账本 (Ledger) ====================

    def list_projects_with_stats(
        self,
        search: str | None,
        project_status: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        """资金账本：分页查询有流水记录的项目及其聚合统计.

        - JOIN Project + FinanceRecord，按 project_id 分组聚合
        - total_income / total_expense / net_cash_flow / record_count
        - search 模糊搜索 project.contract_no / project.community_name / project.address
        - project_status 筛选
        - 按 Project.created_at 倒序分页（与项目列表一致，最新项目排最前）
        """
        total_income_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_income")
        total_expense_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_expense")
        net_cash_flow_expr = (total_income_expr - total_expense_expr).label("net_cash_flow")
        record_count_expr = func.count(FinanceRecord.id).label("record_count")

        query = (
            self.db.query(
                Project.id.label("project_id"),
                Project.community_name.label("project_name"),
                Project.address.label("project_address"),
                Project.status.label("project_status"),
                Project.created_at.label("project_created_at"),
                ProjectContract.contract_no.label("project_code"),
                total_income_expr,
                total_expense_expr,
                net_cash_flow_expr,
                record_count_expr,
            )
            .join(FinanceRecord, FinanceRecord.project_id == Project.id)
            .outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            .filter(
                Project.is_deleted.is_(False),
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(
                Project.id,
                Project.community_name,
                Project.address,
                Project.status,
                Project.created_at,
                ProjectContract.contract_no,
            )
        )

        if search:
            like = f"%{escape_like(search).lower()}%"
            query = query.filter(
                or_(
                    func.lower(ProjectContract.contract_no).like(like, escape="\\"),
                    func.lower(Project.community_name).like(like, escape="\\"),
                    func.lower(Project.address).like(like, escape="\\"),
                ),
            )

        if project_status is not None:
            query = query.filter(Project.status == project_status)

        total: int = query.count()
        offset = (page - 1) * page_size
        rows = query.order_by(Project.created_at.desc()).offset(offset).limit(page_size).all()

        items: list[dict[str, Any]] = []
        for row in rows:
            total_income = row.total_income or Decimal(0)
            total_expense = row.total_expense or Decimal(0)
            net_cf = total_income - total_expense
            roi = float((net_cf / total_expense) * 100) if total_expense > 0 else 0.0
            items.append(
                {
                    "project_id": row.project_id,
                    "project_code": row.project_code,
                    "project_name": row.project_name,
                    "project_address": row.project_address,
                    "project_status": row.project_status,
                    "total_income": total_income,
                    "total_expense": total_expense,
                    "net_cash_flow": net_cf,
                    "roi": round(roi, 2),
                    "record_count": int(row.record_count),
                },
            )
        return items, total

    def get_overall_stats(self) -> dict[str, Any]:
        """资金账本：全局汇总（有流水记录的项目数、总收入、总支出、净现金流、记录数）."""
        base = self.db.query(FinanceRecord).filter(FinanceRecord.is_deleted.is_(False))

        total_records: int = base.count()

        agg = (
            self.db.query(
                func.sum(
                    case(
                        (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                        else_=Decimal(0),
                    ),
                ).label("total_income"),
                func.sum(
                    case(
                        (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
                        else_=Decimal(0),
                    ),
                ).label("total_expense"),
            )
            .filter(FinanceRecord.is_deleted.is_(False))
            .first()
        )

        total_income = agg.total_income or Decimal(0)
        total_expense = agg.total_expense or Decimal(0)
        net_cash_flow = total_income - total_expense

        total_projects = (
            self.db.query(func.count(func.distinct(FinanceRecord.project_id)))
            .filter(FinanceRecord.is_deleted.is_(False))
            .scalar()
        ) or 0

        return {
            "total_projects": int(total_projects),
            "total_income": total_income,
            "total_expense": total_expense,
            "net_cash_flow": net_cash_flow,
            "total_records": int(total_records),
        }

    def _list_all_projects_with_stats(
        self,
        search: str | None,
        project_status: str | None,
    ) -> list[dict[str, Any]]:
        """资金账本：不分页全量查询项目统计（仅用于导出）.

        与 list_projects_with_stats 共享查询逻辑但不分页，避免 page_size 硬编码截断。
        """
        total_income_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_income")
        total_expense_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_expense")
        net_cash_flow_expr = (total_income_expr - total_expense_expr).label("net_cash_flow")
        record_count_expr = func.count(FinanceRecord.id).label("record_count")

        query = (
            self.db.query(
                Project.id.label("project_id"),
                Project.community_name.label("project_name"),
                Project.address.label("project_address"),
                Project.status.label("project_status"),
                Project.created_at.label("project_created_at"),
                ProjectContract.contract_no.label("project_code"),
                total_income_expr,
                total_expense_expr,
                net_cash_flow_expr,
                record_count_expr,
            )
            .join(FinanceRecord, FinanceRecord.project_id == Project.id)
            .outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            .filter(
                Project.is_deleted.is_(False),
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(
                Project.id,
                Project.community_name,
                Project.address,
                Project.status,
                Project.created_at,
                ProjectContract.contract_no,
            )
        )

        if search:
            like = f"%{escape_like(search).lower()}%"
            query = query.filter(
                or_(
                    func.lower(ProjectContract.contract_no).like(like, escape="\\"),
                    func.lower(Project.community_name).like(like, escape="\\"),
                    func.lower(Project.address).like(like, escape="\\"),
                ),
            )

        if project_status is not None:
            query = query.filter(Project.status == project_status)

        rows = query.order_by(Project.created_at.desc()).all()

        items: list[dict[str, Any]] = []
        for row in rows:
            total_income = row.total_income or Decimal(0)
            total_expense = row.total_expense or Decimal(0)
            net_cf = total_income - total_expense
            roi = float((net_cf / total_expense) * 100) if total_expense > 0 else 0.0
            items.append(
                {
                    "project_id": row.project_id,
                    "project_code": row.project_code,
                    "project_name": row.project_name,
                    "project_address": row.project_address,
                    "project_status": row.project_status,
                    "total_income": total_income,
                    "total_expense": total_expense,
                    "net_cash_flow": net_cf,
                    "roi": round(roi, 2),
                    "record_count": int(row.record_count),
                },
            )
        return items

    def export_ledger_excel(
        self,
        search: str | None,
        project_status: str | None,
    ) -> bytes:
        """资金账本：导出全量项目列表为 .xlsx（openpyxl）.

        列：项目编号、小区、地址、项目状态、总收入、总支出、净现金流、ROI(%)、记录数
        """
        from openpyxl import Workbook  # noqa: PLC0415

        items = self._list_all_projects_with_stats(
            search=search,
            project_status=project_status,
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "资金账本"
        headers = [
            "项目编号",
            "小区",
            "地址",
            "项目状态",
            "总收入",
            "总支出",
            "净现金流",
            "ROI(%)",
            "记录数",
        ]
        ws.append(headers)

        status_label = {
            "signing": "签约",
            "renovating": "改造",
            "selling": "在售",
            "sold": "已售",
            "deleted": "已删除",
        }

        for it in items:
            ws.append(
                [
                    sanitize_csv_cell(it["project_code"] or ""),
                    sanitize_csv_cell(it["project_name"] or ""),
                    sanitize_csv_cell(it["project_address"] or ""),
                    status_label.get(it["project_status"], it["project_status"] or "-"),
                    float(it["total_income"]),
                    float(it["total_expense"]),
                    float(it["net_cash_flow"]),
                    round(it["roi"], 2),
                    it["record_count"],
                ],
            )

        for col_idx in range(1, len(headers) + 1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    def export_project_records_zip(self, project_id: str) -> tuple[str, bytes]:
        """资金账本：导出单项目流水为 zip（含 CSV + 票据图片）.

        票据文件可能存储在本地（local 模式）或 OSS（oss 模式）：
        - local: URL 形如 /static/uploads/xxx.jpg → 从本地磁盘读取
        - oss:   URL 形如 https://cdn.example.com/xxx.jpg → 通过 HTTP 下载

        Returns:
            (filename_stem, zip_bytes) - filename_stem 形如 "资金账本_XX001_20260707"

        """
        records = self.get_records(project_id)

        # 查询项目编号用于文件名
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        contract = self.db.query(ProjectContract).filter(ProjectContract.project_id == project_id).first()
        project_code = (
            (contract.contract_no if contract else None) or (project.name if project else None) or project_id[:8]
        )

        today = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
        filename_stem = f"资金账本_{project_code}_{today}"

        # 构建 CSV（UTF-8 with BOM，Excel 兼容）
        csv_buffer = io.StringIO()
        csv_buffer.write("\ufeff")
        writer = csv.writer(csv_buffer)
        writer.writerow(["日期", "交易形式", "交易方", "分类", "金额", "票据", "备注"])

        upload_dir = Path(settings.upload_dir).resolve()
        seen_filenames: set[str] = set()
        receipt_count = 0
        type_label = {CashFlowType.INCOME.value: "收入", CashFlowType.EXPENSE.value: "支出"}

        # 先开 zip 上下文，遍历中即时 writestr 票据字节（用完即丢），
        # 任一时刻仅持有一个票据字节，避免累积所有票据导致内存回归。
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for rec in records:
                date_str = rec.record_date.strftime("%Y-%m-%d") if rec.record_date else ""
                type_val = rec.type.value if rec.type else ""
                form_str = type_label.get(type_val, type_val)
                counterparty = rec.counterparty or ""
                category = rec.category.value if rec.category else ""
                amount = f"{float(rec.amount):.2f}" if rec.amount is not None else "0.00"
                remark = rec.remark or ""

                receipt_names: list[str] = []
                for url in rec.receipt_urls or []:
                    # 提取文件名: 取 URL 最后路径段（local 与 OSS 均适用）
                    filename = url.rsplit("/", 1)[-1]
                    if not filename:
                        continue
                    receipt_names.append(filename)

                    if filename in seen_filenames:
                        continue
                    seen_filenames.add(filename)

                    content = _fetch_receipt_bytes(url, upload_dir)
                    if content is None:
                        continue
                    zip_path = f"receipts/{filename}"
                    try:
                        zf.writestr(zip_path, content)
                    except (OSError, zipfile.BadZipFile):
                        logger.warning("写入票据文件到zip失败: %s", zip_path)
                        continue
                    receipt_count += 1

                writer.writerow([date_str, form_str, counterparty, category, amount, ";".join(receipt_names), remark])

            # CSV 在票据循环结束后写入 zip
            zf.writestr("流水.csv", csv_buffer.getvalue().encode("utf-8"))

        logger.info(
            "导出项目 %s 流水 zip 完成：%d 条记录，%d 个票据",
            project_id,
            len(records),
            receipt_count,
        )
        return filename_stem, zip_buffer.getvalue()
