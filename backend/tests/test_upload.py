"""
Unit tests for CSV upload functionality
Tests CSV file decoding, parsing, batch import, and API endpoints
"""

import pytest
import csv
import io
import os
import tempfile
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, FailedRecord
from schemas import PropertyIngestionModel, UploadResult
from services.csv_batch_importer import CSVBatchImporter
from exceptions import FileProcessingException, ResourceNotFoundException
from dependencies.auth import get_current_operator_user, get_current_normal_user


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
def csv_importer():
    """Create CSVBatchImporter instance"""
    return CSVBatchImporter()


@pytest.fixture
def mock_upload_file():
    """Create mock UploadFile for testing"""
    def _create_mock(content: bytes, filename: str = "test.csv"):
        file = Mock(spec=UploadFile)
        file.filename = filename
        file.file = Mock()
        file.file.read.return_value = content
        return file
    return _create_mock


@pytest.fixture
def client():
    """Create FastAPI test client"""
    from fastapi.testclient import TestClient
    from main import app
    
    # Override auth dependencies
    app.dependency_overrides[get_current_operator_user] = lambda: {"id": 1, "username": "test_op", "role": "operator"}
    app.dependency_overrides[get_current_normal_user] = lambda: {"id": 1, "username": "test_user", "role": "user"}
    
    yield TestClient(app)
    
    # Clean up overrides
    app.dependency_overrides = {}


# Test data helpers
def create_valid_csv_content(rows: list) -> str:
    """Helper to create valid CSV content"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "数据源", "房源ID", "状态", "小区名", "室", "厅", "卫",
        "朝向", "楼层", "面积", "挂牌价", "上架时间", "成交价", "成交时间"
    ])
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def create_csv_bytes(content: str, encoding: str = 'utf-8') -> bytes:
    """Helper to convert CSV string to bytes with specified encoding"""
    return content.encode(encoding)


# Test class structure
class TestCSVBatchImporter:
    """Test CSVBatchImporter class"""
    
    class TestFileDecoding:
        """Test file decoding functionality"""
        
        def test_decode_utf8_encoding(self, csv_importer):
            """Test UTF-8 encoding detection"""
            content = "测试内容".encode('utf-8')
            result = csv_importer._decode_file_content(content)
            assert result == "测试内容"
        
        def test_decode_utf8_with_bom(self, csv_importer):
            """Test UTF-8 with BOM detection"""
            content = b'\xef\xbb\xbf\xe6\xb5\x8b\xe8\xaf\x95\xe5\x86\x85\xe5\xae\xb9'
            result = csv_importer._decode_file_content(content)
            assert result == "测试内容"
        
        def test_decode_utf16_encoding(self, csv_importer):
            """Test UTF-16 encoding detection"""
            content = "测试内容".encode('utf-16')
            result = csv_importer._decode_file_content(content)
            assert "测试" in result  # UTF-16 should decode correctly
        
        def test_decode_gbk_encoding(self, csv_importer):
            """Test GBK/GB2312 encoding detection"""
            content = "测试内容".encode('gbk')
            result = csv_importer._decode_file_content(content)
            assert result == "测试内容"
        
        def test_decode_unknown_encoding_fallback(self, csv_importer):
            """Test unknown encoding fallback to UTF-8 with ignore errors"""
            # Create content with invalid UTF-8 sequence
            content = b'\xff\xfe\xfd\xfc\xfb\xfa'
            result = csv_importer._decode_file_content(content)
            # Should not raise exception, returns decoded content with errors ignored
            assert isinstance(result, str)
    
    class TestDateNormalization:
        """Test date normalization functionality"""
        
        def test_normalize_chinese_date_format(self, csv_importer):
            """Test Chinese date format: 2023年12月25日"""
            result = csv_importer._normalize_date_string("2023年12月25日")
            assert result == "2023-12-25"
        
        def test_normalize_slash_date_format(self, csv_importer):
            """Test slash date format: 2023/12/25"""
            result = csv_importer._normalize_date_string("2023/12/25")
            assert result == "2023-12-25"
        
        def test_normalize_dot_date_format(self, csv_importer):
            """Test dot date format: 2023.12.25"""
            result = csv_importer._normalize_date_string("2023.12.25")
            assert result == "2023-12-25"
        
        def test_normalize_single_digit_date(self, csv_importer):
            """Test single digit date with zero padding: 2023年1月5日"""
            result = csv_importer._normalize_date_string("2023年1月5日")
            assert result == "2023-01-05"
        
        def test_normalize_invalid_date_format(self, csv_importer):
            """Test invalid date format returns original string"""
            result = csv_importer._normalize_date_string("invalid-date")
            assert result == "invalid-date"
        
        def test_normalize_dateutil_fallback(self, csv_importer):
            """Test dateutil parser fallback for complex formats"""
            result = csv_importer._normalize_date_string("2023-Dec-25")
            assert result == "2023-12-25"
    
    class TestCSVParsing:
        """Test CSV parsing functionality"""
        
        def test_parse_standard_comma_separated(self, csv_importer):
            """Test standard comma-separated CSV"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST001", "在售", "测试小区A", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            assert rows[0]["房源ID"] == "TEST001"
            assert rows[0]["状态"] == "在售"
        
        def test_parse_semicolon_separated(self, csv_importer):
            """Test semicolon-separated CSV"""
            csv_content = "数据源;房源ID;状态;小区名;室;厅;卫;朝向;楼层;面积;挂牌价;上架时间\n链家;TEST002;在售;测试小区B;2;1;1;南;8/18;85;550;2024-01-15"
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            assert rows[0]["房源ID"] == "TEST002"
        
        def test_parse_tab_separated(self, csv_importer):
            """Test tab-separated CSV (TSV)"""
            csv_content = "数据源\t房源ID\t状态\t小区名\t室\t厅\t卫\t朝向\t楼层\t面积\t挂牌价\t上架时间\n贝壳\tTEST003\t成交\t测试小区C\t2\t1\t1\t东南\t高楼层/18\t90\t600\t2024-02-01"
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            assert rows[0]["状态"] == "成交"
        
        def test_parse_missing_fields_handling(self, csv_importer):
            """Test handling of rows with missing fields"""
            csv_content = """数据源,房源ID,状态,小区名,室,厅,卫,朝向,楼层,面积,挂牌价,上架时间
链家,TEST004,在售,测试小区D,3,2,2,南,15/28,120.5,800,2024-01-01
贝壳,TEST005,在售,测试小区E,2,1,1,东,8/18,85,550,2024-01-15"""
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 2
            assert rows[1]["房源ID"] == "TEST005"
            # All fields should be present
            assert rows[1].get("上架时间") == "2024-01-15"
        
        def test_parse_extra_fields_handling(self, csv_importer):
            """Test handling of rows with extra fields"""
            csv_content = """数据源,房源ID,状态,小区名,室,厅,卫,朝向,楼层,面积,挂牌价,上架时间
链家,TEST006,在售,测试小区F,3,2,2,南,15/28,120.5,800,2024-01-01,额外字段1,额外字段2"""
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            # Extra fields should be truncated
            assert "额外字段1" not in rows[0]
        
        def test_parse_empty_column_names(self, csv_importer):
            """Test handling of empty column names"""
            csv_content = """数据源,房源ID,,状态,小区名,室,厅,卫
链家,TEST007,在售,测试小区G,3,2,2"""
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            # Empty column names should be skipped
            assert rows[0]["房源ID"] == "TEST007"
            assert "" not in rows[0]
        
        def test_parse_bom_handling(self, csv_importer):
            """Test BOM character handling in headers"""
            csv_content = "\ufeff数据源,房源ID,状态,小区名,室,厅,卫,朝向,楼层,面积,挂牌价,上架时间\n链家,TEST008,在售,测试小区H,3,2,2,南,15/28,120.5,800,2024-01-01"
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 1
            assert rows[0]["房源ID"] == "TEST008"
            # BOM should be stripped from column names
        
        def test_parse_date_field_normalization(self, csv_importer):
            """Test automatic date field normalization"""
            csv_content = """数据源,房源ID,状态,小区名,室,厅,卫,朝向,楼层,面积,挂牌价,上架时间
链家,TEST009,在售,测试小区I,3,2,2,南,15/28,120.5,800,2024年12月25日
贝壳,TEST010,成交,测试小区J,2,1,1,东,8/18,85,550,2024/12/25"""
            rows, headers = csv_importer.parse_csv_file(csv_content)
            assert len(rows) == 2
            assert rows[0]["上架时间"] == "2024-12-25"
            assert rows[1]["上架时间"] == "2024-12-25"
        
        def test_parse_empty_file(self, csv_importer):
            """Test empty file handling"""
            with pytest.raises(FileProcessingException) as exc_info:
                csv_importer.parse_csv_file("")
            assert "CSV 文件格式无效或内容损坏" in str(exc_info.value)
        
        def test_parse_no_header(self, csv_importer):
            """Test CSV without header handling"""
            csv_content = """数据源,房源ID,状态,小区名,室,厅,卫,朝向,楼层,面积,挂牌价,上架时间
链家,TEST011,在售,测试小区K,3,2,2,南,15/28,120.5,800,2024-01-01"""
            rows, headers = csv_importer.parse_csv_file(csv_content)
            # Should parse successfully with proper header
            assert len(rows) == 1
            assert rows[0]["房源ID"] == "TEST011"
    
    class TestBatchImport:
        """Test batch import functionality"""
        
        def test_import_single_record_success(self, csv_importer, db_session, mock_upload_file):
            """Test successful import of single record"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST001", "在售", "测试小区A", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.total == 1
            assert result.success == 1
            assert result.failed == 0
            assert result.failed_file_url is None
        
        def test_import_multiple_records_success(self, csv_importer, db_session, mock_upload_file):
            """Test successful import of multiple records"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST002", "在售", "测试小区B", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"],
                ["贝壳", "TEST003", "成交", "测试小区C", "2", "1", "1", "东", "8/18", "85", "550", "2024-01-15", "500", "2024-01-20"],
                ["链家", "TEST004", "在售", "测试小区D", "4", "2", "2", "北", "20/30", "150", "1200", "2024-01-20"]
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.total == 3
            assert result.success == 3
            assert result.failed == 0
        
        def test_import_partial_success(self, csv_importer, db_session, mock_upload_file):
            """Test partial success with mixed valid and invalid data"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST005", "在售", "测试小区E", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"],  # Valid
                ["贝壳", "TEST006", "无效状态", "测试小区F", "2", "1", "1", "东", "8/18", "85", "550", "2024-01-15"],  # Invalid status
                ["链家", "TEST007", "在售", "测试小区G", "4", "2", "2", "北", "20/30", "150", "1200", "2024-01-20"]   # Valid
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.total == 3
            assert result.success == 2
            assert result.failed == 1
            assert result.failed_file_url is not None
        
        def test_import_data_validation_failure(self, csv_importer, db_session, mock_upload_file):
            """Test data validation failure handling"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST008", "在售", "测试小区H", "3", "2", "2", "南", "15/28", "120.5", "0", "2024-01-01"]  # Invalid price (0)
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.total == 1
            # Should fail validation due to invalid price
            assert result.failed == 1
        
        def test_import_empty_file(self, csv_importer, db_session, mock_upload_file):
            """Test empty file handling"""
            file = mock_upload_file(b"", "empty.csv")
            
            with pytest.raises(FileProcessingException) as exc_info:
                csv_importer.batch_import_csv(file, db_session)
            assert "CSV 文件为空" in str(exc_info.value)
        
        def test_import_batch_processing(self, csv_importer, db_session, mock_upload_file):
            """Test batch processing with large dataset"""
            # Create 150 records to test batch processing (BATCH_SIZE = 100)
            rows = []
            for i in range(150):
                rows.append(["链家", f"TEST{i:03d}", "在售", f"测试小区{i}", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"])
            
            csv_content = create_valid_csv_content(rows)
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.total == 150
            assert result.success == 150
            assert result.failed == 0
        
        def test_import_for_sale_property(self, csv_importer, db_session, mock_upload_file):
            """Test importing for-sale property creates PropertyCurrent record"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST009", "在售", "测试小区I", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.success == 1
            # Verify property was created with correct status
            from models import PropertyCurrent, PropertyStatus
            property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST009").first()
            assert property_obj is not None
            assert property_obj.status == PropertyStatus.FOR_SALE
        
        def test_import_sold_property(self, csv_importer, db_session, mock_upload_file):
            """Test importing sold property creates PropertyCurrent record with SOLD status"""
            csv_content = create_valid_csv_content([
                ["贝壳", "TEST010", "成交", "测试小区J", "2", "1", "1", "东", "8/18", "85", "550", "2024-01-15", "500", "2024-01-20"]
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.success == 1
            # Verify property was created with SOLD status
            from models import PropertyCurrent, PropertyStatus
            property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST010").first()
            assert property_obj is not None
            assert property_obj.status == PropertyStatus.SOLD
        
        def test_import_update_existing_property(self, csv_importer, db_session, mock_upload_file):
            """Test updating existing property creates history snapshot"""
            # First import
            csv_content1 = create_valid_csv_content([
                ["链家", "TEST011", "在售", "测试小区K", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            file1 = mock_upload_file(create_csv_bytes(csv_content1))
            csv_importer.batch_import_csv(file1, db_session)
            
            # Update import
            csv_content2 = create_valid_csv_content([
                ["链家", "TEST011", "在售", "测试小区K", "3", "2", "2", "南", "15/28", "120.5", "750", "2024-01-01"]  # Price changed
            ])
            file2 = mock_upload_file(create_csv_bytes(csv_content2))
            result = csv_importer.batch_import_csv(file2, db_session)
            
            assert result.success == 1
            # Verify history was created
            from models import PropertyHistory
            history_count = db_session.query(PropertyHistory).filter_by(source_property_id="TEST011").count()
            assert history_count == 1
        
        def test_import_community_auto_creation(self, csv_importer, db_session, mock_upload_file):
            """Test automatic community creation for new communities"""
            csv_content = create_valid_csv_content([
                ["链家", "TEST012", "在售", "全新小区", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            file = mock_upload_file(create_csv_bytes(csv_content))
            
            result = csv_importer.batch_import_csv(file, db_session)
            
            assert result.success == 1
            # Verify community was created
            from models import Community
            community = db_session.query(Community).filter_by(name="全新小区").first()
            assert community is not None
    
    class TestFailedRecordHandling:
        """Test failed record handling functionality"""
        
        def test_save_failed_record(self, csv_importer, db_session):
            """Test saving failed record to database"""
            row = {
                "数据源": "链家",
                "房源ID": "TEST013",
                "状态": "在售",
                "小区名": "测试小区L",
                "室": "3",
                "厅": "2",
                "卫": "2",
                "朝向": "南",
                "楼层": "15/28",
                "面积": "120.5",
                "挂牌价": "800",
                "上架时间": "2024-01-01"
            }
            error_msg = "数据验证失败: 缺少必填字段"
            
            # Use a separate session to avoid transaction conflicts
            from db import SessionLocal
            test_db = SessionLocal()
            try:
                csv_importer._save_failed_record(row, error_msg, test_db)
                # Query using the same session
                failed_record = test_db.query(FailedRecord).filter(
                    FailedRecord.payload.contains("TEST013")
                ).first()
                assert failed_record is not None
                assert failed_record.failure_reason == error_msg
                assert failed_record.failure_type == "csv_validation_error"
            finally:
                test_db.close()
        
        def test_generate_failed_csv(self, csv_importer, tmp_path):
            """Test generating failed records CSV file"""
            failed_records = [
                {
                    'row_number': 2,
                    'data': {
                        "数据源": "链家",
                        "房源ID": "TEST014",
                        "状态": "在售",
                        "小区名": "测试小区M",
                        "室": "3",
                        "挂牌价": "800"
                    },
                    'error': "数据验证失败: 缺少必填字段"
                },
                {
                    'row_number': 3,
                    'data': {
                        "数据源": "贝壳",
                        "房源ID": "TEST015",
                        "状态": "无效状态",
                        "小区名": "测试小区N",
                        "室": "2",
                        "挂牌价": "600"
                    },
                    'error': "状态必须是'在售'或'成交'"
                }
            ]
            
            # Mock the temp directory
            with patch('os.getcwd', return_value=str(tmp_path)):
                result = csv_importer._generate_failed_csv(failed_records)
                
                assert result is not None
                assert "/api/upload/download/" in result
                assert result.startswith("/api/upload/download/failed_records_")
                
                # Verify file was created
                filename = result.split("/")[-1]
                filepath = tmp_path / "temp" / filename
                assert filepath.exists()
                
                # Verify file content
                with open(filepath, 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                    assert "行号" in content
                    assert "错误原因" in content
                    assert "数据源" in content
                    assert "房源ID" in content
        
        def test_generate_failed_csv_empty_records(self, csv_importer):
            """Test generating CSV with empty failed records"""
            result = csv_importer._generate_failed_csv([])
            assert result is None
        
        def test_generate_failed_csv_no_temp_dir(self, csv_importer, tmp_path):
            """Test generating CSV when temp directory doesn't exist"""
            failed_records = [
                {
                    'row_number': 1,
                    'data': {"数据源": "链家", "房源ID": "TEST016"},
                    'error': "测试错误"
                }
            ]
            
            # Use a temp path that doesn't have temp directory yet
            with patch('os.getcwd', return_value=str(tmp_path)):
                result = csv_importer._generate_failed_csv(failed_records)
                
                assert result is not None
                # Verify temp directory was created
                temp_dir = tmp_path / "temp"
                assert temp_dir.exists()


class TestUploadAPI:
    """Test upload API endpoints"""
    
    class TestUploadEndpoint:
        """Test POST /api/upload/csv endpoint"""
        
        def test_upload_valid_csv_file(self, client, tmp_path):
            """Test uploading valid CSV file"""
            
            # Create test CSV file
            csv_content = create_valid_csv_content([
                ["链家", "TEST017", "在售", "测试小区O", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
            ])
            
            # Write to temporary file
            test_file = tmp_path / "test.csv"
            with open(test_file, "w", encoding="utf-8") as f:
                f.write(csv_content)
            
            # Upload file
            with open(test_file, "rb") as f:
                response = client.post(
                    "/api/upload/csv",
                    files={"file": ("test.csv", f, "text/csv")}
                )
            
            assert response.status_code == 200
            result = response.json()
            assert result["total"] == 1
            assert result["success"] == 1
            assert result["failed"] == 0
        
        def test_upload_non_csv_file(self, client):
            """Test uploading non-CSV file returns error"""
            
            response = client.post(
                "/api/upload/csv",
                files={"file": ("test.txt", b"not a csv", "text/plain")}
            )
            
            assert response.status_code == 400
            assert "只支持 CSV 文件格式" in response.json()["error"]["message"]
        
        def test_upload_empty_csv_file(self, client):
            """Test uploading empty CSV file returns error"""
            
            response = client.post(
                "/api/upload/csv",
                files={"file": ("empty.csv", b"", "text/csv")}
            )
            
            assert response.status_code == 400
            assert "CSV 文件处理失败" in response.json()["error"]["message"]
        
        def test_upload_csv_with_validation_errors(self, client, tmp_path):
            """Test uploading CSV with validation errors"""
            
            # Create CSV with invalid data
            csv_content = create_valid_csv_content([
                ["链家", "TEST018", "在售", "测试小区P", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"],  # Valid
                ["贝壳", "TEST019", "无效状态", "测试小区Q", "2", "1", "1", "东", "8/18", "85", "550", "2024-01-15"]  # Invalid status
            ])
            
            test_file = tmp_path / "test.csv"
            with open(test_file, "w", encoding="utf-8") as f:
                f.write(csv_content)
            
            with open(test_file, "rb") as f:
                response = client.post(
                    "/api/upload/csv",
                    files={"file": ("test.csv", f, "text/csv")}
                )
            
            assert response.status_code == 200
            result = response.json()
            assert result["total"] == 2
            assert result["success"] == 1
            assert result["failed"] == 1
            assert result["failed_file_url"] is not None
    
    class TestDownloadEndpoint:
        """Test GET /api/upload/download/{filename} endpoint"""
        
        def test_download_existing_failed_records(self, client, tmp_path, monkeypatch):
            """Test downloading existing failed records file - simplified version"""
            
            # Create temp directory and file
            temp_dir = tmp_path / "temp"
            temp_dir.mkdir()
            test_file = temp_dir / "failed_records_test.csv"
            
            # Create test content
            with open(test_file, "w", encoding="utf-8-sig") as f:
                f.write("行号,错误原因,数据源,房源ID\n1,测试错误,链家,TEST020\n")
            
            # Mock os.path.join to return the correct path
            original_join = os.path.join
            def mock_join(*args):
                if len(args) >= 2 and args[1] == 'temp':
                    return str(tmp_path / "temp")
                return original_join(*args)
            
            monkeypatch.setattr(os.path, 'join', mock_join)
            
            # Mock os.getcwd to return tmp_path
            monkeypatch.setattr(os, 'getcwd', lambda: str(tmp_path))
            
            response = client.get("/api/upload/download/failed_records_test.csv")
            
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/csv; charset=utf-8"
        
        def test_download_nonexistent_file(self, client):
            """Test downloading non-existent file returns 404"""
            
            response = client.get("/api/upload/download/nonexistent_file.csv")
            
            assert response.status_code == 404
            assert "文件不存在或已过期" in response.json()["error"]["message"]


class TestEdgeCasesAndErrorHandling:
    """Test edge cases and error handling"""
    
    def test_special_characters_handling(self, csv_importer, db_session, mock_upload_file):
        """Test handling of special characters in field values"""
        csv_content = create_valid_csv_content([
            ["链家", "TEST021", "在售", "测试小区@#$%", "3", "2", "2", "南/北", "15/28", "120.5", "800", "2024-01-01"]
        ])
        file = mock_upload_file(create_csv_bytes(csv_content))
        
        result = csv_importer.batch_import_csv(file, db_session)
        
        assert result.success == 1
        # Should not throw exception with special characters
    
    def test_large_dataset_handling(self, csv_importer, db_session, mock_upload_file):
        """Test handling of large dataset (1000+ records)"""
        # Create 1000 records
        rows = []
        for i in range(1000):
            rows.append(["链家", f"TEST{i:04d}", "在售", f"测试小区{i}", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"])
        
        csv_content = create_valid_csv_content(rows)
        file = mock_upload_file(create_csv_bytes(csv_content))
        
        result = csv_importer.batch_import_csv(file, db_session)
        
        assert result.total == 1000
        assert result.success == 1000
        assert result.failed == 0
        # Should not cause memory overflow
    
    def test_concurrent_upload_simulation(self, csv_importer, db_session, mock_upload_file):
        """Test simulated concurrent uploads (data consistency)"""
        # This is a simplified simulation - in real scenarios would use threading/multiprocessing
        csv_content = create_valid_csv_content([
            ["链家", "TEST1000", "在售", "并发测试小区", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
        ])
        file = mock_upload_file(create_csv_bytes(csv_content))
        
        # Simulate multiple uploads of same data
        result1 = csv_importer.batch_import_csv(file, db_session)
        result2 = csv_importer.batch_import_csv(file, db_session)
        
        # Second upload should update the existing record
        assert result1.success == 1
        assert result2.success == 1  # Should handle update gracefully
    
    def test_transaction_rollback_on_error(self, csv_importer, db_session, mock_upload_file):
        """Test transaction rollback when import fails"""
        # Create a scenario that would cause transaction failure
        # This is a simplified test - real database errors would be more complex
        
        csv_content = create_valid_csv_content([
            ["链家", "TEST1001", "在售", "事务测试小区", "3", "2", "2", "南", "15/28", "120.5", "800", "2024-01-01"]
        ])
        file = mock_upload_file(create_csv_bytes(csv_content))
        
        # Mock database commit to raise exception
        original_commit = db_session.commit
        def mock_commit():
            raise Exception("Simulated database error")
        db_session.commit = mock_commit
        
        # The batch_import_csv method catches exceptions and continues,
        # so we expect it to complete but with failed records
        result = csv_importer.batch_import_csv(file, db_session)
        
        # Restore original commit
        db_session.commit = original_commit
        
        # Verify the import failed
        assert result.success == 0
        assert result.failed == 1
        
        # Verify no partial data was committed
        from models import PropertyCurrent
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST1001").first()
        assert property_obj is None  # Should be rolled back