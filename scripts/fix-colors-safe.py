#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 v3.0 - 仅安全规则
移除所有单类名 Slate 替换、Inline Hex 等有风险规则。
只保留组合模式、状态色、多蓝统一等明确语义映射。
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


class SafeColorFixer:
    # =========================================================================
    # 安全规则：仅包含明确的组合模式、辅助 token、状态色、蓝色统一
    # =========================================================================
    SAFE_RULES = [
        # ---- Slate 组合模式（明/暗成对替换） ----
        {"name": "bg-white-dark-slate-800", "pattern": r'bg-white\s+dark:bg-slate-800', "replacement": 'bg-card', "description": "卡片背景", "priority": 10},
        {"name": "bg-slate-50-dark-slate-900", "pattern": r'bg-slate-50\s+dark:bg-slate-900', "replacement": 'bg-muted', "description": "次级背景", "priority": 10},
        {"name": "bg-slate-100-dark-slate-800", "pattern": r'bg-slate-100\s+dark:bg-slate-800', "replacement": 'bg-muted', "description": "次级背景", "priority": 10},
        {"name": "border-slate-200-dark-slate-700", "pattern": r'border-slate-200\s+dark:border-slate-700', "replacement": 'border-border', "description": "边框", "priority": 10},
        {"name": "text-slate-400-dark-slate-400", "pattern": r'text-slate-400\s+dark:text-slate-400', "replacement": 'text-muted-foreground', "description": "辅助文字", "priority": 10},
        {"name": "text-slate-500-dark-slate-400", "pattern": r'text-slate-500\s+dark:text-slate-400', "replacement": 'text-muted-foreground', "description": "辅助文字", "priority": 10},
        {"name": "text-slate-800-dark-white", "pattern": r'text-slate-800\s+dark:text-white', "replacement": 'text-foreground', "description": "主文字", "priority": 10},
        {"name": "text-slate-900-dark-white", "pattern": r'text-slate-900\s+dark:text-white', "replacement": 'text-foreground', "description": "主文字", "priority": 10},
        {"name": "text-slate-800-dark-slate-200", "pattern": r'text-slate-800\s+dark:text-slate-200', "replacement": 'text-foreground', "description": "主文字", "priority": 10},
        {"name": "text-slate-900-dark-slate-200", "pattern": r'text-slate-900\s+dark:text-slate-200', "replacement": 'text-foreground', "description": "主文字", "priority": 10},

        # 辅助功能 token（无歧义）
        {"name": "placeholder-slate-400", "pattern": r'placeholder-slate-400', "replacement": 'placeholder:text-muted-foreground', "description": "placeholder", "priority": 20},
        {"name": "placeholder-slate-500", "pattern": r'placeholder-slate-500', "replacement": 'placeholder:text-muted-foreground', "description": "placeholder", "priority": 20},
        {"name": "divide-slate-200", "pattern": r'divide-slate-200', "replacement": 'divide-border', "description": "分割线", "priority": 20},
        {"name": "ring-slate-200", "pattern": r'ring-slate-200', "replacement": 'ring-border', "description": "ring", "priority": 20},

        # 移除组合替换后残留的冗余 dark: 类
        {"name": "dark:bg-slate-800", "pattern": r'\s*dark:bg-slate-800', "replacement": '', "description": "移除冗余", "priority": 30},
        {"name": "dark:bg-slate-900", "pattern": r'\s*dark:bg-slate-900', "replacement": '', "description": "移除冗余", "priority": 30},
        {"name": "dark:text-slate-200", "pattern": r'\s*dark:text-slate-200', "replacement": '', "description": "移除冗余", "priority": 30},
        {"name": "dark:text-slate-400", "pattern": r'\s*dark:text-slate-400', "replacement": '', "description": "移除冗余", "priority": 30},
        {"name": "dark:border-slate-700", "pattern": r'\s*dark:border-slate-700', "replacement": '', "description": "移除冗余", "priority": 30},

        # ---- 状态色规则（Red/Emerald/Amber/Gray/Orange） ----
        # Red → error/destructive
        {"name": "text-red-500", "pattern": r'text-red-500(?!\d)', "replacement": 'text-error', "description": "错误文字", "priority": 10},
        {"name": "text-red-600", "pattern": r'text-red-600(?!\d)', "replacement": 'text-error', "description": "错误文字", "priority": 10},
        {"name": "bg-red-50", "pattern": r'bg-red-50(?!\d)', "replacement": 'bg-error-container', "description": "错误背景(浅)", "priority": 10},
        {"name": "bg-red-500", "pattern": r'bg-red-500(?!\d)', "replacement": 'bg-error', "description": "错误背景(按钮)", "priority": 10},
        {"name": "bg-red-600", "pattern": r'bg-red-600(?!\d)', "replacement": 'bg-error', "description": "错误背景(按钮)", "priority": 10},
        {"name": "border-red-200", "pattern": r'border-red-200', "replacement": 'border-error/30', "description": "错误边框", "priority": 10},
        {"name": "border-red-800", "pattern": r'border-red-800', "replacement": 'border-error', "description": "错误边框(暗色)", "priority": 10},
        {"name": "hover:bg-red-50", "pattern": r'hover:bg-red-50', "replacement": 'hover:bg-error-container', "description": "错误hover", "priority": 10},
        {"name": "hover:bg-red-900/20", "pattern": r'hover:bg-red-900/20', "replacement": 'hover:bg-error/20', "description": "错误hover(暗色)", "priority": 10},
        {"name": "hover:text-red-700", "pattern": r'hover:text-red-700', "replacement": 'hover:text-error', "description": "错误hover文字", "priority": 10},
        {"name": "hover:text-red-300", "pattern": r'hover:text-red-300', "replacement": 'hover:text-error', "description": "错误hover文字(暗色)", "priority": 10},
        {"name": "dark:text-red-400", "pattern": r'dark:text-red-400', "replacement": 'dark:text-error', "description": "错误文字(暗色)", "priority": 10},

        # Emerald → success
        {"name": "text-emerald-500", "pattern": r'text-emerald-500(?!\d)', "replacement": 'text-success', "description": "成功文字", "priority": 10},
        {"name": "text-emerald-600", "pattern": r'text-emerald-600(?!\d)', "replacement": 'text-success', "description": "成功文字", "priority": 10},
        {"name": "bg-emerald-50", "pattern": r'bg-emerald-50(?!\d)', "replacement": 'bg-success-container', "description": "成功背景(浅)", "priority": 10},
        {"name": "bg-emerald-500", "pattern": r'bg-emerald-500(?!\d)', "replacement": 'bg-success', "description": "成功背景(按钮)", "priority": 10},
        {"name": "bg-emerald-600", "pattern": r'bg-emerald-600(?!\d)', "replacement": 'bg-success', "description": "成功背景(按钮)", "priority": 10},
        {"name": "hover:bg-emerald-50", "pattern": r'hover:bg-emerald-50', "replacement": 'hover:bg-success-container', "description": "成功hover", "priority": 10},
        {"name": "hover:bg-emerald-700", "pattern": r'hover:bg-emerald-700', "replacement": 'hover:bg-success', "description": "成功hover", "priority": 10},
        {"name": "focus:ring-emerald-500", "pattern": r'focus:ring-emerald-500', "replacement": 'focus:ring-success', "description": "成功聚焦", "priority": 10},
        {"name": "border-emerald-500", "pattern": r'border-emerald-500(?!\d)', "replacement": 'border-success', "description": "成功边框", "priority": 10},
        {"name": "dark:text-emerald-400", "pattern": r'dark:text-emerald-400', "replacement": 'dark:text-success', "description": "成功文字(暗色)", "priority": 10},

        # Amber → status-pending (警告/待处理)
        {"name": "text-amber-500", "pattern": r'text-amber-500(?!\d)', "replacement": 'text-status-pending', "description": "警告文字", "priority": 10},
        {"name": "text-amber-600", "pattern": r'text-amber-600(?!\d)', "replacement": 'text-status-pending', "description": "警告文字", "priority": 10},
        {"name": "bg-amber-50", "pattern": r'bg-amber-50(?!\d)', "replacement": 'bg-status-pending/10', "description": "警告背景(浅)", "priority": 10},
        {"name": "bg-amber-500", "pattern": r'bg-amber-500(?!\d)', "replacement": 'bg-status-pending', "description": "警告背景(按钮)", "priority": 10},
        {"name": "bg-amber-600", "pattern": r'bg-amber-600(?!\d)', "replacement": 'bg-status-pending', "description": "警告背景(按钮)", "priority": 10},
        {"name": "border-amber-200", "pattern": r'border-amber-200', "replacement": 'border-status-pending/30', "description": "警告边框", "priority": 10},
        {"name": "hover:bg-amber-50", "pattern": r'hover:bg-amber-50', "replacement": 'hover:bg-status-pending/10', "description": "警告hover", "priority": 10},

        # Gray → muted (禁用/已驳回) —— 注意：可能会合并灰色层次，但语义统一合理
        {"name": "text-gray-400", "pattern": r'text-gray-400(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用文字", "priority": 10},
        {"name": "text-gray-500", "pattern": r'text-gray-500(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用文字", "priority": 10},
        {"name": "text-gray-600", "pattern": r'text-gray-600(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用文字", "priority": 10},
        {"name": "bg-gray-50", "pattern": r'bg-gray-50(?!\d)', "replacement": 'bg-muted', "description": "禁用背景", "priority": 10},
        {"name": "bg-gray-100", "pattern": r'bg-gray-100(?!\d)', "replacement": 'bg-muted', "description": "禁用背景", "priority": 10},
        {"name": "border-gray-200", "pattern": r'border-gray-200', "replacement": 'border-border', "description": "禁用边框", "priority": 10},
        {"name": "border-gray-300", "pattern": r'border-gray-300', "replacement": 'border-border', "description": "禁用边框", "priority": 10},

        # Orange → status-renovating
        {"name": "text-orange-500", "pattern": r'text-orange-500(?!\d)', "replacement": 'text-status-renovating', "description": "装修文字", "priority": 10},
        {"name": "text-orange-600", "pattern": r'text-orange-600(?!\d)', "replacement": 'text-status-renovating', "description": "装修文字", "priority": 10},
        {"name": "bg-orange-50", "pattern": r'bg-orange-50(?!\d)', "replacement": 'bg-status-renovating/10', "description": "装修背景(浅)", "priority": 10},
        {"name": "bg-orange-500", "pattern": r'bg-orange-500(?!\d)', "replacement": 'bg-status-renovating', "description": "装修背景(按钮)", "priority": 10},
        {"name": "bg-orange-600", "pattern": r'bg-orange-600(?!\d)', "replacement": 'bg-status-renovating', "description": "装修背景(按钮)", "priority": 10},

        # ---- 蓝色系统一（blue/indigo → primary） ----
        {"name": "text-blue-500", "pattern": r'text-blue-500(?!\d)', "replacement": 'text-primary', "description": "蓝色文字", "priority": 10},
        {"name": "text-blue-600", "pattern": r'text-blue-600(?!\d)', "replacement": 'text-primary', "description": "蓝色文字", "priority": 10},
        {"name": "bg-blue-50", "pattern": r'bg-blue-50(?!\d)', "replacement": 'bg-primary/10', "description": "蓝色背景(浅)", "priority": 10},
        {"name": "bg-blue-100", "pattern": r'bg-blue-100(?!\d)', "replacement": 'bg-primary/10', "description": "蓝色背景(浅)", "priority": 10},
        {"name": "bg-blue-500", "pattern": r'bg-blue-500(?!\d)', "replacement": 'bg-primary', "description": "蓝色按钮", "priority": 10},
        {"name": "bg-blue-600", "pattern": r'bg-blue-600(?!\d)', "replacement": 'bg-primary', "description": "蓝色按钮", "priority": 10},
        {"name": "border-blue-200", "pattern": r'border-blue-200', "replacement": 'border-primary/30', "description": "蓝色边框", "priority": 10},
        {"name": "hover:bg-blue-50", "pattern": r'hover:bg-blue-50', "replacement": 'hover:bg-primary/10', "description": "蓝色hover", "priority": 10},

        {"name": "text-indigo-500", "pattern": r'text-indigo-500(?!\d)', "replacement": 'text-primary', "description": "靛蓝文字", "priority": 10},
        {"name": "text-indigo-600", "pattern": r'text-indigo-600(?!\d)', "replacement": 'text-primary', "description": "靛蓝文字", "priority": 10},
        {"name": "bg-indigo-50", "pattern": r'bg-indigo-50(?!\d)', "replacement": 'bg-primary/10', "description": "靛蓝背景(浅)", "priority": 10},
        {"name": "bg-indigo-500", "pattern": r'bg-indigo-500(?!\d)', "replacement": 'bg-primary', "description": "靛蓝按钮", "priority": 10},
        {"name": "bg-indigo-600", "pattern": r'bg-indigo-600(?!\d)', "replacement": 'bg-primary', "description": "靛蓝按钮", "priority": 10},
        {"name": "border-indigo-500", "pattern": r'border-indigo-500(?!\d)', "replacement": 'border-primary', "description": "靛蓝边框", "priority": 10},
        {"name": "focus:ring-indigo-500", "pattern": r'focus:ring-indigo-500', "replacement": 'focus:ring-primary', "description": "靛蓝聚焦", "priority": 10},
    ]

    # 文件扩展名
    VUE_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js"}

    def __init__(self, project_root: Path, target_path: Path = None):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.rules: List[ReplacementRule] = []
        self.changes = []
        self.stats: Dict[str, int] = defaultdict(int)
        self.file_counts: Dict[Path, int] = defaultdict(int)
        self._compile_rules()

    def _compile_rules(self):
        for r in self.SAFE_RULES:
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

    def run(self, dry_run: bool = True):
        files = self.find_target_files()
        print(f"📁 扫描目录: {self.target_path}")
        print(f"📄 找到 {len(files)} 个目标文件")
        print(f"📋 启用安全规则: {len(self.rules)} 条\n")

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
        print(f"📊 安全规则修复报告 {mode}")
        print(f"{'='*70}")
        print(f"总文件数: {total}")
        print(f"变更文件: {modified}")
        print(f"总替换次数: {len(self.changes)}")
        if self.stats:
            print(f"\n📈 规则替换次数:")
            for name, count in sorted(self.stats.items(), key=lambda x: -x[1]):
                desc = next((r.description for r in self.rules if r.name == name), name)
                print(f"  {count:3d} 次 - {desc}")
        if dry_run and self.changes:
            print(f"\n📝 变更详情 (前 15 条):")
            for change in self.changes[:15]:
                rel = change.file_path.relative_to(self.project_root)
                print(f"\n  {rel}:{change.line_number}")
                print(f"    - {change.original[:70]}...")
                print(f"    + {change.replaced[:70]}...")
            if len(self.changes) > 15:
                print(f"\n  ... 还有 {len(self.changes) - 15} 处")
        if dry_run:
            print(f"\n💡 使用 --apply 执行实际修改")

@dataclass
class FileChange:
    file_path: Path
    line_number: int
    original: str
    replaced: str
    rule_name: str

def main():
    parser = argparse.ArgumentParser(description='ProFo 安全颜色替换脚本')
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
    print("🎨 ProFo 安全颜色替换\n")
    fixer = SafeColorFixer(project_root, target_path)
    fixer.run(dry_run=dry_run)

    if args.apply:
        print("\n✅ 安全规则替换完成！请运行以下命令验证：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")

if __name__ == "__main__":
    main()