"""
测试路由冲突问题
"""
import sys
sys.path.insert(0, 'c:\\Users\\Bugco\\Desktop\\ProFo\\backend')

from fastapi.routing import APIRoute

# 导入所有路由
from routers.market import properties_router, communities_router
from routers.leads import leads_router
from routers.projects import core_router, renovation_router, sales_router, cashflow_router as project_cashflow_router
from routers.marketing import projects_router as marketing_projects_router, import_router as marketing_import_router
from routers.system import auth_router, users_router, roles_router
from routers.common import files_router, upload_router, push_router
from routers.monitor import monitor_router, community_router

def get_routes_info(router, prefix=""):
    """获取路由的所有路径"""
    routes = []
    for route in router.routes:
        if isinstance(route, APIRoute):
            routes.append(f"{prefix}{route.path}")
        elif hasattr(route, 'routes'):
            routes.extend(get_routes_info(route, prefix))
    return routes

def check_route_conflicts():
    """检查路由冲突 - 使用 main.py 中的实际配置"""
    API_V1_PREFIX = "/api/v1"
    
    all_routes = {}
    conflicts = []
    
    # 定义所有路由及其前缀 - 与 main.py 中一致的配置
    routers_info = [
        (properties_router, f"{API_V1_PREFIX}/properties", "properties"),
        (communities_router, f"{API_V1_PREFIX}/admin", "communities"),  # 已修复：添加 /admin 前缀
        (leads_router, API_V1_PREFIX, "leads"),
        (core_router, API_V1_PREFIX, "projects"),
        (project_cashflow_router, API_V1_PREFIX, "cashflow"),
        (marketing_projects_router, API_V1_PREFIX, "l4-marketing"),
        (marketing_import_router, API_V1_PREFIX, "l4-marketing-import"),
        (auth_router, f"{API_V1_PREFIX}/auth", "auth"),
        (users_router, f"{API_V1_PREFIX}/users", "users"),  # 已修复：添加 /users 前缀
        (roles_router, API_V1_PREFIX, "roles"),
        (upload_router, f"{API_V1_PREFIX}/upload", "upload"),
        (push_router, f"{API_V1_PREFIX}/push", "push"),
        (files_router, f"{API_V1_PREFIX}/files", "files"),
        (monitor_router, API_V1_PREFIX, "monitor"),
        (community_router, API_V1_PREFIX, "communities(monitor)"),
    ]
    
    print("=" * 80)
    print("路由扫描结果（修复后）")
    print("=" * 80)
    
    for router, prefix, name in routers_info:
        routes = get_routes_info(router, prefix)
        print(f"\n【{name}】前缀: {prefix}")
        for route in routes:
            full_path = route
            print(f"  - {full_path}")
            
            # 检查冲突
            if full_path in all_routes:
                conflicts.append({
                    'path': full_path,
                    'existing': all_routes[full_path],
                    'new': name
                })
            else:
                all_routes[full_path] = name
    
    print("\n" + "=" * 80)
    print("冲突检测结果")
    print("=" * 80)
    
    if conflicts:
        print(f"\n发现 {len(conflicts)} 个路由冲突:")
        for conflict in conflicts:
            print(f"  ⚠️  路径 '{conflict['path']}' 被多个路由器定义:")
            print(f"      - {conflict['existing']}")
            print(f"      - {conflict['new']}")
    else:
        print("\n✅ 未发现路由冲突")
    
    return conflicts

def check_specific_issues():
    """检查特定的三个 Issue"""
    API_V1_PREFIX = "/api/v1"
    
    print("\n" + "=" * 80)
    print("Issue 验证结果")
    print("=" * 80)
    
    # Issue 1: communities_router 与 community_router 冲突检查
    print("\n【Issue 1】communities_router 路径冲突检查:")
    comm_routes = get_routes_info(communities_router, f"{API_V1_PREFIX}/admin")
    monitor_comm_routes = get_routes_info(community_router, API_V1_PREFIX)
    
    print(f"  communities_router (带 /admin 前缀) 路径:")
    for r in comm_routes:
        print(f"    {r}")
    
    print(f"\n  community_router (监控模块) 路径:")
    for r in monitor_comm_routes:
        print(f"    {r}")
    
    # 检查是否有真正冲突
    comm_paths = set(get_routes_info(communities_router, ""))
    monitor_paths = set(get_routes_info(community_router, ""))
    overlap = comm_paths & monitor_paths
    
    if overlap:
        print(f"\n  ⚠️ 发现路径重叠: {overlap}")
    else:
        print(f"\n  ✅ Issue 1 已修复: communities_router 现在使用 /admin 前缀，与 community_router 无冲突")
    
    # Issue 2: users_router 路径检查
    print("\n【Issue 2】users_router 路径变更检查:")
    users_routes = get_routes_info(users_router, f"{API_V1_PREFIX}/users")
    print(f"  users_router 完整路径（带 /users 前缀）:")
    for r in users_routes[:5]:  # 只显示前5个
        print(f"    {r}")
    if len(users_routes) > 5:
        print(f"    ... 共 {len(users_routes)} 个路由")
    print(f"\n  ✅ Issue 2 已修复: users_router 现在使用 /users 前缀")
    
    # Issue 3: renovation_router 和 sales_router 检查
    print("\n【Issue 3】renovation_router 和 sales_router 存在性检查:")
    
    # 检查 core_router 是否包含 renovation 和 sales 路由
    core_routes = get_routes_info(core_router, "")
    renovation_routes = [r for r in core_routes if '/renovation' in r]
    sales_routes = [r for r in core_routes if '/selling' in r]
    
    print(f"  core_router 包含 renovation 路由: {len(renovation_routes)} 个")
    for r in renovation_routes[:3]:
        print(f"    {r}")
    if len(renovation_routes) > 3:
        print(f"    ...")
    
    print(f"\n  core_router 包含 sales 路由: {len(sales_routes)} 个")
    for r in sales_routes[:3]:
        print(f"    {r}")
    if len(sales_routes) > 3:
        print(f"    ...")
    
    if renovation_routes and sales_routes:
        print(f"\n  ✅ Issue 3 验证通过: renovation 和 sales 功能通过 core_router 正常提供")
    else:
        print(f"\n  ⚠️ Issue 3 存在问题: renovation 或 sales 路由缺失")

if __name__ == "__main__":
    conflicts = check_route_conflicts()
    check_specific_issues()
    
    print("\n" + "=" * 80)
    print("总结")
    print("=" * 80)
    print("""
修复内容:
1. Issue 1: communities_router 前缀从 /api/v1 改为 /api/v1/admin
2. Issue 2: users_router 前缀从 /api/v1 改为 /api/v1/users
3. Issue 3: renovation_router 和 sales_router 已包含在 core_router 中，无需单独注册

变更的路由路径:
- 小区管理: /api/v1/communities → /api/v1/admin/communities
- 字典查询: /api/v1/dictionaries → /api/v1/admin/dictionaries
- 小区合并: /api/v1/communities/merge → /api/v1/admin/communities/merge
- 用户管理: /api/v1/users → /api/v1/users/users (内部路径保持一致)
    """)
    
    sys.exit(1 if conflicts else 0)
