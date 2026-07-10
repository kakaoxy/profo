"""跟投列表 Excel 导出."""

from models.common import ProjectStatus, SettlementStatus


class _ExporterMixin:
    """Excel 导出方法."""

    # ==================== Excel 导出 ====================

    def export_excel(
        self,
        search: str | None = None,
        project_status: ProjectStatus | None = None,
        settlement_status: SettlementStatus | None = None,
    ) -> bytes:
        """导出全量跟投列表为 .xlsx（openpyxl）。文件名 跟投列表_YYYYMMDD.xlsx."""
        import io  # noqa: PLC0415

        from openpyxl import Workbook  # noqa: PLC0415

        items, _ = self.list_investments(
            search=search,
            project_status=project_status,
            settlement_status=settlement_status,
            page=1,
            page_size=100000,  # 导出需全量数据，非普通查询
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "跟投列表"
        headers = [
            "项目编号",
            "小区",
            "项目状态",
            "跟投状态",
            "投资总额",
            "收益总额",
            "回报率(%)",
            "投资方数量",
        ]
        ws.append(headers)

        status_label = {
            ProjectStatus.SIGNING: "签约",
            ProjectStatus.RENOVATING: "改造",
            ProjectStatus.SELLING: "在售",
            ProjectStatus.SOLD: "已售",
            ProjectStatus.DELETED: "已删除",
        }
        settle_label = {
            SettlementStatus.UNSETTLED: "未结算",
            SettlementStatus.SETTLED: "已结算",
        }

        for it in items:
            ws.append(
                [
                    it.project_code,
                    it.project_name,
                    status_label.get(it.project_status, "-") if it.project_status else "-",
                    settle_label.get(it.settlement_status, "-"),
                    float(it.total_investment),
                    float(it.total_return) if it.total_return is not None else 0,
                    round(it.return_ratio, 2),
                    it.investor_count,
                ],
            )

        for col_idx in range(1, len(headers) + 1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()
