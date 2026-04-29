#!/usr/bin/env python3
"""
ProFo 配色体系整改脚本 v2.0 - 全面修复硬编码颜色问题

支持替换类型：
1. Slate 色系 → 语义 token (bg-card, text-foreground, border-border 等)
2. Inline hex → 语义 token (营销组件专用色值)
3. Red/Emerald/Amber/Gray/Orange → 语义 token
4. 多蓝统一 → primary

用法：
    python fix-colors.py --help
    python fix-colors.py --dry-run                    # 预览所有变更
    python fix-colors.py --apply                      # 执行修复
    python fix-colors.py --type slate --dry-run       # 只处理 slate
    python fix-colors.py --path frontend/src/app/leads --apply
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Optional
from collections import defaultdict
from enum import Enum, auto


class FixType(Enum):
    """修复类型"""
    SLATE = auto()
    INLINE_HEX = auto()
    STATUS = auto()  # red/emerald/amber/gray/orange
    BLUE = auto()    # 多蓝统一
    ALL = auto()


@dataclass
class ReplacementRule:
    """单个替换规则"""
    name: str
    pattern: str          # 正则字符串
    replacement: str
    description: str
    flags: int = 0        # re.IGNORECASE 等
    priority: int = 100   # 数字越小优先级越高（先执行）
    fix_type: FixType = FixType.ALL
    
    # 编译后的正则（运行时填充）
    compiled_pattern: Optional[re.Pattern] = field(default=None, repr=False)


@dataclass
class FileChange:
    """记录单个文件的变更"""
    file_path: Path
    line_number: int
    original: str
    replaced: str
    rule_name: str


class ColorFixer:
    """颜色修复器 - 支持多种类型的颜色替换"""

    # ==========================================================================
    # 1. SLATE 替换规则
    # ==========================================================================
    SLATE_RULES = [
        # 组合模式（带 dark:）- 高优先级
        {"name": "bg-white-dark-slate-800", "pattern": r'bg-white\s+dark:bg-slate-800', "replacement": 'bg-card', "description": "卡片背景: bg-white dark:bg-slate-800 → bg-card", "priority": 10},
        {"name": "bg-slate-50-dark-slate-900", "pattern": r'bg-slate-50\s+dark:bg-slate-900', "replacement": 'bg-muted', "description": "次级背景: bg-slate-50 dark:bg-slate-900 → bg-muted", "priority": 10},
        {"name": "bg-slate-100-dark-slate-800", "pattern": r'bg-slate-100\s+dark:bg-slate-800', "replacement": 'bg-muted', "description": "次级背景: bg-slate-100 dark:bg-slate-800 → bg-muted", "priority": 10},
        {"name": "border-slate-200-dark-slate-700", "pattern": r'border-slate-200\s+dark:border-slate-700', "replacement": 'border-border', "description": "边框: border-slate-200 dark:border-slate-700 → border-border", "priority": 10},
        {"name": "text-slate-400-dark-slate-400", "pattern": r'text-slate-400\s+dark:text-slate-400', "replacement": 'text-muted-foreground', "description": "辅助文字: text-slate-400 dark:text-slate-400 → text-muted-foreground", "priority": 10},
        {"name": "text-slate-500-dark-slate-400", "pattern": r'text-slate-500\s+dark:text-slate-400', "replacement": 'text-muted-foreground', "description": "辅助文字: text-slate-500 dark:text-slate-400 → text-muted-foreground", "priority": 10},
        {"name": "text-slate-800-dark-white", "pattern": r'text-slate-800\s+dark:text-white', "replacement": 'text-foreground', "description": "主文字: text-slate-800 dark:text-white → text-foreground", "priority": 10},
        {"name": "text-slate-900-dark-white", "pattern": r'text-slate-900\s+dark:text-white', "replacement": 'text-foreground', "description": "主文字: text-slate-900 dark:text-white → text-foreground", "priority": 10},
        {"name": "text-slate-800-dark-slate-200", "pattern": r'text-slate-800\s+dark:text-slate-200', "replacement": 'text-foreground', "description": "主文字: text-slate-800 dark:text-slate-200 → text-foreground", "priority": 10},
        {"name": "text-slate-900-dark-slate-200", "pattern": r'text-slate-900\s+dark:text-slate-200', "replacement": 'text-foreground', "description": "主文字: text-slate-900 dark:text-slate-200 → text-foreground", "priority": 10},
        
        # 单个 slate 类
        {"name": "bg-white", "pattern": r'bg-white(?!\w)', "replacement": 'bg-card', "description": "背景: bg-white → bg-card", "priority": 20},
        {"name": "bg-slate-50", "pattern": r'bg-slate-50(?!\d)', "replacement": 'bg-muted', "description": "背景: bg-slate-50 → bg-muted", "priority": 20},
        {"name": "bg-slate-100", "pattern": r'bg-slate-100(?!\d)', "replacement": 'bg-muted', "description": "背景: bg-slate-100 → bg-muted", "priority": 20},
        {"name": "bg-slate-200", "pattern": r'bg-slate-200(?!\d)', "replacement": 'bg-muted', "description": "背景: bg-slate-200 → bg-muted", "priority": 20},
        {"name": "bg-slate-800", "pattern": r'bg-slate-800(?!\d)', "replacement": 'bg-card', "description": "背景: bg-slate-800 → bg-card (深色模式)", "priority": 20},
        {"name": "bg-slate-900", "pattern": r'bg-slate-900(?!\d)', "replacement": 'bg-card', "description": "背景: bg-slate-900 → bg-card (深色模式)", "priority": 20},
        {"name": "bg-slate-950", "pattern": r'bg-slate-950(?!\d)', "replacement": 'bg-card', "description": "背景: bg-slate-950 → bg-card (深色模式)", "priority": 20},
        
        {"name": "text-slate-400", "pattern": r'text-slate-400(?!\d)', "replacement": 'text-muted-foreground', "description": "文字: text-slate-400 → text-muted-foreground", "priority": 20},
        {"name": "text-slate-500", "pattern": r'text-slate-500(?!\d)', "replacement": 'text-muted-foreground', "description": "文字: text-slate-500 → text-muted-foreground", "priority": 20},
        {"name": "text-slate-600", "pattern": r'text-slate-600(?!\d)', "replacement": 'text-muted-foreground', "description": "文字: text-slate-600 → text-muted-foreground", "priority": 20},
        {"name": "text-slate-700", "pattern": r'text-slate-700(?!\d)', "replacement": 'text-foreground', "description": "文字: text-slate-700 → text-foreground", "priority": 20},
        {"name": "text-slate-800", "pattern": r'text-slate-800(?!\d)', "replacement": 'text-foreground', "description": "文字: text-slate-800 → text-foreground", "priority": 20},
        {"name": "text-slate-900", "pattern": r'text-slate-900(?!\d)', "replacement": 'text-foreground', "description": "文字: text-slate-900 → text-foreground", "priority": 20},
        
        {"name": "border-slate-100", "pattern": r'border-slate-100(?!\d)', "replacement": 'border-border', "description": "边框: border-slate-100 → border-border", "priority": 20},
        {"name": "border-slate-200", "pattern": r'border-slate-200(?!\d)', "replacement": 'border-border', "description": "边框: border-slate-200 → border-border", "priority": 20},
        {"name": "border-slate-300", "pattern": r'border-slate-300(?!\d)', "replacement": 'border-border', "description": "边框: border-slate-300 → border-border", "priority": 20},
        
        {"name": "divide-slate-200", "pattern": r'divide-slate-200', "replacement": 'divide-border', "description": "分割线: divide-slate-200 → divide-border", "priority": 20},
        {"name": "ring-slate-200", "pattern": r'ring-slate-200', "replacement": 'ring-border', "description": "ring: ring-slate-200 → ring-border", "priority": 20},
        
        # placeholder
        {"name": "placeholder-slate-400", "pattern": r'placeholder-slate-400', "replacement": 'placeholder:text-muted-foreground', "description": "placeholder: placeholder-slate-400 → placeholder:text-muted-foreground", "priority": 20},
        {"name": "placeholder-slate-500", "pattern": r'placeholder-slate-500', "replacement": 'placeholder:text-muted-foreground', "description": "placeholder: placeholder-slate-500 → placeholder:text-muted-foreground", "priority": 20},
        
        # 渐变
        {"name": "from-slate-100", "pattern": r'from-slate-100', "replacement": 'from-muted', "description": "渐变: from-slate-100 → from-muted", "priority": 20},
        {"name": "from-slate-800", "pattern": r'from-slate-800', "replacement": 'from-card', "description": "渐变: from-slate-800 → from-card", "priority": 20},
        {"name": "to-slate-200", "pattern": r'to-slate-200', "replacement": 'to-muted', "description": "渐变: to-slate-200 → to-muted", "priority": 20},
        {"name": "to-slate-600", "pattern": r'to-slate-600', "replacement": 'to-card', "description": "渐变: to-slate-600 → to-card", "priority": 20},
        
        # 需要移除的冗余 dark: 类
        {"name": "dark:bg-slate-800", "pattern": r'\s*dark:bg-slate-800', "replacement": '', "description": "移除冗余: dark:bg-slate-800", "priority": 30},
        {"name": "dark:bg-slate-900", "pattern": r'\s*dark:bg-slate-900', "replacement": '', "description": "移除冗余: dark:bg-slate-900", "priority": 30},
        {"name": "dark:text-slate-200", "pattern": r'\s*dark:text-slate-200', "replacement": '', "description": "移除冗余: dark:text-slate-200", "priority": 30},
        {"name": "dark:text-slate-400", "pattern": r'\s*dark:text-slate-400', "replacement": '', "description": "移除冗余: dark:text-slate-400", "priority": 30},
        {"name": "dark:border-slate-700", "pattern": r'\s*dark:border-slate-700', "replacement": '', "description": "移除冗余: dark:border-slate-700", "priority": 30},
    ]

    # ==========================================================================
    # 2. INLINE HEX 替换规则（营销组件专用）
    # ==========================================================================
    INLINE_HEX_RULES = [
        # 营销组件色值 → 语义 token
        {"name": "hex-707785-text", "pattern": r'text-\[#707785\]', "replacement": 'text-muted-foreground', "description": "营销文字: #707785 → text-muted-foreground", "priority": 10},
        {"name": "hex-707785-bg", "pattern": r'bg-\[#707785\]', "replacement": 'bg-muted', "description": "营销背景: #707785 → bg-muted", "priority": 10},
        {"name": "hex-0b1c30-text", "pattern": r'text-\[#0b1c30\]', "replacement": 'text-foreground', "description": "营销主文字: #0b1c30 → text-foreground", "priority": 10},
        {"name": "hex-ba1a1a-text", "pattern": r'text-\[#ba1a1a\]', "replacement": 'text-error', "description": "错误文字: #ba1a1a → text-error", "priority": 10},
        {"name": "hex-c0c7d6-border", "pattern": r'border-\[#c0c7d6\]/50', "replacement": 'border-border', "description": "营销边框: #c0c7d6/50 → border-border", "priority": 10},
        {"name": "hex-c0c7d6-border-30", "pattern": r'border-\[#c0c7d6\]/30', "replacement": 'border-border', "description": "营销边框: #c0c7d6/30 → border-border", "priority": 10},
        {"name": "hex-c0c7d6-border-20", "pattern": r'border-\[#c0c7d6\]/20', "replacement": 'border-border/80', "description": "营销边框: #c0c7d6/20 → border-border/80", "priority": 10},
        {"name": "hex-c0c7d6-divide", "pattern": r'divide-\[#c0c7d6\]/20', "replacement": 'divide-border', "description": "营销分割线: #c0c7d6/20 → divide-border", "priority": 10},
        {"name": "hex-e5eeff-hover", "pattern": r'hover:bg-\[#e5eeff\]', "replacement": 'hover:bg-primary/10', "description": "hover背景: #e5eeff → hover:bg-primary/10", "priority": 10},
        {"name": "hex-e5eeff-bg", "pattern": r'bg-\[#e5eeff\]', "replacement": 'bg-primary/10', "description": "背景: #e5eeff → bg-primary/10", "priority": 10},
        {"name": "hex-f8f9ff-bg", "pattern": r'bg-\[#f8f9ff\]', "replacement": 'bg-muted', "description": "背景: #f8f9ff → bg-muted", "priority": 10},
        {"name": "hex-ffddb0-bg", "pattern": r'bg-\[#ffddb0\]/30', "replacement": 'bg-status-pending/20', "description": "警告背景: #ffddb0/30 → bg-status-pending/20", "priority": 10},
        {"name": "hex-7d5400-text", "pattern": r'text-\[#7d5400\]', "replacement": 'text-status-pending', "description": "警告文字: #7d5400 → text-status-pending", "priority": 10},
    ]

    # ==========================================================================
    # 3. 状态色替换规则 (Red/Emerald/Amber/Gray/Orange)
    # ==========================================================================
    STATUS_RULES = [
        # Red → error/destructive
        {"name": "text-red-500", "pattern": r'text-red-500(?!\d)', "replacement": 'text-error', "description": "错误: text-red-500 → text-error", "priority": 10},
        {"name": "text-red-600", "pattern": r'text-red-600(?!\d)', "replacement": 'text-error', "description": "错误: text-red-600 → text-error", "priority": 10},
        {"name": "bg-red-50", "pattern": r'bg-red-50(?!\d)', "replacement": 'bg-error-container', "description": "错误背景: bg-red-50 → bg-error-container", "priority": 10},
        {"name": "bg-red-500", "pattern": r'bg-red-500(?!\d)', "replacement": 'bg-error', "description": "错误按钮: bg-red-500 → bg-error", "priority": 10},
        {"name": "bg-red-600", "pattern": r'bg-red-600(?!\d)', "replacement": 'bg-error', "description": "错误按钮: bg-red-600 → bg-error", "priority": 10},
        {"name": "border-red-200", "pattern": r'border-red-200', "replacement": 'border-error/30', "description": "错误边框: border-red-200 → border-error/30", "priority": 10},
        {"name": "border-red-800", "pattern": r'border-red-800', "replacement": 'border-error', "description": "错误边框(暗色): border-red-800 → border-error", "priority": 10},
        {"name": "hover:bg-red-50", "pattern": r'hover:bg-red-50', "replacement": 'hover:bg-error-container', "description": "错误hover: hover:bg-red-50 → hover:bg-error-container", "priority": 10},
        {"name": "hover:bg-red-900/20", "pattern": r'hover:bg-red-900/20', "replacement": 'hover:bg-error/20', "description": "错误hover(暗色): hover:bg-red-900/20 → hover:bg-error/20", "priority": 10},
        {"name": "hover:text-red-700", "pattern": r'hover:text-red-700', "replacement": 'hover:text-error', "description": "错误hover文字: hover:text-red-700 → hover:text-error", "priority": 10},
        {"name": "hover:text-red-300", "pattern": r'hover:text-red-300', "replacement": 'hover:text-error', "description": "错误hover文字(暗色): hover:text-red-300 → hover:text-error", "priority": 10},
        {"name": "dark:text-red-400", "pattern": r'dark:text-red-400', "replacement": 'dark:text-error', "description": "错误文字(暗色): dark:text-red-400 → dark:text-error", "priority": 10},
        
        # Emerald → success/status-selling
        {"name": "text-emerald-500", "pattern": r'text-emerald-500(?!\d)', "replacement": 'text-success', "description": "成功: text-emerald-500 → text-success", "priority": 10},
        {"name": "text-emerald-600", "pattern": r'text-emerald-600(?!\d)', "replacement": 'text-success', "description": "成功: text-emerald-600 → text-success", "priority": 10},
        {"name": "bg-emerald-50", "pattern": r'bg-emerald-50(?!\d)', "replacement": 'bg-success-container', "description": "成功背景: bg-emerald-50 → bg-success-container", "priority": 10},
        {"name": "bg-emerald-500", "pattern": r'bg-emerald-500(?!\d)', "replacement": 'bg-success', "description": "成功按钮: bg-emerald-500 → bg-success", "priority": 10},
        {"name": "bg-emerald-600", "pattern": r'bg-emerald-600(?!\d)', "replacement": 'bg-success', "description": "成功按钮: bg-emerald-600 → bg-success", "priority": 10},
        {"name": "hover:bg-emerald-50", "pattern": r'hover:bg-emerald-50', "replacement": 'hover:bg-success-container', "description": "成功hover: hover:bg-emerald-50 → hover:bg-success-container", "priority": 10},
        {"name": "hover:bg-emerald-700", "pattern": r'hover:bg-emerald-700', "replacement": 'hover:bg-success', "description": "成功hover: hover:bg-emerald-700 → hover:bg-success", "priority": 10},
        {"name": "focus:ring-emerald-500", "pattern": r'focus:ring-emerald-500', "replacement": 'focus:ring-success', "description": "成功聚焦: focus:ring-emerald-500 → focus:ring-success", "priority": 10},
        {"name": "border-emerald-500", "pattern": r'border-emerald-500(?!\d)', "replacement": 'border-success', "description": "成功边框: border-emerald-500 → border-success", "priority": 10},
        {"name": "dark:text-emerald-400", "pattern": r'dark:text-emerald-400', "replacement": 'dark:text-success', "description": "成功文字(暗色): dark:text-emerald-400 → dark:text-success", "priority": 10},
        
        # Amber → status-pending (警告/待处理)
        {"name": "text-amber-500", "pattern": r'text-amber-500(?!\d)', "replacement": 'text-status-pending', "description": "警告: text-amber-500 → text-status-pending", "priority": 10},
        {"name": "text-amber-600", "pattern": r'text-amber-600(?!\d)', "replacement": 'text-status-pending', "description": "警告: text-amber-600 → text-status-pending", "priority": 10},
        {"name": "bg-amber-50", "pattern": r'bg-amber-50(?!\d)', "replacement": 'bg-status-pending/10', "description": "警告背景: bg-amber-50 → bg-status-pending/10", "priority": 10},
        {"name": "bg-amber-500", "pattern": r'bg-amber-500(?!\d)', "replacement": 'bg-status-pending', "description": "警告按钮: bg-amber-500 → bg-status-pending", "priority": 10},
        {"name": "bg-amber-600", "pattern": r'bg-amber-600(?!\d)', "replacement": 'bg-status-pending', "description": "警告按钮: bg-amber-600 → bg-status-pending", "priority": 10},
        {"name": "border-amber-200", "pattern": r'border-amber-200', "replacement": 'border-status-pending/30', "description": "警告边框: border-amber-200 → border-status-pending/30", "priority": 10},
        {"name": "hover:bg-amber-50", "pattern": r'hover:bg-amber-50', "replacement": 'hover:bg-status-pending/10', "description": "警告hover: hover:bg-amber-50 → hover:bg-status-pending/10", "priority": 10},
        
        # Gray → muted (禁用/已驳回)
        {"name": "text-gray-400", "pattern": r'text-gray-400(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用: text-gray-400 → text-muted-foreground", "priority": 10},
        {"name": "text-gray-500", "pattern": r'text-gray-500(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用: text-gray-500 → text-muted-foreground", "priority": 10},
        {"name": "text-gray-600", "pattern": r'text-gray-600(?!\d)', "replacement": 'text-muted-foreground', "description": "禁用: text-gray-600 → text-muted-foreground", "priority": 10},
        {"name": "bg-gray-50", "pattern": r'bg-gray-50(?!\d)', "replacement": 'bg-muted', "description": "禁用背景: bg-gray-50 → bg-muted", "priority": 10},
        {"name": "bg-gray-100", "pattern": r'bg-gray-100(?!\d)', "replacement": 'bg-muted', "description": "禁用背景: bg-gray-100 → bg-muted", "priority": 10},
        {"name": "border-gray-200", "pattern": r'border-gray-200', "replacement": 'border-border', "description": "禁用边框: border-gray-200 → border-border", "priority": 10},
        {"name": "border-gray-300", "pattern": r'border-gray-300', "replacement": 'border-border', "description": "禁用边框: border-gray-300 → border-border", "priority": 10},
        
        # Orange → status-renovating
        {"name": "text-orange-500", "pattern": r'text-orange-500(?!\d)', "replacement": 'text-status-renovating', "description": "装修: text-orange-500 → text-status-renovating", "priority": 10},
        {"name": "text-orange-600", "pattern": r'text-orange-600(?!\d)', "replacement": 'text-status-renovating', "description": "装修: text-orange-600 → text-status-renovating", "priority": 10},
        {"name": "bg-orange-50", "pattern": r'bg-orange-50(?!\d)', "replacement": 'bg-status-renovating/10', "description": "装修背景: bg-orange-50 → bg-status-renovating/10", "priority": 10},
        {"name": "bg-orange-500", "pattern": r'bg-orange-500(?!\d)', "replacement": 'bg-status-renovating', "description": "装修按钮: bg-orange-500 → bg-status-renovating", "priority": 10},
        {"name": "bg-orange-600", "pattern": r'bg-orange-600(?!\d)', "replacement": 'bg-status-renovating', "description": "装修按钮: bg-orange-600 → bg-status-renovating", "priority": 10},
    ]

    # ==========================================================================
    # 4. 多蓝统一规则
    # ==========================================================================
    BLUE_RULES = [
        {"name": "text-blue-500", "pattern": r'text-blue-500(?!\d)', "replacement": 'text-primary', "description": "蓝色: text-blue-500 → text-primary", "priority": 10},
        {"name": "text-blue-600", "pattern": r'text-blue-600(?!\d)', "replacement": 'text-primary', "description": "蓝色: text-blue-600 → text-primary", "priority": 10},
        {"name": "bg-blue-50", "pattern": r'bg-blue-50(?!\d)', "replacement": 'bg-primary/10', "description": "蓝色背景: bg-blue-50 → bg-primary/10", "priority": 10},
        {"name": "bg-blue-100", "pattern": r'bg-blue-100(?!\d)', "replacement": 'bg-primary/10', "description": "蓝色背景: bg-blue-100 → bg-primary/10", "priority": 10},
        {"name": "bg-blue-500", "pattern": r'bg-blue-500(?!\d)', "replacement": 'bg-primary', "description": "蓝色按钮: bg-blue-500 → bg-primary", "priority": 10},
        {"name": "bg-blue-600", "pattern": r'bg-blue-600(?!\d)', "replacement": 'bg-primary', "description": "蓝色按钮: bg-blue-600 → bg-primary", "priority": 10},
        {"name": "border-blue-200", "pattern": r'border-blue-200', "replacement": 'border-primary/30', "description": "蓝色边框: border-blue-200 → border-primary/30", "priority": 10},
        {"name": "hover:bg-blue-50", "pattern": r'hover:bg-blue-50', "replacement": 'hover:bg-primary/10', "description": "蓝色hover: hover:bg-blue-50 → hover:bg-primary/10", "priority": 10},
        
        {"name": "text-indigo-500", "pattern": r'text-indigo-500(?!\d)', "replacement": 'text-primary', "description": "靛蓝: text-indigo-500 → text-primary", "priority": 10},
        {"name": "text-indigo-600", "pattern": r'text-indigo-600(?!\d)', "replacement": 'text-primary', "description": "靛蓝: text-indigo-600 → text-primary", "priority": 10},
        {"name": "bg-indigo-50", "pattern": r'bg-indigo-50(?!\d)', "replacement": 'bg-primary/10', "description": "靛蓝背景: bg-indigo-50 → bg-primary/10", "priority": 10},
        {"name": "bg-indigo-500", "pattern": r'bg-indigo-500(?!\d)', "replacement": 'bg-primary', "description": "靛蓝按钮: bg-indigo-500 → bg-primary", "priority": 10},
        {"name": "bg-indigo-600", "pattern": r'bg-indigo-600(?!\d)', "replacement": 'bg-primary', "description": "靛蓝按钮: bg-indigo-600 → bg-primary", "priority": 10},
        {"name": "border-indigo-500", "pattern": r'border-indigo-500(?!\d)', "replacement": 'border-primary', "description": "靛蓝边框: border-indigo-500 → border-primary", "priority": 10},
        {"name": "focus:ring-indigo-500", "pattern": r'focus:ring-indigo-500', "replacement": 'focus:ring-primary', "description": "靛蓝聚焦: focus:ring-indigo-500 → focus:ring-primary", "priority": 10},
    ]

    def __init__(self, project_root: Path, target_path: Path = None, fix_type: FixType = FixType.ALL):
        self.project_root = project_root
        self.target_path = target_path or project_root / "frontend" / "src"
        self.fix_type = fix_type
        self.rules: List[ReplacementRule] = []
        self.changes: List[FileChange] = []
        self.stats: Dict[str, int] = defaultdict(int)
        self.file_changes_count: Dict[Path, int] = defaultdict(int)
        
        self._compile_rules()

    def _get_rules_by_type(self) -> List[dict]:
        """根据修复类型获取规则列表"""
        rules = []
        
        if self.fix_type in (FixType.SLATE, FixType.ALL):
            for r in self.SLATE_RULES:
                r_copy = r.copy()
                r_copy["fix_type"] = FixType.SLATE
                rules.append(r_copy)
                
        if self.fix_type in (FixType.INLINE_HEX, FixType.ALL):
            for r in self.INLINE_HEX_RULES:
                r_copy = r.copy()
                r_copy["fix_type"] = FixType.INLINE_HEX
                rules.append(r_copy)
                
        if self.fix_type in (FixType.STATUS, FixType.ALL):
            for r in self.STATUS_RULES:
                r_copy = r.copy()
                r_copy["fix_type"] = FixType.STATUS
                rules.append(r_copy)
                
        if self.fix_type in (FixType.BLUE, FixType.ALL):
            for r in self.BLUE_RULES:
                r_copy = r.copy()
                r_copy["fix_type"] = FixType.BLUE
                rules.append(r_copy)
        
        # 按优先级排序
        rules.sort(key=lambda x: x.get("priority", 100))
        return rules

    def _compile_rules(self) -> None:
        """编译正则规则"""
        raw_rules = self._get_rules_by_type()
        
        for r in raw_rules:
            try:
                compiled = re.compile(r["pattern"], r.get("flags", 0))
                self.rules.append(ReplacementRule(
                    name=r["name"],
                    pattern=r["pattern"],
                    replacement=r["replacement"],
                    description=r["description"],
                    flags=r.get("flags", 0),
                    priority=r.get("priority", 100),
                    fix_type=r.get("fix_type", FixType.ALL),
                    compiled_pattern=compiled
                ))
            except re.error as e:
                print(f"⚠️  规则编译失败 '{r['name']}': {e}")

    def find_target_files(self) -> List[Path]:
        """查找所有目标文件 (tsx, ts, jsx, js)"""
        if self.target_path.is_file():
            return [self.target_path]

        files = []
        for ext in ["*.tsx", "*.ts", "*.jsx", "*.js"]:
            files.extend(self.target_path.rglob(ext))
        return sorted(files)

    def _clean_classname_spaces(self, line: str) -> str:
        """清理 className 内部的多个连续空格"""
        def fix_match(match):
            classes = match.group(1).split()
            return f'className="{" ".join(classes)}"'
        return re.sub(r'className="([^"]*)"', fix_match, line)

    def _clean_cn_function(self, line: str) -> str:
        """清理 cn() 函数内部的多个连续空格"""
        def fix_match(match):
            content = match.group(1)
            # 处理多行拼接的情况
            lines = content.split('\n')
            cleaned_lines = []
            for l in lines:
                classes = l.split()
                cleaned_lines.append(' '.join(classes))
            return f'cn("{" ".join(cleaned_lines)}")'
        return re.sub(r'cn\("([^"]*)"\)', fix_match, line)

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
                if rule.compiled_pattern is None:
                    continue
                    
                # 使用正则替换
                new_line, count = rule.compiled_pattern.subn(rule.replacement, modified_line)
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

            # 清理多余空格
            modified_line = self._clean_classname_spaces(modified_line)
            modified_lines.append(modified_line)

        # 重建文件内容
        new_content = '\n'.join(modified_lines)

        if new_content != original_content:
            self.changes.extend(file_changes)
            self.file_changes_count[file_path] = len(file_changes)
            if not dry_run:
                file_path.write_text(new_content, encoding='utf-8')
            return True

        return False

    def run(self, dry_run: bool = True) -> None:
        """运行修复流程"""
        files = self.find_target_files()
        print(f"📁 扫描目录: {self.target_path}")
        print(f"📄 找到 {len(files)} 个目标文件")
        print(f"🔧 修复类型: {self.fix_type.name}")
        print(f"📋 启用规则: {len(self.rules)} 条\n")

        modified_count = 0
        for file_path in files:
            if self.process_file(file_path, dry_run):
                modified_count += 1
                if dry_run:
                    change_count = self.file_changes_count.get(file_path, 0)
                    print(f"  📝 {file_path.relative_to(self.project_root)} ({change_count} 处)")

        # 输出统计
        self._print_report(dry_run, len(files), modified_count)

    def _print_report(self, dry_run: bool, total_files: int, modified_files: int) -> None:
        """打印报告"""
        mode = "【预览模式】" if dry_run else "【执行模式】"
        print(f"\n{'='*70}")
        print(f"📊 颜色修复报告 {mode}")
        print(f"{'='*70}")
        print(f"总文件数: {total_files}")
        print(f"变更文件: {modified_files}")
        print(f"总替换次数: {len(self.changes)}")

        if self.stats:
            print(f"\n📈 各规则替换次数:")
            # 按 fix_type 分组
            slate_stats = [(n, c) for n, c in self.stats.items() if any(r.name == n and r.fix_type == FixType.SLATE for r in self.rules)]
            hex_stats = [(n, c) for n, c in self.stats.items() if any(r.name == n and r.fix_type == FixType.INLINE_HEX for r in self.rules)]
            status_stats = [(n, c) for n, c in self.stats.items() if any(r.name == n and r.fix_type == FixType.STATUS for r in self.rules)]
            blue_stats = [(n, c) for n, c in self.stats.items() if any(r.name == n and r.fix_type == FixType.BLUE for r in self.rules)]
            
            if slate_stats:
                print("\n  [Slate 色系]")
                for rule_name, count in sorted(slate_stats, key=lambda x: -x[1]):
                    desc = next((r.description for r in self.rules if r.name == rule_name), rule_name)
                    print(f"    {count:3d} 次 - {desc}")
                    
            if hex_stats:
                print("\n  [Inline Hex]")
                for rule_name, count in sorted(hex_stats, key=lambda x: -x[1]):
                    desc = next((r.description for r in self.rules if r.name == rule_name), rule_name)
                    print(f"    {count:3d} 次 - {desc}")
                    
            if status_stats:
                print("\n  [状态色]")
                for rule_name, count in sorted(status_stats, key=lambda x: -x[1]):
                    desc = next((r.description for r in self.rules if r.name == rule_name), rule_name)
                    print(f"    {count:3d} 次 - {desc}")
                    
            if blue_stats:
                print("\n  [多蓝统一]")
                for rule_name, count in sorted(blue_stats, key=lambda x: -x[1]):
                    desc = next((r.description for r in self.rules if r.name == rule_name), rule_name)
                    print(f"    {count:3d} 次 - {desc}")

        if dry_run and self.changes:
            print(f"\n📝 变更详情 (前 15 条):")
            for change in self.changes[:15]:
                rel_path = change.file_path.relative_to(self.project_root)
                print(f"\n  {rel_path}:{change.line_number}")
                print(f"    - {change.original[:70]}...")
                print(f"    + {change.replaced[:70]}...")

            if len(self.changes) > 15:
                print(f"\n  ... 还有 {len(self.changes) - 15} 处变更")

        if dry_run:
            print(f"\n💡 这是预览模式，使用 --apply 参数执行实际修改")
            print(f"   或运行: python fix-colors.py --apply")


def parse_fix_type(type_str: str) -> FixType:
    """解析修复类型"""
    type_map = {
        "slate": FixType.SLATE,
        "inline-hex": FixType.INLINE_HEX,
        "hex": FixType.INLINE_HEX,
        "status": FixType.STATUS,
        "blue": FixType.BLUE,
        "all": FixType.ALL,
    }
    return type_map.get(type_str.lower(), FixType.ALL)


def main():
    parser = argparse.ArgumentParser(
        description='ProFo 配色体系整改脚本 v2.0 - 全面修复硬编码颜色',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python fix-colors.py --dry-run                    # 预览所有变更
  python fix-colors.py --apply                      # 执行所有修复
  python fix-colors.py --type slate --dry-run       # 只预览 slate 修复
  python fix-colors.py --type hex --apply           # 只执行 inline hex 修复
  python fix-colors.py --type status --apply        # 只执行状态色修复
  python fix-colors.py --path frontend/src/app/leads --apply

修复类型:
  slate       - 替换 slate-* 为语义 token
  hex         - 替换 inline hex (#707785 等) 为语义 token
  status      - 替换 red/emerald/amber/gray/orange 为语义 token
  blue        - 统一 blue/indigo 为 primary
  all         - 执行所有修复（默认）
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
        '--type', '-t',
        type=str,
        default='all',
        choices=['slate', 'hex', 'inline-hex', 'status', 'blue', 'all'],
        help='指定修复类型 (默认: all)'
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
    fix_type = parse_fix_type(args.type)

    print("🎨 ProFo 配色体系整改脚本 v2.0\n")
    
    fixer = ColorFixer(project_root, target_path, fix_type)
    fixer.run(dry_run=dry_run)

    if args.apply:
        print("\n✅ 修复完成！")
        print("⚠️  请运行以下命令验证修改：")
        print("   cd frontend && pnpm exec tsc --noEmit")
        print("   pnpm lint")
        print("\n💡 提示：如果发现样式问题，可以使用 git 回滚：")
        print("   git checkout -- frontend/src")


if __name__ == "__main__":
    main()
