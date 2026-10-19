"""项目归档常量（单一权威源）.

独立于 ``archive.py`` 服务模块：``archive.py`` 依赖 ``internal/builder.py``，
而 builder（服务层公共构建路径）需引用可归档状态集合，若从 ``archive.py``
导入会形成循环导入。常量先例：``documents.py::DOCUMENT_TEMPLATES``。

变更可归档状态集合只需改此元组，后端校验（archive 服务）与响应派生字段
（``can_archive``）自动同步；前端经 ``ProjectResponse.can_archive`` 消费，
无需改动。
"""

from models.common import ProjectStatus

# 可归档的项目状态：已售 / 已下架（业务确认的收口口径）
ARCHIVABLE_STATUSES: tuple[str, ...] = (ProjectStatus.SOLD.value, ProjectStatus.ENDED.value)
