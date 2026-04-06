# """
# 项目核心业务服务 (重构后入口文件)

# 此文件现在作为入口点，从新的组件化模块中导出 ProjectCoreService。

# 组件结构：
# - services.core.project_core_service: 核心业务服务主类
# - services.utils.date_parser: 日期解析工具
# - services.builders.project_response_builder: 响应数据构建器
# - services.queries.project_query: 项目查询服务
# - services.state.project_state_manager: 状态管理器

# 迁移说明：
# 原文件超过600行，已按功能职责拆分为多个独立组件：
# 1. 工具函数独立到 utils 模块
# 2. 响应构建逻辑独立到 builders 模块
# 3. 查询逻辑独立到 queries 模块
# 4. 状态管理独立到 state 模块
# 5. 核心业务逻辑保留在 core 模块
# """

# 为了保持向后兼容，从新的组件模块重新导出

from services.core import ProjectCoreService

__all__ = ["ProjectCoreService"]