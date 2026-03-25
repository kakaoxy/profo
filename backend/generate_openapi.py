"""
生成 OpenAPI JSON 文件
"""
import json
import sys
import os

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app

# 生成 OpenAPI schema
schema = app.openapi()

# 保存到文件
with open('openapi.json', 'w', encoding='utf-8') as f:
    json.dump(schema, f, ensure_ascii=False, indent=2)

print('OpenAPI schema 已生成到 openapi.json')
path_count = len(schema.get("paths", {}))
print(f'包含 {path_count} 个路径')

# 检查是否包含 L4 Marketing 路由
paths = schema.get("paths", {})
l4_paths = [p for p in paths if "l4-marketing" in p]
print(f'其中 L4 Marketing 路由: {len(l4_paths)} 个')
for p in l4_paths[:5]:
    print(f'  - {p}')
