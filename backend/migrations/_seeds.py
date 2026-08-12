"""迁移种子数据：权限点与角色权限集.

集中存放权限系统相关种子数据，便于维护与审查：
- _PERMISSIONS_SEED：系统权限点字典（覆盖全部模块的 API/button 权限点）
- _ROLE_PERMISSIONS_SEED：内置角色（admin/operator/user/customer）默认权限集

系统预置科目种子数据（_INITIAL_SUBJECTS）已拆分至 _seeds_subjects.py。
本模块仅包含纯 Python 数据，无副作用，无外部依赖。
"""

# 权限点种子数据：所有 is_system=True，覆盖系统全部模块的 API 权限点
_PERMISSIONS_SEED: list[dict] = [
    # 用户管理模块
    {
        "code": "user:read",
        "name": "查看用户",
        "module": "user",
        "category": "api",
        "sort_order": 10,
        "description": "查看用户列表与详情",
    },
    {
        "code": "user:create",
        "name": "创建用户",
        "module": "user",
        "category": "api",
        "sort_order": 20,
        "description": "新建用户账号",
    },
    {
        "code": "user:update",
        "name": "更新用户",
        "module": "user",
        "category": "api",
        "sort_order": 30,
        "description": "编辑用户信息与角色分配",
    },
    {
        "code": "user:delete",
        "name": "删除用户",
        "module": "user",
        "category": "api",
        "sort_order": 40,
        "description": "删除用户账号",
    },
    {
        "code": "user:reset_password",
        "name": "重置密码",
        "module": "user",
        "category": "api",
        "sort_order": 50,
        "description": "重置用户密码",
    },
    {
        "code": "user:unbind_wechat",
        "name": "解绑微信",
        "module": "user",
        "category": "api",
        "sort_order": 60,
        "description": "解绑用户微信账号（含直接绑定与经合并临时账号的间接绑定）",
    },
    # 角色管理模块
    {
        "code": "role:read",
        "name": "查看角色",
        "module": "role",
        "category": "api",
        "sort_order": 10,
        "description": "查看角色列表与详情",
    },
    {
        "code": "role:create",
        "name": "创建角色",
        "module": "role",
        "category": "api",
        "sort_order": 20,
        "description": "新建角色",
    },
    {
        "code": "role:update",
        "name": "更新角色",
        "module": "role",
        "category": "api",
        "sort_order": 30,
        "description": "编辑角色信息与权限分配",
    },
    {
        "code": "role:delete",
        "name": "删除角色",
        "module": "role",
        "category": "api",
        "sort_order": 40,
        "description": "删除（停用）角色",
    },
    {
        "code": "role:assign_permissions",
        "name": "分配角色权限",
        "module": "role",
        "category": "api",
        "sort_order": 50,
        "description": "为角色分配权限点",
    },
    # 权限字典模块
    {
        "code": "permission:read",
        "name": "查看权限字典",
        "module": "permission",
        "category": "api",
        "sort_order": 10,
        "description": "查看权限点列表",
    },
    {
        "code": "permission:manage",
        "name": "管理权限字典",
        "module": "permission",
        "category": "api",
        "sort_order": 20,
        "description": "创建/更新/删除权限点",
    },
    # 房源管理模块
    {
        "code": "property:read",
        "name": "查看房源",
        "module": "property",
        "category": "api",
        "sort_order": 10,
        "description": "查看房源列表与详情",
    },
    {
        "code": "property:write",
        "name": "编辑房源",
        "module": "property",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑房源",
    },
    {
        "code": "property:upload",
        "name": "批量上传房源",
        "module": "property",
        "category": "api",
        "sort_order": 30,
        "description": "批量上传房源数据",
    },
    {
        "code": "property:governance",
        "name": "数据治理",
        "module": "property",
        "category": "api",
        "sort_order": 40,
        "description": "房源数据治理操作",
    },
    # 线索管理模块
    {
        "code": "lead:read",
        "name": "查看线索",
        "module": "lead",
        "category": "api",
        "sort_order": 10,
        "description": "查看线索列表与详情",
    },
    {
        "code": "lead:write",
        "name": "编辑线索",
        "module": "lead",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑线索",
    },
    {
        "code": "lead:create",
        "name": "创建线索",
        "module": "lead",
        "category": "api",
        "sort_order": 25,
        "description": "仅创建线索（不可修改/删除），供普通员工录入使用",
    },
    {
        "code": "lead:export",
        "name": "导出线索",
        "module": "lead",
        "category": "api",
        "sort_order": 30,
        "description": "导出线索数据",
    },
    {
        "code": "lead:submit",
        "name": "提交线索",
        "module": "lead",
        "category": "api",
        "sort_order": 40,
        "description": "C 端提交线索",
    },
    {
        "code": "lead:upload_photo",
        "name": "上传线索图片",
        "module": "lead",
        "category": "api",
        "sort_order": 50,
        "description": "在线索录入流程中上传实拍图片（与 property:upload 解耦）",
    },
    # 项目管理模块
    {
        "code": "project:read",
        "name": "查看项目",
        "module": "project",
        "category": "api",
        "sort_order": 10,
        "description": "查看项目列表与详情",
    },
    {
        "code": "project:write",
        "name": "编辑项目",
        "module": "project",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑项目",
    },
    {
        "code": "project:delete",
        "name": "删除项目",
        "module": "project",
        "category": "api",
        "sort_order": 30,
        "description": "删除项目",
    },
    # project 业务身份权限点（button 类，配合业务身份双通道校验，is_system=True）
    {
        "code": "project:renovation:upload_photo",
        "name": "上传装修照片",
        "module": "project",
        "category": "button",
        "sort_order": 40,
        "description": "装修阶段上传/删除照片",
    },
    {
        "code": "project:renovation:complete_stage",
        "name": "完成装修阶段",
        "module": "project",
        "category": "button",
        "sort_order": 50,
        "description": "装修阶段完成阶段流转",
    },
    {
        "code": "project:sales:add_record",
        "name": "添加销售记录",
        "module": "project",
        "category": "button",
        "sort_order": 60,
        "description": "在售阶段添加带看/出价/面谈记录",
    },
    {
        "code": "project:sales:manage_team",
        "name": "维护销售团队",
        "module": "project",
        "category": "button",
        "sort_order": 70,
        "description": "维护销售团队 3 角色（渠道/讲房/谈判）",
    },
    # 财务台账模块
    {
        "code": "ledger:read",
        "name": "查看台账",
        "module": "ledger",
        "category": "api",
        "sort_order": 10,
        "description": "查看财务台账",
    },
    {
        "code": "ledger:write",
        "name": "编辑台账",
        "module": "ledger",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑台账记录",
    },
    {
        "code": "ledger:settle",
        "name": "台账结算",
        "module": "ledger",
        "category": "api",
        "sort_order": 30,
        "description": "项目财务结算操作",
    },
    # 科目管理模块
    {
        "code": "subject:read",
        "name": "查看科目",
        "module": "subject",
        "category": "api",
        "sort_order": 10,
        "description": "查看科目列表与详情",
    },
    {
        "code": "subject:write",
        "name": "编辑科目",
        "module": "subject",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑/删除科目",
    },
    # 投资管理模块
    {
        "code": "investment:read",
        "name": "查看跟投",
        "module": "investment",
        "category": "api",
        "sort_order": 10,
        "description": "查看跟投项目",
    },
    {
        "code": "investment:write",
        "name": "编辑跟投",
        "module": "investment",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑跟投",
    },
    {
        "code": "investment:copy",
        "name": "复制跟投",
        "module": "investment",
        "category": "api",
        "sort_order": 30,
        "description": "复制跟投到其他项目",
    },
    # L4 市场营销模块
    {
        "code": "l4_marketing:read",
        "name": "查看营销",
        "module": "l4_marketing",
        "category": "api",
        "sort_order": 10,
        "description": "查看营销项目",
    },
    {
        "code": "l4_marketing:write",
        "name": "编辑营销",
        "module": "l4_marketing",
        "category": "api",
        "sort_order": 20,
        "description": "新增/编辑营销项目",
    },
    # 审计日志模块
    {
        "code": "operation_log:read",
        "name": "查看审计日志",
        "module": "operation_log",
        "category": "api",
        "sort_order": 10,
        "description": "查看操作审计日志",
    },
    # API Key 管理
    {
        "code": "api_key:manage",
        "name": "管理 API Key",
        "module": "api_key",
        "category": "api",
        "sort_order": 10,
        "description": "生成/撤销 API Key",
    },
    # C 端估价
    {
        "code": "valuation:write",
        "name": "提交估价",
        "module": "valuation",
        "category": "api",
        "sort_order": 10,
        "description": "C 端提交估价申请",
    },
]

# 内置角色 → 默认权限集（admin 拥有全部权限）
_ROLE_PERMISSIONS_SEED: dict[str, list[str]] = {
    "admin": [p["code"] for p in _PERMISSIONS_SEED],
    "operator": [
        # 业务读写
        "property:read",
        "property:write",
        "property:upload",
        "property:governance",
        "lead:read",
        "lead:write",
        "lead:export",
        "lead:upload_photo",
        "project:read",
        "project:write",
        # project 业务身份子权限码（user/customer 不分配，由业务身份豁免）
        "project:renovation:upload_photo",
        "project:renovation:complete_stage",
        "project:sales:add_record",
        "project:sales:manage_team",
        "ledger:read",
        "ledger:write",
        "ledger:settle",
        "subject:read",
        "subject:write",
        "investment:read",
        "investment:write",
        "investment:copy",
        "l4_marketing:read",
        "l4_marketing:write",
        # 运营可管理 API Key
        "api_key:manage",
    ],
    "user": [
        # 仅读取（不含 project:read：普通用户默认不应查看项目管理，
        # 如需开放请通过 UI 手动分配，迁移脚本不会自动补回）
        "property:read",
        "lead:read",
        # 普通员工仅可创建线索，不可修改/删除（lead:write 保留给 admin/operator）
        "lead:create",
        "lead:upload_photo",
        "ledger:read",
        "investment:read",
        "l4_marketing:read",
    ],
    "customer": [
        # C 端权限
        "valuation:write",
        "lead:submit",
    ],
}
