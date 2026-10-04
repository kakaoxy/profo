"""TodoBoard 规则配置合并（_merge_with_defaults）单元测试.

回归背景：dict 字段合并曾把 basic_info_fields 的字符串值（core/minor/off）
无条件替换为默认值（default.get(k, v) 对已知键恒返回默认），导致管理员保存的
字段三态配置在读取路径（load_rules / _row_to_response）被静默回退、配置完全失效。
"""

import pytest

from schemas.project import TodoBoardRulesData
from services.projects.todo_board_config import (
    _data_to_dict,
    _merge_with_defaults,
    _row_to_response,
)
from services.projects.todo_board_rules import TodoBoardRules


def _full_raw(**overrides):
    """构造一份与 defaults 等价的原始配置 dict，允许按字段覆盖."""
    raw = _data_to_dict(TodoBoardRules.defaults())
    raw.update(overrides)
    return raw


def test_basic_info_fields_string_values_round_trip():
    """字符串值（core/minor/off）须原样保留，不得回退为默认（回归核心用例）."""
    raw = _full_raw(
        basic_info_fields={
            "签约价": "core",
            "业务形式": "core",
            "交房时间": "core",
            "业主联系方式": "core",
            "面积": "core",  # 默认 minor，管理员改为 core
            "户型": "minor",
            "朝向": "off",  # 默认 minor，管理员改为 off
            "楼层信息": "minor",
            "水电户号": "minor",
            "水表户号": "minor",
            "燃气户号": "minor",
        },
    )
    merged = _merge_with_defaults(raw)
    assert merged["basic_info_fields"]["面积"] == "core"
    assert merged["basic_info_fields"]["朝向"] == "off"
    assert merged["basic_info_fields"]["签约价"] == "core"
    assert merged["basic_info_fields"]["燃气户号"] == "minor"


def test_milestone_days_numeric_values_round_trip():
    """Dict 内数值字段保持收敛 int 后原样保留."""
    raw = _full_raw(milestone_days={"设计": 9, "拆除": 3, "水电": 21, "木瓦": 30, "油漆": 45, "交付": 60})
    merged = _merge_with_defaults(raw)
    assert merged["milestone_days"] == {
        "设计": 9,
        "拆除": 3,
        "水电": 21,
        "木瓦": 30,
        "油漆": 45,
        "交付": 60,
    }


def test_scalar_float_tolerated_and_bool_rejected():
    """标量数值字段：float 收敛为 int；bool 不作数值 → 回退默认."""
    merged = _merge_with_defaults(_full_raw(delivery_total_days=90.0, archive_overdue_days=True))
    assert merged["delivery_total_days"] == 90
    assert isinstance(merged["delivery_total_days"], int)
    assert merged["archive_overdue_days"] == TodoBoardRules.defaults().archive_overdue_days


def test_dict_field_type_mismatch_falls_back_to_default():
    """Dict 字段内类型不符的值回退默认：数值位置给字符串/bool 均回退；字符串位置给 bool 回退."""
    defaults = TodoBoardRules.defaults()
    merged = _merge_with_defaults(
        _full_raw(
            milestone_days={"设计": "abc", "拆除": True},
            basic_info_fields={"面积": True},
        ),
    )
    assert merged["milestone_days"]["设计"] == defaults.milestone_days["设计"]
    assert merged["milestone_days"]["拆除"] == defaults.milestone_days["拆除"]
    assert merged["basic_info_fields"]["面积"] == defaults.basic_info_fields["面积"]


def test_dict_missing_keys_backfilled_from_default():
    """字典字段缺键 → 回填该键默认值（手改删键 / MILESTONE_STAGES 演进自愈）."""
    defaults = TodoBoardRules.defaults()
    merged = _merge_with_defaults(_full_raw(milestone_days={"拆除": 5}))
    assert merged["milestone_days"] == {**defaults.milestone_days, "拆除": 5}


def test_dict_unknown_keys_dropped_for_schema_contract():
    """字典未知键丢弃：PUT 禁止未知键，保留会令 GET 响应校验失败（500）."""
    merged = _merge_with_defaults(
        _full_raw(milestone_days={"神秘工序": 9}, basic_info_fields={"junk": "core"}),
    )
    assert merged["milestone_days"] == TodoBoardRules.defaults().milestone_days
    assert merged["basic_info_fields"] == TodoBoardRules.defaults().basic_info_fields
    TodoBoardRulesData(**merged)  # 合并结果可通过 GET 响应 Schema 校验


def test_dict_invalid_level_string_falls_back_to_default():
    """字典字符串位置垃圾（非三态 str / 数值）回退该键默认，避免 Literal 校验 500."""
    merged = _merge_with_defaults(_full_raw(basic_info_fields={"面积": "required", "户型": 5}))
    defaults = TodoBoardRules.defaults()
    assert merged["basic_info_fields"]["面积"] == defaults.basic_info_fields["面积"]
    assert merged["basic_info_fields"]["户型"] == defaults.basic_info_fields["户型"]
    TodoBoardRulesData(**merged)


def test_missing_row_returns_all_defaults():
    """缺行/非 dict（None、损坏 JSON 解析产物等）→ 整体回退代码默认."""
    merged = _merge_with_defaults(None)
    assert merged == _data_to_dict(TodoBoardRules.defaults())


def test_missing_key_keeps_default_per_field():
    """部分键缺失 → 仅缺失字段回退默认，其余保留."""
    raw = _full_raw()
    del raw["commission_near_days"]
    raw["start_grace_days"] = 20
    merged = _merge_with_defaults(raw)
    assert merged["commission_near_days"] == TodoBoardRules.defaults().commission_near_days
    assert merged["start_grace_days"] == 20


# ── 数值区间收敛：越界/非有限值回退默认（手工改库脏数据防御，回归 GET 500） ──


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"archive_overdue_days": 0}, "archive_overdue_days"),  # 下界外
        ({"archive_overdue_days": -30}, "archive_overdue_days"),  # 负数
        ({"archive_overdue_days": 100000}, "archive_overdue_days"),  # 上界外
        ({"milestone_days": {"设计": 0, "拆除": -5}}, "milestone_days"),  # dict 内越界
        ({"milestone_days": {"设计": 100000}}, "milestone_days"),
    ],
)
def test_out_of_range_days_fall_back_to_default(overrides, field):
    """数值阈值越界（区间同 PUT Schema ge=1/le=999）回退该字段默认，响应可过 Schema 校验.

    回归背景：_merge_with_defaults 曾只做类型收敛不做值域收敛，手工改库写入越界值后
    GET /todo-board/config 响应 Schema 校验 500（与 JSON 损坏同族，但值域路径未防）。
    """
    merged = _merge_with_defaults(_full_raw(**overrides))
    if field == "milestone_days":
        assert merged[field] == TodoBoardRules.defaults().milestone_days
    else:
        assert merged[field] == TodoBoardRules.defaults().__getattribute__(field)
    TodoBoardRulesData(**merged)  # 响应可通过 Schema 校验


def test_non_finite_numbers_fall_back_to_default():
    """NaN/Infinity：NaN 会使 int() 抛 ValueError（GET 500），必须与越界同口径回退默认."""
    merged = _merge_with_defaults(
        _full_raw(delivery_total_days=float("nan"), archive_overdue_days=float("inf")),
    )
    defaults = TodoBoardRules.defaults()
    assert merged["delivery_total_days"] == defaults.delivery_total_days
    assert merged["archive_overdue_days"] == defaults.archive_overdue_days
    TodoBoardRulesData(**merged)


def test_boundary_values_accepted():
    """边界值 1 / 999 / float 小数（区间内）正常采纳，不误伤合法配置."""
    merged = _merge_with_defaults(
        _full_raw(archive_overdue_days=1, delivery_total_days=999, start_grace_days=12.0),
    )
    assert merged["archive_overdue_days"] == 1
    assert merged["delivery_total_days"] == 999
    assert merged["start_grace_days"] == 12


@pytest.mark.parametrize(
    ("raw_value", "expect"),
    [
        ("not-a-dict", "defaults"),
        (42, "defaults"),
        ([], "defaults"),
    ],
)
def test_non_dict_raw_falls_back_to_defaults(raw_value, expect):
    """Raw 非 dict 类型一律整体回退默认."""
    merged = _merge_with_defaults(raw_value)
    assert merged == _data_to_dict(TodoBoardRules.defaults())


# ── _row_to_response：value 损坏时读取路径永不 500（spec K5 回归） ────────


class _FakeRow:
    """模拟 system_configs 行（避免为纯函数测试建 DB fixture）。"""

    def __init__(self, value: str | None) -> None:
        self.value = value
        self.updated_at = None
        self.updated_by_id = None


@pytest.fixture(autouse=True)
def _stub_user_display_name(monkeypatch: pytest.MonkeyPatch):
    """隔离 _user_display_name 的 users 表查询（本组用例不验证审计字段解析）。"""
    monkeypatch.setattr("services.projects.todo_board_config._user_display_name", lambda db, user_id: None)


@pytest.mark.parametrize(
    "value",
    [
        '{"milestone_days": {"设计": 7',  # 手工改库截断的 JSON
        "not-json",  # 非 JSON 文本
        "null",  # JSON null（字面量合法但无配置内容）
    ],
)
def test_row_to_response_corrupt_value_falls_back_to_defaults(value: str):
    """row.value 解析失败视同缺行：回退默认且 updated_* 置 null，GET/PUT 均 200.

    回归背景：_row_to_response 曾对损坏 JSON 直接抛 JSONDecodeError →
    GET /todo-board/config 500，且 PUT 响应同路径导致管理页永久无法经 API 自愈。
    """
    resp = _row_to_response(None, _FakeRow(value))
    assert resp.delivery_total_days == TodoBoardRules.defaults().delivery_total_days
    assert resp.basic_info_fields == TodoBoardRules.defaults().basic_info_fields
    assert resp.updated_at is None
    assert resp.updated_by_name is None
    TodoBoardRulesData(**_data_to_dict(TodoBoardRules.defaults()))  # 响应可通过 Schema 校验


def test_row_to_response_none_row_returns_defaults():
    """缺行 → 全默认 + updated_* 为 null（原有行为回归）。"""
    resp = _row_to_response(None, None)
    assert resp.milestone_p0_overdue_days == TodoBoardRules.defaults().milestone_p0_overdue_days
    assert resp.updated_at is None
    assert resp.updated_by_name is None


def test_row_to_response_valid_value_round_trips():
    """合法 value 正常解析（非损坏路径不被本次修复误伤）。"""
    import json

    raw = _data_to_dict(TodoBoardRules.defaults())
    raw["delivery_total_days"] = 90
    resp = _row_to_response(None, _FakeRow(json.dumps(raw, ensure_ascii=False)))
    assert resp.delivery_total_days == 90
