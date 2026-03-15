# 项目表结构调整最终对照表

严格遵循你的要求：**所有字段名统一使用英文下划线命名（与原项目代码风格完全一致），功能/含义不变的字段100%沿用原有字段名，仅新增字段做规范命名**，之前已确认的业务逻辑、映射规则、转换要求、删除规则全部保持不变，可直接用于代码开发与迁移落地。

---

## 一、整体架构调整总览

| 序号 | 目标表名（英文）                          | 原来源核心表      | 核心处理方式              | 关键说明                                                                      |
| :--- | :---------------------------------------- | :---------------- | :------------------------ | :---------------------------------------------------------------------------- |
| 1    | projects（项目基础信息表）                | projects          | 核心字段精简保留          | 仅保留房源物理属性+生命周期核心状态，剥离所有非核心字段，**表名沿用原名**     |
| 2    | project_contracts（签约合同表）           | projects          | 签约字段拆分迁移+规则补全 | 提取原签约相关字段，沿用原有字段名，仅补充合同管控类新增字段                  |
| 3    | project_owners（业主信息表）              | projects          | 业主字段拆分迁移+结构升级 | 提取原业主信息字段，100%沿用原有字段名，新增多人员类型支持                    |
| 4    | project_sales（销售交易表）               | projects          | 销售字段拆分迁移+格式统一 | 提取原销售全流程字段，人员类字段统一加`_id`后缀（适配存人员ID的规则）         |
| 5    | project_follow_ups（项目跟进记录表）      | 无原表            | 全新创建                  | 新增全流程跟进能力，无历史数据迁移                                            |
| 6    | project_evaluations（项目评估记录表）     | 无原表            | 全新创建                  | 新增全周期估值管理能力，无历史数据迁移                                        |
| 7    | project_interactions（互动过程明细表）    | sales_records     | 原表重构+字段映射         | 90%沿用原sales_records表字段名，仅做少量字段合并与规范调整                    |
| 8    | finance_records（财务流水明细表）         | cashflow_records  | 原表微调+规范命名         | 100%沿用原核心字段名，仅新增经办人ID字段                                      |
| 9    | project_status_logs（项目状态流转日志表） | 无原表            | 全新创建                  | 新增状态变更全链路留痕能力，无历史数据迁移                                    |
| 10   | project_renovations（装修信息表）         | 无原表            | 全新创建                  | 新增装修全流程管控能力，无历史数据迁移                                        |
| -    | renovation_photos（改造照片表）           | renovation_photos | 保留原表+关联调整         | 表名、字段名100%沿用，仅关联字段从project_id调整为关联project_renovations表id |

---

## 二、分表详细字段调整对照表（核心落地版）

### 1. projects（项目基础信息表，表名沿用原名）

| 目标英文字段名   | 原来源表 | 原来源字段名     | 字段约束                | 处理规则&转换要求                       | 命名说明                                   |
| :--------------- | :------- | :--------------- | :---------------------- | :-------------------------------------- | :----------------------------------------- |
| id               | projects | id               | 主键，非空              | 直接映射，沿用原项目主键ID              | 完全沿用原字段名                           |
| community_name   | projects | community_name   | 字符串，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“小区名”）         |
| area             | projects | area             | 数值型，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“产证面积(㎡)”）   |
| layout           | projects | layout           | 字符串，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“户型”）           |
| orientation      | projects | orientation      | 字符串，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“朝向”）           |
| address          | projects | address          | 字符串，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“物业地址”）       |
| status           | projects | status           | 字符串枚举，非空        | 直接原字段值迁移                        | 完全沿用原字段名（对应原“当前状态”）       |
| renovation_stage | projects | renovation_stage | 字符串枚举，可空        | 直接原字段值迁移                        | 完全沿用原字段名（对应原“当前改造子阶段”） |
| is_deleted       | 无原字段 | 新增             | 布尔型，非空，默认false | 新增逻辑删除标记，历史数据默认设为false | 新增规范命名                               |
| created_at       | projects | created_at       | 时间，非空              | 直接原字段值迁移                        | 完全沿用原字段名                           |
| updated_at       | projects | updated_at       | 时间，非空              | 直接原字段值迁移                        | 完全沿用原字段名                           |

---

### 2. project_contracts（签约合同表）

| 目标英文字段名        | 原来源表 | 原来源字段名          | 字段约束                | 处理规则&转换要求                                 | 命名说明                                             |
| :-------------------- | :------- | :-------------------- | :---------------------- | :------------------------------------------------ | :--------------------------------------------------- |
| id                    | 无原字段 | 新增                  | 主键，非空              | UUID/自增生成                                     | 新增规范命名                                         |
| project_id            | projects | id                    | 字符串，非空，软关联    | 绑定原项目主键ID                                  | 通用外键规范命名                                     |
| contract_no           | 无原字段 | 新增                  | 字符串，唯一索引，可空  | 新增字段，历史数据可补录/置空                     | 新增规范命名（对应原“合同编号”）                     |
| signing_price         | projects | signing_price         | 数值型，可空            | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“签约价格(万)”）             |
| signing_date          | projects | signing_date          | 时间，可空              | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“签约日期”）                 |
| signing_period        | projects | signing_period        | 数值型，可空            | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“合同周期(天)”）             |
| extension_period      | projects | extension_period      | 数值型，可空            | 原字段值×30天做单位转换（原单位为月，新单位为天） | 完全沿用原字段名（对应原“顺延期(天)”），仅做单位转换 |
| extension_rent        | projects | extension_rent        | 数值型，可空            | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“顺延期租金(元/月)”）        |
| cost_assumption       | projects | cost_assumption       | 字符串，可空            | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“税费及佣金承担方”）         |
| planned_handover_date | projects | planned_handover_date | 时间，可空              | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“业主交房时间”）             |
| other_agreements      | projects | other_agreements      | 长文本，可空            | 直接原字段值迁移                                  | 完全沿用原字段名（对应原“其他约定条款”）             |
| signing_materials     | projects | signing_materials     | JSON，可空              | 原JSON结构直接迁移，存储合同附件URL列表           | 完全沿用原字段名（对应原“合同附件URLs”）             |
| contract_status       | 无原字段 | 新增                  | 字符串枚举，非空        | 新增字段，历史生效合同默认设为「生效」            | 新增规范命名（对应原“合同状态”）                     |
| is_deleted            | 无原字段 | 新增                  | 布尔型，非空，默认false | 新增逻辑删除标记，历史数据默认设为false           | 新增规范命名                                         |
| created_at            | projects | created_at            | 时间，非空              | 沿用对应项目的创建时间                            | 通用规范命名                                         |
| updated_at            | projects | updated_at            | 时间，非空              | 沿用对应项目的更新时间                            | 通用规范命名                                         |

---

### 3. project_owners（业主信息表）

| 目标英文字段名 | 原来源表 | 原来源字段名  | 字段约束                | 处理规则&转换要求                       | 命名说明                             |
| :------------- | :------- | :------------ | :---------------------- | :-------------------------------------- | :----------------------------------- |
| id             | 无原字段 | 新增          | 主键，非空              | UUID/自增生成                           | 新增规范命名                         |
| project_id     | projects | id            | 字符串，非空，软关联    | 绑定原项目主键ID                        | 通用外键规范命名                     |
| owner_name     | projects | owner_name    | 字符串，可空            | 直接原字段值迁移                        | 完全沿用原字段名（对应原“业主姓名”） |
| owner_phone    | projects | owner_phone   | 字符串，可空            | 直接原字段值迁移，暂不做加密处理        | 完全沿用原字段名（对应原“联系方式”） |
| owner_id_card  | projects | owner_id_card | 字符串，可空            | 直接原字段值迁移，暂不做加密处理        | 完全沿用原字段名（对应原“身份证号”） |
| relation_type  | 无原字段 | 新增          | 字符串枚举，非空        | 新增字段，历史数据默认设为「业主」      | 新增规范命名（对应原“关系类型”）     |
| owner_info     | projects | owner_info    | 长文本，可空            | 原JSON字段内容扁平化迁移至此            | 完全沿用原字段名（对应原“备注”）     |
| is_deleted     | 无原字段 | 新增          | 布尔型，非空，默认false | 新增逻辑删除标记，历史数据默认设为false | 新增规范命名                         |
| created_at     | projects | created_at    | 时间，非空              | 沿用对应项目的创建时间                  | 通用规范命名                         |
| updated_at     | projects | updated_at    | 时间，非空              | 沿用对应项目的更新时间                  | 通用规范命名                         |

---

### 4. project_sales（销售交易表）

| 目标英文字段名     | 原来源表 | 原来源字段名    | 字段约束                | 处理规则&转换要求                              | 命名说明                                                        |
| :----------------- | :------- | :-------------- | :---------------------- | :--------------------------------------------- | :-------------------------------------------------------------- |
| id                 | 无原字段 | 新增            | 主键，非空              | UUID/自增生成                                  | 新增规范命名                                                    |
| project_id         | projects | id              | 字符串，非空，软关联    | 绑定原项目主键ID                               | 通用外键规范命名                                                |
| listing_date       | projects | listing_date    | 时间，可空              | 直接原字段值迁移                               | 完全沿用原字段名（对应原“上架日期”）                            |
| list_price         | projects | list_price      | 数值型，可空            | 直接原字段值迁移                               | 完全沿用原字段名（对应原“挂牌价(万)”）                          |
| sold_date          | projects | sold_date       | 时间，可空              | 直接原字段值迁移，无值则用原sold_at补全        | 完全沿用原字段名（对应原“成交时间”）                            |
| sold_price         | projects | sold_price      | 数值型，可空            | 直接原字段值迁移                               | 完全沿用原字段名（对应原“成交价(万)”）                          |
| channel_manager_id | projects | channel_manager | 字符串，可空            | 原姓名字段映射至人员管理表ID，历史数据可先置空 | 基于原字段名加`_id`后缀，适配存ID的规则（对应原“渠道负责人id”） |
| property_agent_id  | projects | property_agent  | 字符串，可空            | 原姓名字段映射至人员管理表ID，历史数据可先置空 | 基于原字段名加`_id`后缀，适配存ID的规则（对应原“房源维护人id”） |
| negotiator_id      | projects | negotiator      | 字符串，可空            | 原姓名字段映射至人员管理表ID，历史数据可先置空 | 基于原字段名加`_id`后缀，适配存ID的规则（对应原“联卖谈判人id”） |
| transaction_status | 无原字段 | 新增            | 字符串枚举，非空        | 新增字段，基于原项目status映射：在售/已售/下架 | 新增规范命名（对应原“交易状态”）                                |
| is_deleted         | 无原字段 | 新增            | 布尔型，非空，默认false | 新增逻辑删除标记，历史数据默认设为false        | 新增规范命名                                                    |
| created_at         | projects | created_at      | 时间，非空              | 沿用对应项目的创建时间                         | 通用规范命名                                                    |
| updated_at         | projects | updated_at      | 时间，非空              | 沿用对应项目的更新时间                         | 通用规范命名                                                    |

---

### 5. project_follow_ups（项目跟进记录表·全新创建）

| 目标英文字段名 | 字段约束             | 业务含义                                 | 命名规范说明     |
| :------------- | :------------------- | :--------------------------------------- | :--------------- |
| id             | 主键，非空           | 记录唯一标识                             | 通用主键命名     |
| project_id     | 字符串，非空，软关联 | 关联项目ID                               | 通用外键规范命名 |
| follow_up_type | 字符串枚举，非空     | 跟进方式（电话/微信/面谈/现场勘察/其他） | 新增规范命名     |
| content        | 长文本，可空         | 跟进详情文本                             | 通用简洁命名     |
| follow_up_at   | 时间，非空           | 跟进执行时间                             | 新增规范命名     |
| follower_id    | 字符串，可空         | 跟进人ID（关联人员表）                   | 新增规范命名     |
| created_at     | 时间，非空           | 创建时间                                 | 通用规范命名     |
| updated_at     | 时间，非空           | 更新时间                                 | 通用规范命名     |

---

### 6. project_evaluations（项目评估记录表·全新创建）

| 目标英文字段名   | 字段约束             | 业务含义                                 | 命名规范说明     |
| :--------------- | :------------------- | :--------------------------------------- | :--------------- |
| id               | 主键，非空           | 记录唯一标识                             | 通用主键命名     |
| project_id       | 字符串，非空，软关联 | 关联项目ID                               | 通用外键规范命名 |
| evaluation_type  | 字符串枚举，非空     | 评估类型（收房评估/改造后估值/市场调价） | 新增规范命名     |
| evaluation_price | 数值型，非空         | 评估价格(万)                             | 新增规范命名     |
| remark           | 长文本，可空         | 评估备注说明                             | 通用简洁命名     |
| evaluator_id     | 字符串，可空         | 评估人ID（关联人员表）                   | 新增规范命名     |
| evaluation_at    | 时间，非空           | 评估执行时间                             | 新增规范命名     |
| created_at       | 时间，非空           | 创建时间                                 | 通用规范命名     |
| updated_at       | 时间，非空           | 更新时间                                 | 通用规范命名     |

---

### 7. project_interactions（互动过程明细表·原sales_records重构）

| 目标英文字段名     | 原来源表      | 原来源字段名          | 字段约束             | 处理规则&转换要求                                | 命名说明                             |
| :----------------- | :------------ | :-------------------- | :------------------- | :----------------------------------------------- | :----------------------------------- |
| id                 | sales_records | id                    | 主键，非空           | 直接原字段值迁移                                 | 完全沿用原字段名                     |
| project_id         | sales_records | project_id            | 字符串，非空，软关联 | 直接原字段值迁移                                 | 完全沿用原字段名                     |
| record_type        | sales_records | record_type           | 字符串枚举，非空     | 直接原字段值映射（带看/出价/面谈）               | 完全沿用原字段名（对应原“互动类型”） |
| interaction_target | sales_records | customer_name         | 字符串，可空         | 原customer_name字段值迁移，补充customer_info内容 | 新增规范命名（对应原“互动对象”）     |
| content            | sales_records | notes/feedback/result | 长文本，可空         | 原3个字段内容合并扁平化迁移                      | 通用简洁命名（对应原“互动详情”）     |
| interaction_at     | sales_records | record_date           | 时间，非空           | 原record_date+record_time合并迁移                | 新增规范命名（对应原“互动时间”）     |
| operator_id        | sales_records | related_agent         | 字符串，可空         | 原姓名字段映射至人员管理表ID，历史数据可先置空   | 新增规范命名（对应原“操作人id”）     |
| created_at         | sales_records | created_at            | 时间，非空           | 直接原字段值迁移                                 | 完全沿用原字段名                     |
| updated_at         | sales_records | updated_at            | 时间，非空           | 直接原字段值迁移                                 | 完全沿用原字段名                     |

---

### 8. finance_records（财务流水明细表·原cashflow_records微调）

| 目标英文字段名 | 原来源表         | 原来源字段名 | 字段约束             | 处理规则&转换要求                | 命名说明                                 |
| :------------- | :--------------- | :----------- | :------------------- | :------------------------------- | :--------------------------------------- |
| id             | cashflow_records | id           | 主键，非空           | 直接原字段值迁移                 | 完全沿用原字段名                         |
| project_id     | cashflow_records | project_id   | 字符串，非空，软关联 | 直接原字段值迁移                 | 完全沿用原字段名                         |
| type           | cashflow_records | type         | 字符串枚举，非空     | 直接原字段值映射（收入/支出）    | 完全沿用原字段名（对应原“流水类型”）     |
| category       | cashflow_records | category     | 字符串枚举，非空     | 原字段值标准化映射，收敛枚举规则 | 完全沿用原字段名（对应原“费用类别”）     |
| amount         | cashflow_records | amount       | 数值型，非空         | 直接原字段值迁移                 | 完全沿用原字段名（对应原“金额(元)”）     |
| record_date    | cashflow_records | date         | 时间，非空           | 直接原字段值迁移                 | 基于原字段名规范命名（对应原“发生日期”） |
| operator_id    | 无原字段         | 新增         | 字符串，可空         | 新增字段，历史数据可置空/补录    | 新增规范命名（对应原“经办人id”）         |
| remark         | cashflow_records | description  | 长文本，可空         | 直接原字段值迁移                 | 通用简洁命名（对应原“备注”）             |
| created_at     | cashflow_records | created_at   | 时间，非空           | 直接原字段值迁移                 | 完全沿用原字段名                         |
| updated_at     | cashflow_records | updated_at   | 时间，非空           | 直接原字段值迁移                 | 完全沿用原字段名                         |

---

### 9. project_status_logs（项目状态流转日志表·全新创建）

| 目标英文字段名 | 字段约束             | 业务含义               | 命名规范说明     |
| :------------- | :------------------- | :--------------------- | :--------------- |
| id             | 主键，非空           | 记录唯一标识           | 通用主键命名     |
| project_id     | 字符串，非空，软关联 | 关联项目ID             | 通用外键规范命名 |
| old_status     | 字符串，非空         | 流转前状态             | 新增规范命名     |
| new_status     | 字符串，非空         | 流转后状态             | 新增规范命名     |
| trigger_event  | 字符串，可空         | 状态流转触发事件       | 新增规范命名     |
| operator_id    | 字符串，可空         | 操作人ID（关联人员表） | 新增规范命名     |
| operate_at     | 时间，非空           | 状态变更时间           | 新增规范命名     |
| remark         | 长文本，可空         | 变更补充说明           | 通用简洁命名     |
| created_at     | 时间，非空           | 创建时间               | 通用规范命名     |
| updated_at     | 时间，非空           | 更新时间               | 通用规范命名     |

---

### 10. project_renovations（装修信息表·全新创建）

| 目标英文字段名         | 字段约束                | 业务含义             | 命名规范说明     |
| :--------------------- | :---------------------- | :------------------- | :--------------- |
| id                     | 主键，非空              | 记录唯一标识         | 通用主键命名     |
| project_id             | 字符串，非空，软关联    | 关联项目ID           | 通用外键规范命名 |
| renovation_company     | 字符串，可空            | 合作装修公司名称     | 新增规范命名     |
| contract_start_date    | 时间，可空              | 合同约定进场时间     | 新增规范命名     |
| contract_end_date      | 时间，可空              | 合同约定竣工交房时间 | 新增规范命名     |
| actual_start_date      | 时间，可空              | 实际开工时间         | 新增规范命名     |
| actual_end_date        | 时间，可空              | 实际竣工时间         | 新增规范命名     |
| hard_contract_amount   | 数值型，可空            | 硬装合同总金额       | 新增规范命名     |
| payment_node_1         | 字符串，可空            | 第一笔款项支付节点   | 新增规范命名     |
| payment_ratio_1        | 数值型，可空            | 第一笔款项支付比例   | 新增规范命名     |
| payment_node_2         | 字符串，可空            | 第二笔款项支付节点   | 新增规范命名     |
| payment_ratio_2        | 数值型，可空            | 第二笔款项支付比例   | 新增规范命名     |
| payment_node_3         | 字符串，可空            | 第三笔款项支付节点   | 新增规范命名     |
| payment_ratio_3        | 数值型，可空            | 第三笔款项支付比例   | 新增规范命名     |
| payment_node_4         | 字符串，可空            | 第四笔款项支付节点   | 新增规范命名     |
| payment_ratio_4        | 数值型，可空            | 第四笔款项支付比例   | 新增规范命名     |
| soft_budget            | 数值型，可空            | 软装预算金额         | 新增规范命名     |
| soft_actual_cost       | 数值型，可空            | 软装实际发生成本     | 新增规范命名     |
| soft_detail_attachment | 字符串，可空            | 软装明细附件资源地址 | 新增规范命名     |
| design_fee             | 数值型，可空            | 设计费用金额         | 新增规范命名     |
| demolition_fee         | 数值型，可空            | 拆旧费用金额         | 新增规范命名     |
| garbage_fee            | 数值型，可空            | 垃圾清运费用金额     | 新增规范命名     |
| other_extra_fee        | 数值型，可空            | 其他额外费用总金额   | 新增规范命名     |
| other_fee_reason       | 长文本，可空            | 其他费用产生原因说明 | 新增规范命名     |
| is_deleted             | 布尔型，非空，默认false | 逻辑删除标记         | 通用规范命名     |
| created_at             | 时间，非空              | 创建时间             | 通用规范命名     |
| updated_at             | 时间，非空              | 更新时间             | 通用规范命名     |

---

## 三、原表待永久删除字段清单（无调整，严格执行之前确认的规则）

| 原所属表         | 待删除字段名           | 删除依据                                          |
| :--------------- | :--------------------- | :------------------------------------------------ |
| projects         | manager                | 目标表未包含，确认删除                            |
| projects         | sale_price             | 目标表未包含，确认删除                            |
| projects         | client_agent           | 目标表未包含，确认删除                            |
| projects         | first_viewer           | 目标表未包含，确认删除                            |
| projects         | presenter              | 目标表未包含，确认删除                            |
| projects         | viewing_records        | 已迁移至互动过程明细表，冗余重复，确认删除        |
| projects         | offer_records          | 已迁移至互动过程明细表，冗余重复，确认删除        |
| projects         | negotiation_records    | 已迁移至互动过程明细表，冗余重复，确认删除        |
| projects         | notes                  | 与remarks字段重复，目标表未包含，确认删除         |
| projects         | tags                   | 目标表未包含，确认删除                            |
| projects         | renovation_stage_dates | 目标表未包含，确认删除                            |
| projects         | total_income           | 已由财务流水明细表实时计算，冗余缓存，确认删除    |
| projects         | total_expense          | 已由财务流水明细表实时计算，冗余缓存，确认删除    |
| projects         | net_cash_flow          | 已由财务流水明细表实时计算，冗余缓存，确认删除    |
| projects         | roi                    | 已由财务流水明细表实时计算，冗余缓存，确认删除    |
| projects         | stage_completed_at     | 目标表未包含，确认删除                            |
| projects         | sold_at                | 已由sold_date映射至销售交易表，重复字段，确认删除 |
| projects         | remarks                | 已拆分至对应子表，主表不再保留，确认删除          |
| sales_records    | customer_phone         | 目标表未包含，确认删除                            |
| sales_records    | customer_info          | 已合并至互动对象字段，确认删除                    |
| sales_records    | record_time            | 已合并至互动时间字段，确认删除                    |
| sales_records    | price                  | 目标表未包含，确认删除                            |
| cashflow_records | related_stage          | 目标表未包含，确认删除                            |
| cashflow_records | related_record_id      | 目标表未包含，确认删除                            |

---

## 四、最终核对确认项

请你核对以下核心规则，确认无误后即可启动 Alembic 迁移脚本开发与后续落地：

1.  ✅ 所有功能/含义不变的字段，100%沿用原项目的字段名，仅新增字段做规范命名
2.  ✅ 所有字段名统一使用英文下划线命名，与原项目代码风格完全一致，无中文
3.  ✅ 人员类字段统一加`_id`后缀，适配存人员管理表ID的规则，不再存储姓名
4.  ✅ 之前已确认的业务逻辑、映射关系、单位转换、删除规则全部保持不变
5.  ✅ 原projects宽表仅保留核心基础信息字段，其余字段全部分散至对应子表
6.  ✅ 原sales_records、cashflow_records表重构完成后，原表将在迁移完成后下线删除
