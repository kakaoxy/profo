"""存量房源合规回扫脚本（广告法自查报告 §6.1.3）.

用途：用 constants/compliance.py 的词表扫描 l4_marketing_projects 的
title / tags / decoration_style，输出待运营改写的房源清单（不修改数据）。

运行方式（backend 目录下）：
    .venv/bin/python scripts/compliance_rescan.py

默认扫描全部未删除记录；--publish-only 仅扫已发布记录。
输出为 JSON（stdout），可直接交给运营作为改写清单。
"""

import argparse
import json
import sys
from pathlib import Path

# 保证可直接以脚本方式运行（scripts/ 下无包结构）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from constants.compliance import find_banned_words
from db import SessionLocal
from models.marketing.l4_marketing import L4MarketingProject


def rescan(publish_only: bool) -> list[dict]:
    """扫描营销项目文案字段，返回命中清单."""
    db = SessionLocal()
    try:
        query = db.query(L4MarketingProject).filter(L4MarketingProject.is_deleted.is_(False))
        if publish_only:
            query = query.filter(L4MarketingProject.publish_status == "已发布")
        rows = query.all()

        hits: list[dict] = []
        for row in rows:
            fields: dict[str, list[dict[str, str]]] = {}

            title_hits = find_banned_words(row.title or "")
            if title_hits:
                fields["title"] = [{"word": w, "reason": r} for w, r in title_hits]

            tag_hits: list[dict[str, str]] = []
            for tag in row.tags or []:
                for w, r in find_banned_words(tag):
                    tag_hits.append({"word": w, "reason": r, "field": tag})
            if tag_hits:
                fields["tags"] = tag_hits

            style_hits = find_banned_words(row.decoration_style or "")
            if style_hits:
                fields["decoration_style"] = [{"word": w, "reason": r} for w, r in style_hits]

            if fields:
                hits.append(
                    {
                        "id": row.id,
                        "community_name": row.community_name,
                        "project_status": row.project_status,
                        "publish_status": row.publish_status,
                        "hits": fields,
                    },
                )
        return hits
    finally:
        db.close()


def main() -> None:
    """脚本入口：解析参数、执行扫描、输出 JSON 清单."""
    parser = argparse.ArgumentParser(description="存量房源文案合规回扫")
    parser.add_argument("--publish-only", action="store_true", help="仅扫描已发布房源")
    args = parser.parse_args()

    hits = rescan(publish_only=args.publish_only)
    print(json.dumps({"total_hits": len(hits), "items": hits}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
