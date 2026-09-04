"""合同编号生成器回归测试.

覆盖序号跨位数边界（99→100）时 func.max 字典序比较导致的编号生成失败缺陷。
"""

import uuid

import pytest
from sqlalchemy.orm import Session

from models import ProjectContract
from services.projects.internal.contract_number import ContractNumberGenerator


def _make_contract(db_session: Session, contract_no: str) -> None:
    """插入一条合同记录（仅 contract_no，其余字段使用最小默认值）."""
    db_session.add(
        ProjectContract(
            id=str(uuid.uuid4()),
            project_id=str(uuid.uuid4()),
            contract_no=contract_no,
            contract_status="生效",
            is_deleted=False,
        )
    )
    db_session.commit()


def test_generate_starts_from_initial_sequence(db_session: Session) -> None:
    """无历史合同时从 _INITIAL_SEQUENCE (28) 开始."""
    gen = ContractNumberGenerator(db_session)
    assert gen.generate("agent") == "SH0028-DL"
    assert gen.generate("wholesale") == "SH0029-SG"


def test_generate_increments_from_existing(db_session: Session) -> None:
    """从现有最大序号递增."""
    _make_contract(db_session, "SH0030-SG")
    gen = ContractNumberGenerator(db_session)
    assert gen.generate("agent") == "SH0031-DL"


def test_generate_across_digit_boundary_same_suffix(db_session: Session) -> None:
    """序号跨 99→100 边界（同后缀）时仍能正确递增.

    回归缺陷：func.max(String) 做字典序比较，"SH0099-SG" > "SH0100-SG"，
    导致生成器误认为最大序号是 99，反复尝试已存在的 SH0100-SG 直至 RuntimeError。
    """
    _make_contract(db_session, "SH0099-SG")
    _make_contract(db_session, "SH0100-SG")
    gen = ContractNumberGenerator(db_session)
    # 应返回 101，而非错误地返回 100（已存在，旧代码会 RuntimeError）
    assert gen.generate("agent") == "SH0101-DL"


def test_generate_across_digit_boundary_mixed_suffix(db_session: Session) -> None:
    """序号跨 99→100 边界（混合后缀）时仍能正确递增."""
    _make_contract(db_session, "SH0099-SG")
    _make_contract(db_session, "SH0100-DL")
    gen = ContractNumberGenerator(db_session)
    assert gen.generate("agent") == "SH0101-DL"
    assert gen.generate("wholesale") == "SH0102-SG"


def test_generate_invalid_business_form(db_session: Session) -> None:
    """无效 business_form 抛出 ValueError."""
    gen = ContractNumberGenerator(db_session)
    with pytest.raises(ValueError, match="无效的 business_form"):
        gen.generate("invalid")
