"""对外文案合规词表（广告法自查报告 §6.1 机制建议）.

背景：C 端文案广告法自查报告（docs/Done/2026-10-27-C端文案广告法自查报告.md）发现
运营自由输入的房源标题/标签出现「书包房」「大师设计」「豪华装修」「质保5年」等
违反《广告法》第九条（绝对化用语）、第二十六条（房地产广告）、
《房地产广告发布规定》第十八条（升学承诺）的表述。

供两处消费：
1. ``schemas/l4_marketing/project.py``：营销项目 title/tags/decoration_style 的
   Pydantic 校验（创建/更新均拦截，命中返回 422）；
2. ``scripts/compliance_rescan.py``：存量数据回扫，输出待运营改写清单。

维护约定：
- 词表为子串匹配（不分词），新增词条须评估对既有合法文案的误伤；
- 词条按主题分组，便于运营理解拒绝原因；
- 修改词表须同步报告 §6.1 与本注释。
"""

# ===== 学区/升学承诺（《房地产广告发布规定》第十八条：不得含办理升学等事项承诺）=====
SCHOOL_PROMISE_WORDS: tuple[str, ...] = (
    "书包",
    "学区",
    "学位",
    "名额",
    "直升",
    "名校",
    "落户",
    "户口",
    "升学",
)

# ===== 投资安全/收益保证（《广告法》第二十五条：招商广告禁止保本保收益承诺；
# 《执法指南》第十一条(二)：投资安全类绝对化用语不属违法轻微）=====
INVESTMENT_GUARANTEE_WORDS: tuple[str, ...] = (
    "零风险",
    "无风险",
    "零成本",
    "保本",
    "保收益",
    "稳赚",
    "必赚",
    "包卖",
    "一定卖出",
)

# ===== 绝对化/极限用语（《广告法》第九条(三)）=====
ABSOLUTE_WORDS: tuple[str, ...] = (
    "国家级",
    "最高级",
    "最佳",
    "第一",
    "唯一",
    "独家",
    "首选",
    "顶级",
)

# ===== 夸大/无法证实/社会风尚（《广告法》第八条、第十一条、第二十八条）=====
EXAGGERATION_WORDS: tuple[str, ...] = (
    "豪华",
    "大师",
    "网红",
    "稀缺",
    "绝版",
)

# ===== 升值/投资回报承诺（《广告法》第二十六条(一)：房地产广告不得含升值或投资回报承诺）=====
APPRECIATION_WORDS: tuple[str, ...] = (
    "升值",
    "保值",
    "投资回报",
    "返租",
    "包租",
)

# 全量词表（分组拼接，去重保序）
COMPLIANCE_BANNED_WORDS: tuple[str, ...] = tuple(
    dict.fromkeys(
        SCHOOL_PROMISE_WORDS + INVESTMENT_GUARANTEE_WORDS + ABSOLUTE_WORDS + EXAGGERATION_WORDS + APPRECIATION_WORDS,
    ),
)

# 主题分组（顺序即优先级：同一词命中多个主题时取第一个分组）
_BANNED_WORD_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("含学区/升学承诺暗示（《房地产广告发布规定》第十八条）", SCHOOL_PROMISE_WORDS),
    ("含投资安全/收益保证承诺（《广告法》第二十五条）", INVESTMENT_GUARANTEE_WORDS),
    ("绝对化/极限用语（《广告法》第九条）", ABSOLUTE_WORDS),
    ("夸大或无法证实的表述（《广告法》第八条、第二十八条）", EXAGGERATION_WORDS),
    ("升值/投资回报承诺（《广告法》第二十六条）", APPRECIATION_WORDS),
)

# 词条 → 违规原因（供 422 message 与回扫报告使用）
BANNED_WORD_REASONS: dict[str, str] = {word: reason for reason, words in _BANNED_WORD_GROUPS for word in words}


def find_banned_words(text: str) -> list[tuple[str, str]]:
    """在文本中查找命中的敏感词.

    Args:
        text: 待检文案（标题/标签/装修风格）。

    Returns:
        (词, 违规原因) 列表；按词表定义顺序返回，无命中返回空列表。

    """
    if not text:
        return []
    # 子串匹配（不分词），与发布拦截/存量回扫共用同一口径
    return [(word, BANNED_WORD_REASONS[word]) for word in COMPLIANCE_BANNED_WORDS if word in text]
