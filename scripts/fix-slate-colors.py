#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 - 自动修复 slate 滥用问题

根据整改报告 Phase 2 的替换规则：
1. bg-white dark:bg-slate-800 → bg-card
2. bg-slate-50 dark:bg-slate-900 → bg-muted
3. text-slate-400/500 + dark:text-slate-400 → text-muted-foreground
4. text-slate-800/900 + dark:text-white/slate-200 → text-foreground
5. border-slate-200 dark:border-slate-700 → border-border

用法：
    python fix-slate-colors.py --dry-run  # 预览变更
    python fix-slate-colors.py            # 执行修复
    python fix-slate-colors.py --path frontend/src/app/(main)/leads  # 只处理特定目录
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Dict
from collections import defaultdict


@dataclass
class ReplacementRule:
    """单个替换规则"""
    name: str
    pattern: re.Pattern
    replacement: str
    description: str


@dataclass
class FileChange:
    """记录单个文件的变更"""
    file_path: Path
    line_number: int
    original: str
    replaced: str
    rule_name: str


class SlateColorFixer:
    """Slate 颜色修复器"""

    # 定义替换规则（按优先级排序，先匹配更具体的模式）
    REPLACEMENTS = [
        # === 背景色替换 ===
        {
            "name": "bg-white-dark-slate-800",
            "pattern": r'bg-white\s+dark:bg-slate-800',
            "replacement": 'bg-card',
            "description": "卡片背景: bg-white dark:bg-slate-800 → bg-card"
        },
        {
            "name": "bg-slate-50-dark-slate-900",
            "pattern": r'bg-slate-50\s+dark:bg-slate-900',
            "replacement": 'bg-muted',
            "description": "次级背景: bg-slate-50 dark:bg-slate-900 → bg-muted"
        },
        {
            "name": "bg-slate-100-dark-slate-800",
            "pattern": r'bg-slate-100\s+dark:bg-slate-800',
            "replacement": 'bg-muted',
            "description": "次级背景: bg-slate-100 dark:bg-slate-800 → bg-muted"
        },

        # === 边框色替换 ===
        {
            "name": "border-slate-200-dark-slate-700",
            "pattern": r'border-slate-200\s+dark:border-slate-700',
            "replacement": 'border-border',
            "description": "边框: border-slate-200 dark:border-slate-700 → border-border"
        },
        {
            "name": "border-slate-300",
            "pattern": r'border-slate-300(?!\d)',
            "replacement": 'border-border',
            "description": "边框: border-slate-300 → border-border"
        },
        {
            "name": "divide-slate-200",
            "pattern": r'divide-slate-200',
            "replacement": 'divide-border',
            "description": "分割线: divide-slate-200 → divide-border"
        },

        # === 文字色替换 - 辅助文字 ===
        {
            "name": "text-slate-400-dark-slate-400",
            "pattern": r'text-slate-400\s+dark:text-slate-400',
            "replacement": 'text-muted-foreground',
            "description": "辅助文字: text-slate-400 dark:text-slate-400 → text-muted-foreground"
        },
        {
            "name": "text-slate-500-dark-slate-400",
            "pattern": r'text-slate-500\s+dark:text-slate-400',
            "replacement": 'text-muted-foreground',
            "description": "辅助文字: text-slate-500 dark:text-slate-400 → text-muted-foreground"
        },
        {
            "name": "text-slate-400",
            "pattern": r'text-slate-400(?!\d)',
            "replacement": 'text-muted-foreground',
            "description": "辅助文字: text-slate-400 → text-muted-foreground"
        },
        {
            "name": "text-slate-500",
            "pattern": r'text-slate-500(?!\d)',
            "replacement": 'text-muted-foreground',
            "description": "辅助文字: text-slate-500 → text-muted-foreground"
        },
        {
            "name": "text-slate-600",
            "pattern": r'text-slate-600(?!\d)',
            "replacement": 'text-muted-foreground',
            "description": "辅助文字: text-slate-600 → text-muted-foreground"
        },

        # === 文字色替换 - 主文字 ===
        {
            "name": "text-slate-800-dark-white",
            "pattern": r'text-slate-800\s+dark:text-white',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-800 dark:text-white → text-foreground"
        },
        {
            "name": "text-slate-900-dark-white",
            "pattern": r'text-slate-900\s+dark:text-white',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-900 dark:text-white → text-foreground"
        },
        {
            "name": "text-slate-800-dark-slate-200",
            "pattern": r'text-slate-800\s+dark:text-slate-200',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-800 dark:text-slate-200 → text-foreground"
        },
        {
            "name": "text-slate-900-dark-slate-200",
            "pattern": r'text-slate-900\s+dark:text-slate-200',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-900 dark:text-slate-200 → text-foreground"
        },
        {
            "name": "text-slate-800",
            "pattern": r'text-slate-800(?!\d)',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-800 → text-foreground"
        },
        {
            "name": "text-slate-900",
            "pattern": r'text-slate-900(?!\d)',
            "replacement": 'text-foreground',
            "description": "主文字: text-slate-900 → text-foreground"
        },

        # === 单个 dark:bg-slate 替换 ===
        {
            "name": "dark-bg-slate-800",
            "pattern": r'dark:bg-slate-800',
            "replacement": '',
            "description": "移除冗余: dark:bg-slate-800 (需配合 bg-card)"
        },
        {
            "name": "dark-bg-slate-900",
            "pattern": r'dark:bg-slate-900',
            "replacement": '',
            "description": "移除冗余: dark:bg-slate-900 (需配合 bg-muted)"
        },

        # === 其他 slate 背景 ===
        {
            "name": "bg-slate-50",
            "pattern": r'bg-slate-50(?!\d)',
            "replacement": 'bg-muted',
            "description": "背景: bg-slate-50 → bg-muted"
        },
        {
            "name": "bg-slate-100",
            "pattern": r'bg-slate-100(?!\d)',
            "replacement": 'bg-muted',
            "description": "背景: bg-slate-100 → bg-muted"
        },
        {
            "name": "bg-slate-200",
            "pattern": r'bg-slate-200(?!\d)',
            "replacement": 'bg-muted',
            "description": "背景: bg-slate-200 → bg-muted"
        },
        {
            "name": "bg-slate-800",
            "pattern": r'bg-slate-800(?!\d)',
            "replacement": 'bg-card',
            "description": "背景: bg-slate-800 → bg-card"
        },
        {
            "name": "bg-slate-900",
            "pattern": r'bg-slate-900(?!\d)',
            "replacement": 'bg-card',
            "description": "背景: bg-slate-900 → bg-card"
        },

        # === 其他 slate 文字 ===
        {
            "name": "dark-text-slate-200",
            "pattern": r'dark:text-slate-200',
            "replacement": "",
            "description": "移除冗余: dark:text-slate-200 (需配合 text-foreground)"
        },
        {
            "name": "dark-text-slate-400",
            "pattern": r'dark:text-slate-400',
            "replacement": "",
            "description": "移除冗余: dark:text-slate-400 (需配合 text-muted-foreground)"
        },

        # === placeholder ===
        {
            "name": "placeholder-slate-400",
            "pattern": r'placeholder-slate-400',
            "replacement": 'placeholder-muted-foreground',
            "description": "placeholder: placeholder-slate-400 → placeholder-muted-foreground"
        },
        {
            "name": "placeholder-slate-500",
            "pattern": r'placeholder-slate-500',
            "replacement": 'placeholder-muted-foreground',
            "description": "placeholder: placeholder-slate-500 → placeholder-muted-foreground"
        },

        # === ring ===
        {
            "name": "ring-slate-200",
            "pattern": r'ring-slate-200',
            "replacement": 'ring-border',
            "description": "ring: ring-slate-200 → ring-border"
        },

        # === 其他常见模式 ===
        {
            "name": "from-slate-100",
            "pattern": r'from-slate-100',
            "replacement": 'from-muted',
            "description": "渐变: from-slate-100 → from-muted"
        },
        {
            "name": "to-slate-200",
            "pattern": r'to-slate-200',
            "replacement": 'to-muted',
            "description": "渐变: to-slate-200 → to-muted"
        },
    ]

    def __init__(self, project_root: Path, target_path: Path = None):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.rules = self._compile_rules()
        self.changes: List[FileChange] = []
        self.stats: Dict[str, int] = defaultdict(int)

    def _compile_rules(self) -> List[ReplacementRule]:
        """编译正则规则"""
        rules = []
        for r in self.REPLACEMENTS:
            rules.append(ReplacementRule(
                name=r["name"],
                pattern=re.compile(r["pattern"]),
                replacement=r["replacement"],
                description=r["description"]
            ))
        return rules

    def find_target_files(self) -> List[Path]:
        """查找所有目标文件 (tsx, ts)"""
        # 如果 target_path 是文件，直接返回
        if self.target_path.is_file():
            return [self.target_path]

        files = []
        for ext in ["*.tsx", "*.ts"]:
            files.extend(self.target_path.rglob(ext))
        return sorted(files)

    def process_file(self, file_path: Path, dry_run: bool = True) -> bool:
        """处理单个文件，返回是否发生变更"""
        try:
            content = file_path.read_text(encoding='utf-8')
        except Exception as e:
            print(f"  ⚠️  无法读取文件 {file_path}: {e}")
            return False

        original_content = content
        file_changes = []

        # 逐行处理以记录行号
        lines = content.split('\n')
        modified_lines = []

        for line_num, line in enumerate(lines, 1):
            original_line = line
            modified_line = line

            for rule in self.rules:
                # 使用正则替换
                new_line, count = rule.pattern.subn(rule.replacement, modified_line)
                if count > 0:
                    file_changes.append(FileChange(
                        file_path=file_path,
                        line_number=line_num,
                        original=original_line.strip(),
                        replaced=new_line.strip(),
                        rule_name=rule.name
                    ))
                    self.stats[rule.name] += count
                    modified_line = new_line

            # 清理当前行的多余空格（由移除 dark: 类引起）
            # 只清理 className 内部的多个空格
            def fix_line_classname(line):
                def fix_classname_spaces(match):
                    classes = match.group(1).split()
                    return f'className="{" ".join(classes)}"'
                return re.sub(r'className="([^"]*)"', fix_classname_spaces, line)

            modified_line = fix_line_classname(modified_line)
            modified_lines.append(modified_line)

        # 重建文件内容
        new_content = '\n'.join(modified_lines)

        if new_content != original_content:
            self.changes.extend(file_changes)
            if not dry_run:
                file_path.write_text(new_content, encoding='utf-8')
            return True

        return False

    def run(self, dry_run: bool = True) -> None:
        """运行修复流程"""
        files = self.find_target_files()
        print(f"📁 扫描目录: {self.target_path}")
        print(f"📄 找到 {len(files)} 个目标文件\n")

        modified_count = 0
        for file_path in files:
            if self.process_file(file_path, dry_run):
                modified_count += 1
                if dry_run:
                    print(f"  📝 {file_path.relative_to(self.project_root)}")

        # 输出统计
        self._print_report(dry_run, len(files), modified_count)

    def _print_report(self, dry_run: bool, total_files: int, modified_files: int) -> None:
        """打印报告"""
        mode = "【预览模式】" if dry_run else "【执行模式】"
        print(f"\n{'='*60}")
        print(f"📊 Slate 颜色修复报告 {mode}")
        print(f"{'='*60}")
        print(f"总文件数: {total_files}")
        print(f"变更文件: {modified_files}")
        print(f"总替换次数: {len(self.changes)}")

        if self.stats:
            print(f"\n📈 各规则替换次数:")
            # 按名称排序
            for rule_name in sorted(self.stats.keys()):
                count = self.stats[rule_name]
                # 找到规则描述
                desc = next((r.description for r in self.rules if r.name == rule_name), rule_name)
                print(f"  {count:3d} 次 - {desc}")

        if dry_run and self.changes:
            print(f"\n📝 变更详情 (前 20 条):")
            for change in self.changes[:20]:
                rel_path = change.file_path.relative_to(self.project_root)
                print(f"\n  {rel_path}:{change.line_number}")
                print(f"    - {change.original[:80]}...")
                print(f"    + {change.replaced[:80]}...")

            if len(self.changes) > 20:
                print(f"\n  ... 还有 {len(self.changes) - 20} 处变更")

        if dry_run:
            print(f"\n💡 这是预览模式，使用 --apply 参数执行实际修改")


def main():
    parser = argparse.ArgumentParser(
        description='ProFo 配色体系整改脚本 - 自动修复 slate 滥用',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python fix-slate-colors.py --dry-run                    # 预览所有变更
  python fix-slate-colors.py --apply                      # 执行修复
  python fix-slate-colors.py --path frontend/src/app/leads --dry-run  # 只处理特定目录
        """
    )
    parser.add_argument(
        '--dry-run', '-d',
        action='store_true',
        help='预览模式（默认）'
    )
    parser.add_argument(
        '--apply', '-a',
        action='store_true',
        help='执行实际修改'
    )
    parser.add_argument(
        '--path', '-p',
        type=str,
        help='指定要处理的目录（相对于项目根目录）'
    )

    args = parser.parse_args()

    # 确定项目根目录
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    # 确定目标路径
    if args.path:
        target_path = project_root / args.path
        if not target_path.exists():
            print(f"❌ 路径不存在: {target_path}")
            sys.exit(1)
    else:
        target_path = project_root / "frontend" / "src"

    dry_run = not args.apply

    fixer = SlateColorFixer(project_root, target_path)
    fixer.run(dry_run=dry_run)

    if args.apply:
        print("\n✅ 修复完成！")
        print("⚠️  请运行以下命令验证修改：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")


if __name__ == "__main__":
    main()
