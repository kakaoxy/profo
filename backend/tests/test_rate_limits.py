"""迭代 6: 速率限制测试.

验证所有需要的端点都有 @limiter.limit() 装饰器。
使用 hasattr(func, '__wrapped__') 检测（slowapi 的 @limiter.limit() 会通过 @wraps 包装函数）。
"""

from collections.abc import Callable


def _check_has_rate_limit(func: Callable, name: str) -> None:
    """检查函数是否被 @limiter.limit() 装饰器包装.

    slowapi 的 Limiter.limit() 返回一个包装函数，该包装函数：
    1. 通过 @wraps 保留 __wrapped__ 指向原始函数
    2. 在 __closure__ 中捕获了 Limiter 实例

    因此，可靠的检测方式是：同时检查 __wrapped__ 属性存在，
    且闭包中包含 slowapi.extension.Limiter 实例。
    这可以避免其他同样使用 @wraps 的装饰器导致误报。
    """
    assert hasattr(func, "__wrapped__"), f"{name} 缺少 @limiter.limit() 速率限制装饰器"

    has_limiter = False
    if hasattr(func, "__closure__") and func.__closure__:
        for cell in func.__closure__:
            val = cell.cell_contents
            if "Limiter" in str(type(val)):
                has_limiter = True
                break

    assert has_limiter, f"{name} 虽然存在 __wrapped__，但未检测到 slowapi Limiter 实例，可能未被 @limiter.limit() 装饰"


class TestAuthRateLimits:
    def test_refresh_has_rate_limit(self) -> None:
        from routers.system.auth import refresh_access_token

        _check_has_rate_limit(refresh_access_token, "POST /auth/refresh")

    def test_existing_limits_unchanged_token(self) -> None:
        from routers.system.auth import login_for_access_token

        _check_has_rate_limit(login_for_access_token, "POST /auth/token")

    def test_existing_limits_unchanged_login(self) -> None:
        from routers.system.auth import login

        _check_has_rate_limit(login, "POST /auth/login")


class TestUsersRateLimits:
    def test_get_users_has_rate_limit(self) -> None:
        from routers.system.users import get_users

        _check_has_rate_limit(get_users, "GET /users/")

    def test_init_system_data_has_rate_limit(self) -> None:
        from routers.system.users import init_system_data

        _check_has_rate_limit(init_system_data, "POST /users/init-data")

    def test_update_user_has_rate_limit(self) -> None:
        from routers.system.users import update_user

        _check_has_rate_limit(update_user, "PUT /users/{user_id}")

    def test_delete_user_has_rate_limit(self) -> None:
        from routers.system.users import delete_user

        _check_has_rate_limit(delete_user, "DELETE /users/{user_id}")

    def test_existing_limits_unchanged_create_user(self) -> None:
        from routers.system.users import create_user

        _check_has_rate_limit(create_user, "POST /users/")

    def test_existing_limits_unchanged_reset_password(self) -> None:
        from routers.system.users import reset_user_password

        _check_has_rate_limit(reset_user_password, "PUT /users/{id}/reset-password")

    def test_existing_limits_unchanged_change_password(self) -> None:
        from routers.system.users import change_password

        _check_has_rate_limit(change_password, "POST /users/change-password")


class TestRolesRateLimits:
    def test_update_role_has_rate_limit(self) -> None:
        from routers.system.roles import update_role

        _check_has_rate_limit(update_role, "PUT /roles/{role_id}")

    def test_delete_role_has_rate_limit(self) -> None:
        from routers.system.roles import delete_role

        _check_has_rate_limit(delete_role, "DELETE /roles/{role_id}")


class TestProjectsRateLimits:
    def test_create_project_has_rate_limit(self) -> None:
        from routers.projects.core import create_project

        _check_has_rate_limit(create_project, "POST /projects")

    def test_export_projects_has_rate_limit(self) -> None:
        from routers.projects.core import export_projects

        _check_has_rate_limit(export_projects, "GET /projects/export")

    def test_update_project_has_rate_limit(self) -> None:
        from routers.projects.core import update_project

        _check_has_rate_limit(update_project, "PUT /projects/{project_id}")

    def test_delete_project_has_rate_limit(self) -> None:
        from routers.projects.core import delete_project

        _check_has_rate_limit(delete_project, "DELETE /projects/{project_id}")

    def test_update_project_status_has_rate_limit(self) -> None:
        from routers.projects.core import update_project_status

        _check_has_rate_limit(update_project_status, "PUT /projects/{id}/status")

    def test_update_renovation_stage_has_rate_limit(self) -> None:
        from routers.projects.renovation import update_renovation_stage

        _check_has_rate_limit(update_renovation_stage, "PUT /{id}/renovation")

    def test_delete_renovation_photo_has_rate_limit(self) -> None:
        from routers.projects.renovation import delete_renovation_photo

        _check_has_rate_limit(delete_renovation_photo, "DELETE /{id}/renovation/photos/{pid}")

    def test_update_renovation_contract_has_rate_limit(self) -> None:
        from routers.projects.renovation import update_renovation_contract

        _check_has_rate_limit(update_renovation_contract, "PUT /{id}/renovation/contract")

    def test_update_sales_roles_has_rate_limit(self) -> None:
        from routers.projects.sales import update_sales_roles

        _check_has_rate_limit(update_sales_roles, "PUT /{id}/selling/roles")

    def test_delete_sales_record_has_rate_limit(self) -> None:
        from routers.projects.sales import delete_sales_record

        _check_has_rate_limit(delete_sales_record, "DELETE /{id}/selling/records/{rid}")

    def test_delete_cashflow_record_has_rate_limit(self) -> None:
        from routers.projects.cashflow import delete_cashflow_record

        _check_has_rate_limit(delete_cashflow_record, "DELETE /projects/{id}/cashflow/{rid}")


class TestMarketingRateLimits:
    def test_create_marketing_project_has_rate_limit(self) -> None:
        from routers.marketing.projects import create_marketing_project

        _check_has_rate_limit(create_marketing_project, "POST /admin/l4-marketing/projects")

    def test_update_marketing_project_has_rate_limit(self) -> None:
        from routers.marketing.projects import update_marketing_project

        _check_has_rate_limit(update_marketing_project, "PUT /admin/l4-marketing/projects/{id}")

    def test_delete_marketing_project_has_rate_limit(self) -> None:
        from routers.marketing.projects import delete_marketing_project

        _check_has_rate_limit(delete_marketing_project, "DELETE /admin/l4-marketing/projects/{id}")

    def test_update_marketing_media_has_rate_limit(self) -> None:
        from routers.marketing.projects import update_marketing_media

        _check_has_rate_limit(update_marketing_media, "PUT /admin/l4-marketing/media/{id}")

    def test_delete_marketing_media_has_rate_limit(self) -> None:
        from routers.marketing.projects import delete_marketing_media

        _check_has_rate_limit(delete_marketing_media, "DELETE /admin/l4-marketing/media/{id}")

    def test_update_media_sort_order_has_rate_limit(self) -> None:
        from routers.marketing.projects import update_media_sort_order

        _check_has_rate_limit(update_media_sort_order, "PUT /admin/l4-marketing/projects/{id}/media/sort-order")


class TestLeadsRateLimits:
    def test_update_lead_has_rate_limit(self) -> None:
        from routers.leads.core import update_lead

        _check_has_rate_limit(update_lead, "PUT /leads/{lead_id}")

    def test_delete_lead_has_rate_limit(self) -> None:
        from routers.leads.core import delete_lead

        _check_has_rate_limit(delete_lead, "DELETE /leads/{lead_id}")


class TestMonitorRateLimits:
    def test_remove_competitor_has_rate_limit(self) -> None:
        from routers.monitor.monitor import remove_competitor

        _check_has_rate_limit(remove_competitor, "DELETE /monitor/communities/{id}/competitors/{cid}")


class TestMarketRateLimits:
    def test_merge_communities_has_rate_limit(self) -> None:
        from routers.market.communities import merge_communities

        _check_has_rate_limit(merge_communities, "POST /admin/communities/merge")

    def test_create_community_has_rate_limit(self) -> None:
        from routers.market.communities import create_community

        _check_has_rate_limit(create_community, "POST /admin/communities")


class TestUploadRateLimits:
    def test_existing_limit_unchanged_upload_csv(self) -> None:
        from routers.common.upload import create_import_task

        _check_has_rate_limit(create_import_task, "POST /upload/csv")

    def test_existing_limit_unchanged_file_upload(self) -> None:
        from routers.common.files import upload_file

        _check_has_rate_limit(upload_file, "POST /files/upload")
