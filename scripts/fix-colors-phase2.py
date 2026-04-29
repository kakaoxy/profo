#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 Phase 2
处理残留问题：inline hex、slate 残留、非状态语义色、bg-white
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


class Phase2ColorFixer:
    # =========================================================================
    # Phase 2 规则：处理报告中的残留问题
    # =========================================================================
    PHASE2_RULES = [
        # ---- Inline Hex 颜色替换（营销模块）----
        # 深色标题文字
        {"name": "hex-0b1c30", "pattern": r'#0b1c30', "replacement": 'var(--foreground)', "description": "深色标题 → foreground", "priority": 5},
        # 辅助文字
        {"name": "hex-707785", "pattern": r'#707785', "replacement": 'var(--muted-foreground)', "description": "辅助文字 → muted-foreground", "priority": 5},
        # 边框
        {"name": "hex-c0c7d6", "pattern": r'#c0c7d6', "replacement": 'var(--border)', "description": "边框色 → border", "priority": 5},
        # 浅蓝背景
        {"name": "hex-e5eeff", "pattern": r'#e5eeff', "replacement": 'var(--primary)', "description": "浅蓝背景 → primary", "priority": 5},
        {"name": "hex-f8faff", "pattern": r'#f8faff', "replacement": 'var(--muted)', "description": "浅蓝背景 → muted", "priority": 5},
        {"name": "hex-f0f7ff", "pattern": r'#f0f7ff', "replacement": 'var(--muted)', "description": "浅蓝背景 → muted", "priority": 5},
        {"name": "hex-eff4ff", "pattern": r'#eff4ff', "replacement": 'var(--primary)', "description": "浅蓝背景 → primary", "priority": 5},
        # 绿色状态
        {"name": "hex-22c55e", "pattern": r'#22c55e', "replacement": 'var(--status-selling)', "description": "绿色状态 → status-selling", "priority": 5},
        # 浅绿背景
        {"name": "hex-f0fdf4", "pattern": r'#f0fdf4', "replacement": 'var(--status-selling)', "description": "浅绿背景 → status-selling", "priority": 5},
        # 列表背景
        {"name": "hex-f3f4f6", "pattern": r'#f3f4f6', "replacement": 'var(--muted)', "description": "列表背景 → muted", "priority": 5},
        # 浅红背景
        {"name": "hex-ffdad6", "pattern": r'#ffdad6', "replacement": 'var(--error)', "description": "浅红背景 → error", "priority": 5},

        # ---- Slate 残留替换 ----
        {"name": "border-slate-200", "pattern": r'border-slate-200', "replacement": 'border-border', "description": "边框 → border", "priority": 10},
        {"name": "border-slate-700", "pattern": r'border-slate-700', "replacement": 'border-border', "description": "边框(暗) → border", "priority": 10},
        {"name": "border-slate-900", "pattern": r'border-slate-900', "replacement": 'border-primary', "description": "深色边框 → primary", "priority": 10},
        {"name": "border-slate-100", "pattern": r'border-slate-100', "replacement": 'border-border', "description": "浅边框 → border", "priority": 10},
        {"name": "divide-slate-100", "pattern": r'divide-slate-100', "replacement": 'divide-border', "description": "分割线 → divide-border", "priority": 10},
        {"name": "text-slate-900", "pattern": r'text-slate-900', "replacement": 'text-foreground', "description": "深色文字 → foreground", "priority": 10},
        {"name": "text-slate-700", "pattern": r'text-slate-700', "replacement": 'text-muted-foreground', "description": "次要文字 → muted-foreground", "priority": 10},
        {"name": "text-slate-500", "pattern": r'text-slate-500', "replacement": 'text-muted-foreground', "description": "次要文字 → muted-foreground", "priority": 10},
        {"name": "text-slate-400", "pattern": r'text-slate-400', "replacement": 'text-muted-foreground', "description": "次要文字 → muted-foreground", "priority": 10},
        {"name": "bg-slate-50", "pattern": r'bg-slate-50', "replacement": 'bg-muted', "description": "背景 → muted", "priority": 10},
        {"name": "bg-slate-100", "pattern": r'bg-slate-100', "replacement": 'bg-muted', "description": "背景 → muted", "priority": 10},
        {"name": "bg-slate-800", "pattern": r'bg-slate-800', "replacement": 'bg-card', "description": "深色背景 → card", "priority": 10},
        {"name": "bg-slate-900", "pattern": r'bg-slate-900', "replacement": 'bg-card', "description": "深色背景 → card", "priority": 10},

        # ---- bg-white 替换 ----
        {"name": "bg-white", "pattern": r'bg-white', "replacement": 'bg-card', "description": "白色背景 → card", "priority": 15},

        # ---- 非状态语义色替换 ----
        # Red → error/destructive
        {"name": "text-red-600", "pattern": r'text-red-600(?!\d)', "replacement": 'text-error', "description": "红色文字 → error", "priority": 10},
        {"name": "text-red-500", "pattern": r'text-red-500(?!\d)', "replacement": 'text-error', "description": "红色文字 → error", "priority": 10},
        {"name": "text-red-400", "pattern": r'text-red-400(?!\d)', "replacement": 'text-error', "description": "红色文字 → error", "priority": 10},
        {"name": "bg-red-50", "pattern": r'bg-red-50(?!\d)', "replacement": 'bg-error/10', "description": "红色背景 → error/10", "priority": 10},
        {"name": "bg-red-500", "pattern": r'bg-red-500(?!\d)', "replacement": 'bg-error', "description": "红色背景 → error", "priority": 10},
        {"name": "bg-red-600", "pattern": r'bg-red-600(?!\d)', "replacement": 'bg-error', "description": "红色背景 → error", "priority": 10},
        {"name": "border-red-200", "pattern": r'border-red-200', "replacement": 'border-error/30', "description": "红色边框 → error/30", "priority": 10},
        {"name": "hover:text-red-700", "pattern": r'hover:text-red-700', "replacement": 'hover:text-error', "description": "红色hover → error", "priority": 10},
        {"name": "hover:bg-red-50", "pattern": r'hover:bg-red-50', "replacement": 'hover:bg-error/10', "description": "红色hover背景 → error/10", "priority": 10},

        # Green → success/status-selling
        {"name": "text-green-600", "pattern": r'text-green-600(?!\d)', "replacement": 'text-success', "description": "绿色文字 → success", "priority": 10},
        {"name": "text-green-500", "pattern": r'text-green-500(?!\d)', "replacement": 'text-success', "description": "绿色文字 → success", "priority": 10},
        {"name": "bg-green-50", "pattern": r'bg-green-50(?!\d)', "replacement": 'bg-success/10', "description": "绿色背景 → success/10", "priority": 10},
        {"name": "bg-green-500", "pattern": r'bg-green-500(?!\d)', "replacement": 'bg-success', "description": "绿色背景 → success", "priority": 10},
        {"name": "bg-green-600", "pattern": r'bg-green-600(?!\d)', "replacement": 'bg-success', "description": "绿色背景 → success", "priority": 10},

        # Emerald → status-selling
        {"name": "text-emerald-600", "pattern": r'text-emerald-600(?!\d)', "replacement": 'text-status-selling', "description": "翠绿文字 → status-selling", "priority": 10},
        {"name": "text-emerald-500", "pattern": r'text-emerald-500(?!\d)', "replacement": 'text-status-selling', "description": "翠绿文字 → status-selling", "priority": 10},
        {"name": "bg-emerald-50", "pattern": r'bg-emerald-50(?!\d)', "replacement": 'bg-status-selling/10', "description": "翠绿背景 → status-selling/10", "priority": 10},
        {"name": "bg-emerald-500", "pattern": r'bg-emerald-500(?!\d)', "replacement": 'bg-status-selling', "description": "翠绿背景 → status-selling", "priority": 10},
        {"name": "bg-emerald-600", "pattern": r'bg-emerald-600(?!\d)', "replacement": 'bg-status-selling', "description": "翠绿背景 → status-selling", "priority": 10},
        {"name": "border-emerald-500", "pattern": r'border-emerald-500(?!\d)', "replacement": 'border-status-selling', "description": "翠绿边框 → status-selling", "priority": 10},
        {"name": "hover:bg-emerald-50", "pattern": r'hover:bg-emerald-50', "replacement": 'hover:bg-status-selling/10', "description": "翠绿hover → status-selling/10", "priority": 10},
        {"name": "focus:ring-emerald-500", "pattern": r'focus:ring-emerald-500', "replacement": 'focus:ring-status-selling', "description": "翠绿聚焦 → status-selling", "priority": 10},

        # Amber → status-pending
        {"name": "text-amber-600", "pattern": r'text-amber-600(?!\d)', "replacement": 'text-status-pending', "description": "琥珀文字 → status-pending", "priority": 10},
        {"name": "text-amber-500", "pattern": r'text-amber-500(?!\d)', "replacement": 'text-status-pending', "description": "琥珀文字 → status-pending", "priority": 10},
        {"name": "bg-amber-50", "pattern": r'bg-amber-50(?!\d)', "replacement": 'bg-status-pending/10', "description": "琥珀背景 → status-pending/10", "priority": 10},
        {"name": "bg-amber-500", "pattern": r'bg-amber-500(?!\d)', "replacement": 'bg-status-pending', "description": "琥珀背景 → status-pending", "priority": 10},
        {"name": "border-amber-200", "pattern": r'border-amber-200', "replacement": 'border-status-pending/30', "description": "琥珀边框 → status-pending/30", "priority": 10},
        {"name": "hover:bg-amber-50", "pattern": r'hover:bg-amber-50', "replacement": 'hover:bg-status-pending/10', "description": "琥珀hover → status-pending/10", "priority": 10},

        # Orange → status-renovating
        {"name": "text-orange-600", "pattern": r'text-orange-600(?!\d)', "replacement": 'text-status-renovating', "description": "橙色文字 → status-renovating", "priority": 10},
        {"name": "text-orange-500", "pattern": r'text-orange-500(?!\d)', "replacement": 'text-status-renovating', "description": "橙色文字 → status-renovating", "priority": 10},
        {"name": "bg-orange-50", "pattern": r'bg-orange-50(?!\d)', "replacement": 'bg-status-renovating/10', "description": "橙色背景 → status-renovating/10", "priority": 10},
        {"name": "bg-orange-500", "pattern": r'bg-orange-500(?!\d)', "replacement": 'bg-status-renovating', "description": "橙色背景 → status-renovating", "priority": 10},
        {"name": "bg-orange-600", "pattern": r'bg-orange-600(?!\d)', "replacement": 'bg-status-renovating', "description": "橙色背景 → status-renovating", "priority": 10},

        # Gray → muted
        {"name": "text-gray-600", "pattern": r'text-gray-600(?!\d)', "replacement": 'text-muted-foreground', "description": "灰色文字 → muted-foreground", "priority": 10},
        {"name": "text-gray-500", "pattern": r'text-gray-500(?!\d)', "replacement": 'text-muted-foreground', "description": "灰色文字 → muted-foreground", "priority": 10},
        {"name": "text-gray-400", "pattern": r'text-gray-400(?!\d)', "replacement": 'text-muted-foreground', "description": "灰色文字 → muted-foreground", "priority": 10},
        {"name": "bg-gray-50", "pattern": r'bg-gray-50(?!\d)', "replacement": 'bg-muted', "description": "灰色背景 → muted", "priority": 10},
        {"name": "bg-gray-100", "pattern": r'bg-gray-100(?!\d)', "replacement": 'bg-muted', "description": "灰色背景 → muted", "priority": 10},
        {"name": "border-gray-200", "pattern": r'border-gray-200', "replacement": 'border-border', "description": "灰色边框 → border", "priority": 10},
        {"name": "border-gray-300", "pattern": r'border-gray-300', "replacement": 'border-border', "description": "灰色边框 → border", "priority": 10},

        # ---- 清理孤立的 dark: 前缀 ----
        {"name": "dark:hover:bg-slate-700", "pattern": r'dark:hover:bg-slate-700(/\d+)?', "replacement": 'dark:hover:bg-muted', "description": "dark:hover slate → muted", "priority": 20},
        {"name": "dark:hover:bg-slate-800", "pattern": r'dark:hover:bg-slate-800(/\d+)?', "replacement": 'dark:hover:bg-card', "description": "dark:hover slate → card", "priority": 20},
    ]

    # 文件扩展名
    TARGET_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js"}

    def __init__(self, project_root: Path, target_path: Path = None):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.rules: List[ReplacementRule] = []
        self.changes: List[FileChange] = []
        self.stats: Dict[str, int] = defaultdict(int)
        self.file_counts: Dict[Path, int] = defaultdict(int)
        self._compile_rules()

    def _compile_rules(self):
        for r in self.PHASE2_RULES:
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
            return [self.target_path]
        files = []
        for ext in ["*.tsx", "*.ts", "*.jsx", "*.js"]:
            files.extend(self.target_path.rglob(ext))
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
        print(f"📋 启用 Phase 2 规则: {len(self.rules)} 条\n")

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
        print(f"📊 Phase 2 配色整改报告 {mode}")
        print(f"{'='*70}")
        print(f"总文件数: {total}")
        print(f"变更文件: {modified}")
        print(f"总替换次数: {len(self.changes)}")

        if self.stats:
            print(f"\n📈 规则替换统计:")
            for name, count in sorted(self.stats.items(), key=lambda x: -x[1])[:20]:
                desc = next((r.description for r in self.rules if r.name == name), name)
                print(f"  {count:3d} 次 - {desc}")
            if len(self.stats) > 20:
                print(f"  ... 还有 {len(self.stats) - 20} 条规则")

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
    parser = argparse.ArgumentParser(description='ProFo Phase 2 配色整改脚本')
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
    print("🎨 ProFo Phase 2 配色整改\n")
    fixer = Phase2ColorFixer(project_root, target_path)
    fixer.run(dry_run=dry_run)

    if args.apply:
        print("\n✅ Phase 2 整改完成！请运行以下命令验证：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")


if __name__ == "__main__":
    main()
