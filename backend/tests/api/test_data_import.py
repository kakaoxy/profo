"""
数据导入API测试
"""
import pytest
import io
from fastapi.testclient import TestClient


class TestDataImport:
    """数据导入测试类"""
    
    def test_get_csv_template(self, client: TestClient, authenticated_headers: dict):
        """测试获取CSV模板"""
        response = client.get("/api/v1/data-import/csv/template/properties", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "template_fields" in data
        assert "sample_data" in data
        assert "required_fields" in data
        assert "field_descriptions" in data
        
        # 验证必需字段
        assert "community_id" in data["required_fields"]
        assert "status" in data["required_fields"]
        
        # 验证字段描述
        assert "community_id" in data["field_descriptions"]
        assert "status" in data["field_descriptions"]
    
    def test_import_csv_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试CSV导入成功"""
        # 创建CSV内容
        csv_content = f"""community_id,status,layout_bedrooms,area_sqm,listing_price_wan
{setup_basic_data["community_id"]},在售,2,55.0,240.0
{setup_basic_data["community_id"]},已成交,3,80.0,350.0"""
        
        # 创建文件对象
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        # 上传文件
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "success_count" in data
        assert "error_count" in data
        assert data["success_count"] == 2
        assert data["error_count"] == 0
        
        # 验证房源已创建
        properties_response = client.get("/api/v1/properties/", headers=authenticated_headers)
        properties = properties_response.json()
        assert len(properties) == 2
    
    def test_import_csv_invalid_file_format(self, client: TestClient, authenticated_headers: dict):
        """测试导入非CSV文件失败"""
        # 创建非CSV文件
        txt_content = "This is not a CSV file"
        txt_file = io.BytesIO(txt_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.txt", txt_file, "text/plain")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 400
        assert "文件格式错误" in response.json()["detail"]
    
    def test_import_csv_missing_required_fields(self, client: TestClient, authenticated_headers: dict):
        """测试导入缺少必需字段的CSV"""
        # 创建缺少必需字段的CSV
        csv_content = """layout_bedrooms,area_sqm
2,55.0
3,80.0"""
        
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 0
        assert data["error_count"] == 2
        assert len(data["errors"]) > 0
        assert "缺少必需字段" in data["errors"][0]
    
    def test_import_csv_invalid_community_id(self, client: TestClient, authenticated_headers: dict):
        """测试导入无效小区ID的CSV"""
        # 创建包含无效小区ID的CSV
        csv_content = """community_id,status
999,在售
888,已成交"""
        
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 0
        assert data["error_count"] == 2
        assert len(data["errors"]) > 0
        assert "小区ID" in data["errors"][0] and "不存在" in data["errors"][0]
    
    def test_import_csv_mixed_results(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试CSV导入混合结果（部分成功，部分失败）"""
        # 创建混合数据的CSV
        csv_content = f"""community_id,status,layout_bedrooms
{setup_basic_data["community_id"]},在售,2
999,在售,3
{setup_basic_data["community_id"]},已成交,1"""
        
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 1
        assert len(data["errors"]) == 1
        
        # 验证成功的房源已创建
        properties_response = client.get("/api/v1/properties/", headers=authenticated_headers)
        properties = properties_response.json()
        assert len(properties) == 2
    
    def test_import_csv_malformed_data(self, client: TestClient, authenticated_headers: dict):
        """测试导入格式错误的CSV"""
        # 创建格式错误的CSV
        csv_content = """This is not a proper CSV format
community_id,status
invalid data here"""
        
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")},
            headers=authenticated_headers
        )
        
        assert response.status_code == 400
        assert "文件处理失败" in response.json()["detail"]
    
    def test_sync_external_data(self, client: TestClient, authenticated_headers: dict):
        """测试同步外部数据"""
        response = client.post("/api/v1/data-import/sync/external-data", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "status" in data
        assert "synced_records" in data
        assert "timestamp" in data
        assert data["status"] == "success"
    
    def test_import_csv_without_auth(self, client: TestClient):
        """测试无认证导入CSV失败"""
        csv_content = "community_id,status\n1,在售"
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        
        response = client.post(
            "/api/v1/data-import/csv/properties",
            files={"file": ("test.csv", csv_file, "text/csv")}
        )
        
        assert response.status_code == 403
    
    def test_get_template_without_auth(self, client: TestClient):
        """测试无认证获取模板失败"""
        response = client.get("/api/v1/data-import/csv/template/properties")
        assert response.status_code == 403
