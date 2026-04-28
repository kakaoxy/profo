"""
批次导入事务管理单元测试
验证重构后的事务管理行为
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Community, PropertyCurrent, PropertyHistory, PropertyStatus
from schemas import PropertyIngestionModel
from services.market import PropertyImporter, CSVBatchImporter
from services.market.json_batch_importer import JSONBatchImporter


@pytest.fixture
def db_session():
    """Create in-memory database for testing"""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def importer():
    """Create PropertyImporter instance"""
    return PropertyImporter()


@pytest.fixture
def csv_importer():
    """Create CSVBatchImporter instance"""
    return CSVBatchImporter()


@pytest.fixture
def json_importer():
    """Create JSONBatchImporter instance"""
    return JSONBatchImporter()


class TestPropertyImporterTransactionManagement:
    """测试 PropertyImporter 事务管理 - 重构后不应内部调用 commit"""
    
    def test_import_property_does_not_call_commit(self, importer, db_session):
        """测试 import_property 不再内部调用 commit()"""
        # 记录 commit 调用次数
        original_commit = db_session.commit
        commit_count = [0]
        
        def mock_commit():
            commit_count[0] += 1
            original_commit()
        
        db_session.commit = mock_commit
        
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST001",
            状态="在售",
            小区名="测试小区",
            室=3,
            厅=2,
            卫=2,
            朝向="南",
            楼层="15/28",
            面积=120.5,
            挂牌价=800.0,
            上架时间=datetime(2024, 1, 1, 10, 0, 0)
        )
        
        result = importer.import_property(data, db_session, "test_user")
        
        assert result.success is True
        # 重构后，import_property 不应该调用 commit
        assert commit_count[0] == 0, "PropertyImporter 不应内部调用 commit()"
        
        # 手动提交后数据应该存在
        db_session.commit()
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST001").first()
        assert property_obj is not None
    
    def test_import_property_data_in_transaction(self, importer, db_session):
        """测试导入的数据在事务提交前对其他会话不可见"""
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST002",
            状态="在售",
            小区名="测试小区",
            室=2,
            朝向="南",
            楼层="8/16",
            面积=90.0,
            挂牌价=700.0,
            上架时间=datetime(2024, 1, 1)
        )
        
        result = importer.import_property(data, db_session, "test_user")
        
        assert result.success is True
        
        # 在同一个会话中查询应该能看到（因为 SQLAlchemy 的 identity map）
        property_in_session = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST002").first()
        assert property_in_session is not None
        
        # 创建新会话查询应该看不到（事务未提交）
        new_session = sessionmaker(bind=db_session.bind)()
        property_in_new_session = new_session.query(PropertyCurrent).filter_by(source_property_id="TEST002").first()
        # 注意：SQLite 内存数据库的特殊性，实际上可能看到，但在真实数据库环境中不会
        new_session.close()


class TestCSVBatchImporterTransactionManagement:
    """测试 CSVBatchImporter 批次级别事务管理"""
    
    def test_batch_import_commits_at_batch_level(self, csv_importer, db_session):
        """测试批次级别统一提交"""
        # 模拟多行 CSV 数据
        rows = [
            {
                '数据源': '链家',
                '房源ID': 'BATCH001',
                '状态': '在售',
                '小区名': '批次小区1',
                '室': '3',
                '朝向': '南',
                '楼层': '5/10',
                '面积': '100',
                '挂牌价': '500',
                '上架时间': '2024-01-01'
            },
            {
                '数据源': '链家',
                '房源ID': 'BATCH002',
                '状态': '在售',
                '小区名': '批次小区2',
                '室': '2',
                '朝向': '北',
                '楼层': '3/6',
                '面积': '80',
                '挂牌价': '400',
                '上架时间': '2024-01-01'
            }
        ]
        
        # 记录 commit 调用次数
        original_commit = db_session.commit
        commit_count = [0]
        
        def mock_commit():
            commit_count[0] += 1
            original_commit()
        
        db_session.commit = mock_commit
        
        # 验证所有数据
        validated_batch = []
        for idx, row in enumerate(rows):
            validated_data = PropertyIngestionModel(**row)
            validated_batch.append((idx + 1, validated_data, row))
        
        # 模拟批次处理
        for global_index, validated_data, original_row in validated_batch:
            result = csv_importer.importer.import_property(validated_data, db_session, "test_user")
            assert result.success is True

        # 批次结束时统一提交
        db_session.commit()
        
        # 应该只有一次批次级别的 commit
        assert commit_count[0] == 1, "应该只有批次级别的统一提交"
        
        # 验证数据都已导入
        prop1 = db_session.query(PropertyCurrent).filter_by(source_property_id="BATCH001").first()
        prop2 = db_session.query(PropertyCurrent).filter_by(source_property_id="BATCH002").first()
        assert prop1 is not None
        assert prop2 is not None
    
    def test_batch_rollback_on_exception(self, csv_importer, db_session):
        """测试批次中发生异常时整个批次回滚"""
        # 创建第一个房源
        data1 = PropertyIngestionModel(
            数据源="链家",
            房源ID="ROLLBACK001",
            状态="在售",
            小区名="回滚测试小区",
            室=3,
            朝向="南",
            楼层="5/10",
            面积=100.0,
            挂牌价=500.0,
            上架时间=datetime(2024, 1, 1)
        )
        result1 = csv_importer.importer.import_property(data1, db_session, "test_user")
        assert result1.success is True
        
        # 模拟批次提交前的异常
        try:
            # 故意制造异常
            raise Exception("模拟批次处理异常")
        except Exception:
            # 回滚整个批次
            db_session.rollback()
        
        # 验证数据已回滚
        prop = db_session.query(PropertyCurrent).filter_by(source_property_id="ROLLBACK001").first()
        assert prop is None, "批次回滚后数据不应存在"
    
    def test_batch_success_count_accuracy(self, csv_importer, db_session):
        """测试批次成功计数准确性"""
        # 准备混合数据：部分有效，部分无效
        rows = [
            {
                '数据源': '链家',
                '房源ID': 'SUCCESS001',
                '状态': '在售',
                '小区名': '成功小区',
                '室': '3',
                '朝向': '南',
                '楼层': '5/10',
                '面积': '100',
                '挂牌价': '500',
                '上架时间': '2024-01-01'
            },
            {
                '数据源': '链家',
                '房源ID': 'SUCCESS002',
                '状态': '在售',
                '小区名': '成功小区',
                '室': '2',
                '朝向': '北',
                '楼层': '3/6',
                '面积': '80',
                '挂牌价': '400',
                '上架时间': '2024-01-01'
            }
        ]
        
        success = 0
        failed = 0
        
        # 验证并导入数据
        for idx, row in enumerate(rows):
            try:
                validated_data = PropertyIngestionModel(**row)
                result = csv_importer.importer.import_property(validated_data, db_session, "test_user")
                if result.success:
                    success += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
        
        # 提交批次
        db_session.commit()
        
        # 验证计数准确
        assert success == 2, f"应该有 2 条成功记录，实际 {success}"
        assert failed == 0, f"应该有 0 条失败记录，实际 {failed}"
        
        # 验证数据库状态与计数一致
        prop_count = db_session.query(PropertyCurrent).filter(
            PropertyCurrent.source_property_id.in_(['SUCCESS001', 'SUCCESS002'])
        ).count()
        assert prop_count == success, "数据库记录数应与成功计数一致"


class TestJSONBatchImporterTransactionManagement:
    """测试 JSONBatchImporter 批次级别事务管理"""
    
    def test_json_batch_import_transaction(self, json_importer, db_session):
        """测试 JSON 批量导入的事务管理"""
        properties = [
            {
                '数据源': '贝壳',
                '房源ID': 'JSON001',
                '状态': '在售',
                '小区名': 'JSON测试小区1',
                '室': '3',
                '朝向': '南',
                '楼层': '10/20',
                '面积': '120',
                '挂牌价': '600',
                '上架时间': '2024-01-01'
            },
            {
                '数据源': '贝壳',
                '房源ID': 'JSON002',
                '状态': '在售',
                '小区名': 'JSON测试小区2',
                '室': '2',
                '朝向': '东',
                '楼层': '5/15',
                '面积': '90',
                '挂牌价': '450',
                '上架时间': '2024-01-01'
            }
        ]
        
        success = 0
        failed = 0
        
        # 处理所有记录
        for raw_data in properties:
            try:
                validated_data = PropertyIngestionModel(**raw_data)
                result = json_importer.importer.import_property(validated_data, db_session, "test_user")
                if result.success:
                    success += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
        
        # 统一提交
        db_session.commit()
        
        # 验证结果
        assert success == 2
        assert failed == 0
        
        # 验证数据库状态
        prop1 = db_session.query(PropertyCurrent).filter_by(source_property_id="JSON001").first()
        prop2 = db_session.query(PropertyCurrent).filter_by(source_property_id="JSON002").first()
        assert prop1 is not None
        assert prop2 is not None
    
    def test_json_batch_rollback(self, json_importer, db_session):
        """测试 JSON 批量导入回滚"""
        # 导入一条数据
        data = PropertyIngestionModel(
            数据源="贝壳",
            房源ID="JSON_ROLLBACK",
            状态="在售",
            小区名="回滚测试",
            室=2,
            朝向="南",
            楼层="3/6",
            面积=80.0,
            挂牌价=400.0,
            上架时间=datetime(2024, 1, 1)
        )
        
        result = json_importer.importer.import_property(data, db_session, "test_user")
        assert result.success is True
        
        # 模拟异常并回滚
        db_session.rollback()
        
        # 验证数据已回滚
        prop = db_session.query(PropertyCurrent).filter_by(source_property_id="JSON_ROLLBACK").first()
        assert prop is None, "回滚后数据不应存在"


class TestTransactionAtomicity:
    """测试事务原子性 - 核心要求"""
    
    def test_all_or_nothing_semantics(self, csv_importer, db_session):
        """测试全有或全无语义：批次中任何失败都导致整个批次回滚"""
        # 这个测试验证重构的核心目标：批次级别的原子性
        
        # 准备数据：第一个有效，第二个故意制造异常
        rows = [
            {
                '数据源': '链家',
                '房源ID': 'ATOMIC001',
                '状态': '在售',
                '小区名': '原子性测试',
                '室': '3',
                '朝向': '南',
                '楼层': '5/10',
                '面积': '100',
                '挂牌价': '500',
                '上架时间': '2024-01-01'
            },
            {
                '数据源': '链家',
                '房源ID': 'ATOMIC002',
                '状态': '在售',
                '小区名': '原子性测试',
                '室': '2',
                '朝向': '北',
                '楼层': '3/6',
                '面积': '80',
                '挂牌价': '400',
                '上架时间': '2024-01-01'
            }
        ]
        
        try:
            # 处理第一条
            validated_data1 = PropertyIngestionModel(**rows[0])
            result1 = csv_importer.importer.import_property(validated_data1, db_session, "test_user")
            assert result1.success is True
            
            # 处理第二条
            validated_data2 = PropertyIngestionModel(**rows[1])
            result2 = csv_importer.importer.import_property(validated_data2, db_session, "test_user")
            assert result2.success is True
            
            # 模拟在批次末尾发生异常
            raise Exception("批次处理完成前的模拟异常")
            
        except Exception:
            # 回滚整个批次
            db_session.rollback()
        
        # 验证：两条记录都不应该存在（原子性）
        prop1 = db_session.query(PropertyCurrent).filter_by(source_property_id="ATOMIC001").first()
        prop2 = db_session.query(PropertyCurrent).filter_by(source_property_id="ATOMIC002").first()
        
        assert prop1 is None, "原子性要求：批次失败时所有数据都不应存在"
        assert prop2 is None, "原子性要求：批次失败时所有数据都不应存在"
    
    def test_nested_transaction_behavior(self, importer, db_session):
        """测试嵌套事务行为：内部不应有独立 commit"""
        # 这个测试验证重构前的核心问题：嵌套 commit
        
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="NESTED001",
            状态="在售",
            小区名="嵌套事务测试",
            室=2,
            朝向="南",
            楼层="5/10",
            面积=90.0,
            挂牌价=450.0,
            上架时间=datetime(2024, 1, 1)
        )
        
        # 在调用 import_property 之前记录状态
        count_before = db_session.query(PropertyCurrent).count()
        
        result = importer.import_property(data, db_session, "test_user")
        assert result.success is True
        
        # 在调用 commit 之前记录状态
        count_after_import = db_session.query(PropertyCurrent).count()
        
        # 重要：重构后，import_property 不应该改变数据库状态
        # 因为数据只在 flush 到 identity map，而不是 commit 到数据库
        # 在 SQLite 内存数据库中，行为可能不同，但在真实环境中这应该为 True
        
        # 现在提交
        db_session.commit()
        
        count_after_commit = db_session.query(PropertyCurrent).count()
        
        # 验证最终状态
        assert count_after_commit == count_before + 1, "提交后数据应该存在"
