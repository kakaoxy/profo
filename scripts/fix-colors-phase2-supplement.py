#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 Phase 2 补充
处理剩余的特殊情况
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from collections import defaultdict


@dataclass
class ReplacementRule:
    name: str
    pattern: str
    replacement: str
    description: str
    flags: int = 0
    priority: int = 100
    compiled_pattern: Optional[re.Pattern] = field(default=None, repr=False)


@dataclass
class FileChange:
    file_path: Path
    line_number: int
    original: str
    replaced: str
    rule_name: str


class SupplementFixer:
    # =========================================================================
    # 补充规则：处理特殊情况
    # =========================================================================
    SUPPLEMENT_RULES = [
        # ---- Slate 残留补充 ----
        {"name": "text-slate-300", "pattern": r'text-slate-300', "replacement": 'text-muted-foreground/50', "description": "slate-300 → muted-foreground/50", "priority": 10},
        {"name": "hover:border-slate-400", "pattern": r'hover:border-slate-400', "replacement": 'hover:border-border', "description": "hover slate边框 → border", "priority": 10},
        {"name": "ring-slate-100", "pattern": r'ring-slate-100', "replacement": 'ring-border', "description": "ring slate → border", "priority": 10},
        {"name": "bg-slate-700", "pattern": r'bg-slate-700', "replacement": 'bg-muted', "description": "slate-700背景 → muted", "priority": 10},

        # ---- Gradient slate 替换 ----
        {"name": "gradient-slate", "pattern": r'from-slate-800 to-slate-600', "replacement": 'from-card to-muted', "description": "slate gradient → card/muted", "priority": 10},
        {"name": "gradient-slate-reverse", "pattern": r'from-slate-600 to-slate-800', "replacement": 'from-muted to-card', "description": "slate gradient → muted/card", "priority": 10},

        # ---- Hex 必填标记 ----
        {"name": "hex-ba1a1a", "pattern": r'#ba1a1a', "replacement": 'var(--error)', "description": "必填红 → error", "priority": 5},

        # ---- 特殊营销模块颜色 ----
        {"name": "hex-f8f9ff", "pattern": r'#f8f9ff', "replacement": 'var(--muted)', "description": "浅蓝背景 → muted", "priority": 5},
        {"name": "hex-dce9ff", "pattern": r'#dce9ff', "replacement": 'var(--primary)', "description": "hover浅蓝 → primary", "priority": 5},
        {"name": "hex-7d5400", "pattern": r'#7d5400', "replacement": 'var(--status-pending)', "description": "深琥珀 → status-pending", "priority": 5},
        {"name": "hex-ffddb0", "pattern": r'#ffddb0', "replacement": 'var(--status-pending)', "description": "浅琥珀背景 → status-pending", "priority": 5},

        # ---- 标签绿色系 ----
        {"name": "hex-85fa51", "pattern": r'#85fa51', "replacement": 'var(--success)', "description": "亮绿标签 → success", "priority": 5},
        {"name": "hex-266d00", "pattern": r'#266d00', "replacement": 'var(--success)', "description": "深绿文字 → success", "priority": 5},
        {"name": "hex-9d6a00", "pattern": r'#9d6a00', "replacement": 'var(--status-pending)', "description": "深琥珀标签 → status-pending", "priority": 5},
    ]

    # 文件扩展名
    TARGET_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js"}

    # 排除配置文件
    EXCLUDE_FILES = {
        "status-colors.ts",
        "chart-colors.ts",
        "utils.ts",
    }

    def __init__(self, project_root: Path, target_path: Path = None):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.rules: List[ReplacementRule] = []
        self.changes: List[FileChange] = []
        self.stats: Dict[str, int] = defaultdict(int)
        self.file_counts: Dict[Path, int] = defaultdict(int)
        self._compile_rules()

    def _compile_rules(self):
        for r in self.SUPPLEMENT_RULES:
            try:
                compiled = re.compile(r["pattern"], r.get("flags", 0))
                self.rules.append(ReplacementRule(
                    name=r["name"],
                    pattern=r["pattern"],
                    replacement=r["replacement"],
                    description=r["description"],
                    flags=r.get("flags", 0),
                    priority=r.get("priority", 100),
                    compiled_pattern=compiled
                ))
            except re.error as e:
                print(f"⚠️  规则编译失败 '{r['name']}': {e}")

        # 按优先级排序
        self.rules.sort(key=lambda x: x.priority)

    def find_target_files(self) -> List[Path]:
        if self.target_path.is_file():
            if self.target_path.name in self.EXCLUDE_FILES:
                return []
            return [self.target_path]

        files = []
        for ext in ["*.tsx", "*.ts", "*.jsx", "*.js"]:
            for f in self.target_path.rglob(ext):
                if f.name not in self.EXCLUDE_FILES:
                    files.append(f)
        return sorted(files)

    def process_file(self, file_path: Path, dry_run: bool = True) -> bool:
        try:
            content = file_path.read_text(encoding='utf-8')
        except Exception as e:
            print(f"  ⚠️  无法读取 {file_path}: {e}")
            return False

        original_content = content
        lines = content.split('\n')
        modified_lines = []
        file_changes = []

        for line_num, line in enumerate(lines, 1):
            modified_line = line
            for rule in self.rules:
                if rule.compiled_pattern is None:
                    continue
                new_line, count = rule.compiled_pattern.subn(rule.replacement, modified_line)
                if count > 0:
                    file_changes.append(FileChange(
                        file_path=file_path,
                        line_number=line_num,
                        original=line.strip(),
                        replaced=new_line.strip(),
                        rule_name=rule.name
                    ))
                    self.stats[rule.name] += count
                    modified_line = new_line
            modified_lines.append(modified_line)

        new_content = '\n'.join(modified_lines)

        if new_content != original_content:
            self.changes.extend(file_changes)
            self.file_counts[file_path] = len(file_changes)
            if not dry_run:
                file_path.write_text(new_content, encoding='utf-8')
            return True
        return False

    def run(self, dry_run: bool = True):
        files = self.find_target_files()
        print(f"📁 扫描目录: {self.target_path}")
        print(f"📄 找到 {len(files)} 个目标文件")
        print(f"📋 启用补充规则: {len(self.rules)} 条\n")

        modified_count = 0
        for fp in files:
            if self.process_file(fp, dry_run):
                modified_count += 1
                if dry_run:
                    c = self.file_counts.get(fp, 0)
                    print(f"  📝 {fp.relative_to(self.project_root)} ({c} 处)")

        self._print_report(dry_run, len(files), modified_count)

    def _print_report(self, dry_run, total, modified):
        mode = "【预览模式】" if dry_run else "【执行模式】"
        print(f"\n{'='*70}")
        print(f"📊 补充整改报告 {mode}")
        print(f"{'='*70}")
        print(f"总文件数: {total}")
        print(f"变更文件: {modified}")
        print(f"总替换次数: {len(self.changes)}")

        if self.stats:
            print(f"\n📈 规则替换统计:")
            for name, count in sorted(self.stats.items(), key=lambda x: -x[1]):
                desc = next((r.description for r in self.rules if r.name == name), name)
                print(f"  {count:3d} 次 - {desc}")

        if dry_run and self.changes:
            print(f"\n📝 变更详情 (前 10 条):")
            for change in self.changes[:10]:
                rel = change.file_path.relative_to(self.project_root)
                print(f"\n  {rel}:{change.line_number}")
                print(f"    - {change.original[:60]}...")
                print(f"    + {change.replaced[:60]}...")
            if len(self.changes) > 10:
                print(f"\n  ... 还有 {len(self.changes) - 10} 处")

        if dry_run:
            print(f"\n💡 使用 --apply 执行实际修改")


def main():
    parser = argparse.ArgumentParser(description='ProFo Phase 2 补充整改脚本')
    parser.add_argument('--dry-run', '-d', action='store_true', help='预览模式（默认）')
    parser.add_argument('--apply', '-a', action='store_true', help='执行修改')
    parser.add_argument('--path', '-p', type=str, help='指定目录')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    target_path = project_root / args.path if args.path else project_root / "frontend" / "src"
    if not target_path.exists():
        print(f"❌ 路径不存在: {target_path}")
        sys.exit(1)

    dry_run = not args.apply
    print("🎨 ProFo Phase 2 补充整改\n")
    fixer = SupplementFixer(project_root, target_path)
    fixer.run(dry_run=dry_run)

    if args.apply:
        print("\n✅ 补充整改完成！请运行以下命令验证：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")


if __name__ == "__main__":
    main()
