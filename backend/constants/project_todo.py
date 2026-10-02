"""项目待办看板规则常量.

共享名称常量与不开放配置的显示/模板常量。阈值类默认值集中在
todo_board_rules.TodoBoardRules.defaults()（经 system_configs 可配置），
见 docs/2026-10-02-待办看板规则配置-spec.md。
"""

# R8 里程碑工序（弹窗展示顺序 = 规则引擎遍历顺序）
MILESTONE_STAGES: tuple[str, ...] = ("设计", "拆除", "水电", "木瓦", "油漆", "交付")

# R2 基础信息字段（弹窗展示顺序；前 4 默认核心，其余默认次要）
BASIC_INFO_FIELD_NAMES: tuple[str, ...] = (
    "签约价",
    "业务形式",
    "交房时间",
    "业主联系方式",
    "面积",
    "户型",
    "朝向",
    "楼层信息",
    "水电户号",
    "水表户号",
    "燃气户号",
)

# R2：hint 短语最多直接拼接的缺失项数，超过用前 2 个 +「等」
R2_HINT_MAX_NAMES = 2

# R4：hint 短语最多直接拼接的文书数，超过用前 2 个 +「等」
R4_HINT_MAX_NAMES = 3

# R3：核心文书（未签 → P0）；名称与 constants/documents.py 模板严格同源
CORE_DOCUMENT_NAMES: tuple[str, ...] = ("签约合同", "装修合同")

# 每卡最多展示的待办条数，超出折叠「+N」
MAX_TODOS_PER_CARD = 6
