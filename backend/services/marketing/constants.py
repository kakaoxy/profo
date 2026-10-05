"""营销域共享常量.

徽标与筛选窗口期的唯一事实源，三处消费点统一引用：
- public.py（C 端上新/调价徽标 resolve_listing_badges）
- aggregate.py（admin 列表/详情调价摘要 aggregate_notify_fields）
- routers/marketing/projects.py（P0-3 新上/近期调价筛选 window_start）
"""

# 上新/调价徽标与筛选窗口期（天）：published_at / 最近调价在此窗口内才视为「新上/近期调价」
BADGE_WINDOW_DAYS = 7
