#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 v4.0 - 修复剩余 Slate/语义颜色硬编码
用于修复报告中指出的剩余 slate 硬编码和语义颜色问题。
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


class RemainingColorFixer:
    # =========================================================================
    # Slate 硬编码规则（单类名替换）
    # =========================================================================
    SLATE_RULES = [
        # Slate 文字色
        {"name": "text-slate-400", "pattern": r'text-slate-400', "replacement": 'text-muted-foreground', "description": "Slate文字 -> muted文字", "priority": 10},
        {"name": "text-slate-500", "pattern": r'text-slate-500', "replacement": 'text-muted-foreground', "description": "Slate文字 -> muted文字", "priority": 10},
        {"name": "text-slate-600", "pattern": r'text-slate-600', "replacement": 'text-muted-foreground', "description": "Slate文字 -> muted文字", "priority": 10},
        {"name": "text-slate-700", "pattern": r'text-slate-700', "replacement": 'text-foreground', "description": "Slate主文字 -> foreground", "priority": 10},
        {"name": "text-slate-800", "pattern": r'text-slate-800', "replacement": 'text-foreground', "description": "Slate主文字 -> foreground", "priority": 10},
        {"name": "text-slate-900", "pattern": r'text-slate-900', "replacement": 'text-foreground', "description": "Slate主文字 -> foreground", "priority": 10},
        
        # Slate 背景色
        {"name": "bg-slate-50", "pattern": r'bg-slate-50', "replacement": 'bg-muted', "description": "Slate背景 -> muted", "priority": 10},
        {"name": "bg-slate-100", "pattern": r'bg-slate-100', "replacement": 'bg-muted', "description": "Slate背景 -> muted", "priority": 10},
        {"name": "bg-slate-200", "pattern": r'bg-slate-200', "replacement": 'bg-muted', "description": "Slate背景 -> muted", "priority": 10},
        {"name": "bg-slate-800", "pattern": r'bg-slate-800', "replacement": 'bg-card', "description": "Slate暗背景 -> card", "priority": 10},
        {"name": "bg-slate-900", "pattern": r'bg-slate-900', "replacement": 'bg-card', "description": "Slate暗背景 -> card", "priority": 10},
        {"name": "bg-white", "pattern": r'(?<![a-zA-Z-])bg-white(?![a-zA-Z-])', "replacement": 'bg-card', "description": "白色背景 -> card", "priority": 10},
        
        # Slate 边框色
        {"name": "border-slate-100", "pattern": r'border-slate-100', "replacement": 'border-border', "description": "Slate边框 -> border", "priority": 10},
        {"name": "border-slate-200", "pattern": r'border-slate-200', "replacement": 'border-border', "description": "Slate边框 -> border", "priority": 10},
        {"name": "border-slate-300", "pattern": r'border-slate-300', "replacement": 'border-border', "description": "Slate边框 -> border", "priority": 10},
        
        # Slate hover状态
        {"name": "hover:bg-slate-50", "pattern": r'hover:bg-slate-50', "replacement": 'hover:bg-muted', "description": "Slate hover -> muted hover", "priority": 10},
        {"name": "hover:bg-slate-100", "pattern": r'hover:bg-slate-100', "replacement": 'hover:bg-muted', "description": "Slate hover -> muted hover", "priority": 10},
        {"name": "hover:text-slate-600", "pattern": r'hover:text-slate-600', "replacement": 'hover:text-muted-foreground', "description": "Slate hover -> muted hover", "priority": 10},
        {"name": "hover:text-slate-700", "pattern": r'hover:text-slate-700', "replacement": 'hover:text-foreground', "description": "Slate hover -> foreground hover", "priority": 10},
        
        # Slate 分割线
        {"name": "divide-slate-100", "pattern": r'divide-slate-100', "replacement": 'divide-border', "description": "Slate分割线 -> border", "priority": 10},
    ]

    # =========================================================================
    # 语义颜色规则（Red/Emerald/Amber/Orange + 700变体）
    # =========================================================================
    SEMANTIC_RULES = [
        # Red -> error
        {"name": "text-red-700", "pattern": r'text-red-700', "replacement": 'text-error', "description": "Red700文字 -> error", "priority": 10},
        {"name": "bg-red-700", "pattern": r'bg-red-700', "replacement": 'bg-error', "description": "Red700背景 -> error", "priority": 10},
        {"name": "hover:bg-red-700", "pattern": r'hover:bg-red-700', "replacement": 'hover:bg-error', "description": "Red700 hover -> error hover", "priority": 10},
        {"name": "border-red-700", "pattern": r'border-red-700', "replacement": 'border-error', "description": "Red700边框 -> error", "priority": 10},
        
        # Emerald -> success
        {"name": "text-emerald-700", "pattern": r'text-emerald-700', "replacement": 'text-success', "description": "Emerald700文字 -> success", "priority": 10},
        {"name": "bg-emerald-700", "pattern": r'bg-emerald-700', "replacement": 'bg-success', "description": "Emerald700背景 -> success", "priority": 10},
        {"name": "hover:bg-emerald-700", "pattern": r'hover:bg-emerald-700', "replacement": 'hover:bg-success', "description": "Emerald700 hover -> success hover", "priority": 10},
        {"name": "hover:text-emerald-700", "pattern": r'hover:text-emerald-700', "replacement": 'hover:text-success', "description": "Emerald700 hover文字 -> success hover", "priority": 10},
        {"name": "border-emerald-700", "pattern": r'border-emerald-700', "replacement": 'border-success', "description": "Emerald700边框 -> success", "priority": 10},
        {"name": "border-emerald-200", "pattern": r'border-emerald-200', "replacement": 'border-success/30', "description": "Emerald200边框 -> success/30", "priority": 10},
        
        # Amber -> status-pending
        {"name": "text-amber-700", "pattern": r'text-amber-700', "replacement": 'text-status-pending', "description": "Amber700文字 -> pending", "priority": 10},
        {"name": "bg-amber-700", "pattern": r'bg-amber-700', "replacement": 'bg-status-pending', "description": "Amber700背景 -> pending", "priority": 10},
        {"name": "hover:bg-amber-700", "pattern": r'hover:bg-amber-700', "replacement": 'hover:bg-status-pending', "description": "Amber700 hover -> pending hover", "priority": 10},
        {"name": "border-amber-700", "pattern": r'border-amber-700', "replacement": 'border-status-pending', "description": "Amber700边框 -> pending", "priority": 10},
        
        # Orange -> status-renovating
        {"name": "text-orange-700", "pattern": r'text-orange-700', "replacement": 'text-status-renovating', "description": "Orange700文字 -> renovating", "priority": 10},
        {"name": "bg-orange-700", "pattern": r'bg-orange-700', "replacement": 'bg-status-renovating', "description": "Orange700背景 -> renovating", "priority": 10},
        {"name": "hover:bg-orange-700", "pattern": r'hover:bg-orange-700', "replacement": 'hover:bg-status-renovating', "description": "Orange700 hover -> renovating hover", "priority": 10},
        {"name": "border-orange-700", "pattern": r'border-orange-700', "replacement": 'border-status-renovating', "description": "Orange700边框 -> renovating", "priority": 10},
        {"name": "border-orange-200", "pattern": r'border-orange-200', "replacement": 'border-status-renovating/30', "description": "Orange200边框 -> renovating/30", "priority": 10},
    ]

    # 文件扩展名
    TARGET_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js"}

    def __init__(self, project_root: Path, target_path: Path = None):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.rules: List[ReplacementRule] = []
        self.changes = []
        self.stats: Dict[str, int] = defaultdict(int)
        self.file_counts: Dict[Path, int] = defaultdict(int)
        self._compile_rules()

    def _compile_rules(self):
        all_rules = self.SLATE_RULES + self.SEMANTIC_RULES
        for r in all_rules:
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

    def run(self, dry_run: bool = True, limit: int = None):
        files = self.find_target_files()
        print(f"📁 扫描目录: {self.target_path}")
        print(f"📄 找到 {len(files)} 个目标文件")
        print(f"📋 启用规则: {len(self.rules)} 条")
        print(f"   - Slate规则: {len(self.SLATE_RULES)} 条")
        print(f"   - 语义颜色规则: {len(self.SEMANTIC_RULES)} 条\n")

        modified_count = 0
        for i, fp in enumerate(files):
            if limit and i >= limit:
                print(f"\n⏹️  已达到限制数量 {limit}，停止扫描")
                break
            if self.process_file(fp, dry_run):
                modified_count += 1
                if dry_run:
                    c = self.file_counts.get(fp, 0)
                    print(f"  📝 {fp.relative_to(self.project_root)} ({c} 处)")

        self._print_report(dry_run, len(files), modified_count)

    def _print_report(self, dry_run, total, modified):
        mode = "【预览模式】" if dry_run else "【执行模式】"
        print(f"\n{'='*70}")
        print(f"📊 颜色修复报告 {mode}")
        print(f"{'='*70}")
        print(f"总文件数: {total}")
        print(f"变更文件: {modified}")
        print(f"总替换次数: {len(self.changes)}")
        
        if self.stats:
            print(f"\n📈 规则替换次数 (前20):")
            sorted_stats = sorted(self.stats.items(), key=lambda x: -x[1])
            for name, count in sorted_stats[:20]:
                desc = next((r.description for r in self.rules if r.name == name), name)
                print(f"  {count:3d} 次 - {desc}")
            if len(sorted_stats) > 20:
                print(f"  ... 还有 {len(sorted_stats) - 20} 条规则")
                
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
            print(f"   示例: python scripts/fix-remaining-colors.py --apply")


@dataclass
class FileChange:
    file_path: Path
    line_number: int
    original: str
    replaced: str
    rule_name: str


def main():
    parser = argparse.ArgumentParser(description='ProFo 剩余颜色硬编码修复脚本')
    parser.add_argument('--dry-run', '-d', action='store_true', help='预览模式（默认）')
    parser.add_argument('--apply', '-a', action='store_true', help='执行修改')
    parser.add_argument('--path', '-p', type=str, help='指定目录或文件')
    parser.add_argument('--limit', '-l', type=int, help='限制扫描文件数量（测试用）')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    if args.path:
        target_path = project_root / args.path
    else:
        target_path = project_root / "frontend" / "src" / "app" / "(main)"
    
    if not target_path.exists():
        print(f"❌ 路径不存在: {target_path}")
        sys.exit(1)

    dry_run = not args.apply
    print("🎨 ProFo 剩余颜色硬编码修复\n")
    fixer = RemainingColorFixer(project_root, target_path)
    fixer.run(dry_run=dry_run, limit=args.limit)

    if args.apply:
        print("\n✅ 修复完成！请运行以下命令验证：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")


if __name__ == "__main__":
    main()
