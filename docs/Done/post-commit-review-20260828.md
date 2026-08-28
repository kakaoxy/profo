# 提交后正确性检查报告（2026-08-28 06:48 ~ 18:48）

## 审查范围

过去 12 小时内的 2 个提交，共 40 个文件、约 5558 行变更：

| 提交 | 时间 | 主题 | 规模 |
| --- | --- | --- | --- |
| `46746837` | 12:40 | feat: 小程序评估工作台全流程功能开发 | 30 文件 / +4940 |
| `d957fa15` | 15:08 | refactor(valuation): 拆分评估工作台为双接口，支持搜索与分页全量加载 | 10 文件 / +618 |

审查方式：对每个可疑变更追踪完整执行路径（上游调用方 → 服务端 → 下游渲染），不依赖 diff 层模式匹配。

---

## 确认缺陷（已修复）

### BUG-1 · 已处理段翻页标记泄漏，导致触底加载永久失效

**等级**：高（用户可感知的严重功能退化）
**引入提交**：`d957fa15`
**位置**：`miniapp/pages/valuation/evaluate/index.ts`

#### 缺陷机理

`loadHandledMore()` 用 `handledLoadingMore` 作为在途互斥标记，并用 `myEpoch !== this._epoch` 守卫丢弃过期代响应。但两处清理逻辑不对称：

```js
// loadHandledMore —— 过期代直接 return，finally 因 epoch 失配被跳过
} finally {
  if (myEpoch === this._epoch) {
    this.setData({ handledLoadingMore: false });   // ← 过期代不会执行
  }
}

// loadList —— finally 只清理 loading / loadingMore，遗漏 handledLoadingMore
} finally {
  if (myEpoch === this._epoch) {
    this.setData({ loading: false, loadingMore: false });
  }
}
```

`loadList(reset)` 会执行 `this._epoch += 1`，使在途的 `loadHandledMore` 整体失效，但其 reset 分支的 `setData` 未复位 `handledLoadingMore`，`finally` 也未覆盖该字段。因此**只要 reset 与已处理翻页请求在时间上重叠，标记就被永久置为 `true`**。

`handledLoadingMore: true` 会同时触发两个后果：

1. `onReachBottom()` 的三重拦截首行命中即 return，**待评估段与已处理段双双无法继续翻页**；
2. 页面底部 `more-hint` 永久显示「加载中...」（`index.wxml:150`）。

该状态无法通过页面内任何操作恢复，只能销毁页面重新进入。

#### 触发场景（可复现）

1. 员工进入评估工作台，已处理段有多页（例如 `handledTotal=15`，首页 10 条）；
2. 滚动到底部触发已处理第 2 页加载，底部出现「加载中...」；
3. **在请求返回前**点击任一张已渲染的已处理卡片（卡片位于加载提示上方，可点击）进入只读详情，再返回；
4. `onShow` → `loadList(true, true)` → `_epoch` 自增，在途的已处理翻页请求被判为过期代；
5. 标记残留为 `true`，此后双段翻页全部失效。

同一机理也可由下拉刷新（`enablePullDownRefresh: true`）或搜索确认在翻页在途时触发。

#### 修复

在 `loadList` 的 reset 分支（及无令牌提前返回分支）主动释放该标记，由新代请求重新接管：

```js
// reset 分支
this.setData({
  error: false,
  noMore: false,
  needLogin: false,
  forbidden: false,
  handledLoadingMore: false,   // ← 新增
  ...(silent ? {} : { loading: true }),
});
```

选择在 reset 处释放而非在 `loadHandledMore` 的 `finally` 无条件释放：后者会在「旧请求晚到」时误清新请求（已由 reset 启动）的在途标记，属于二次竞态。

#### 测试

`miniapp/test-utils/pages/valuation-evaluate.test.ts` 新增用例
「已处理翻页在途时静默刷新：不残留 handledLoadingMore，触底仍可继续分派」——
先复位现缺陷（修复前 `expected true to be false`），修复后通过。

---

## 标记风险（未修改，需确认）

### RISK-1 · develop 环境 base URL 被切到内网 IP

**位置**：`miniapp/utils/config.ts:13-14`（`d957fa15` 中翻转）

```js
// develop: "https://fangmengchina.com/api/v1",
develop: "http://192.168.110.169:8000/api/v1",
```

影响：develop 构建（开发者工具 / 真机调试）全部指向私有局域网地址，非该网段的开发者与 CI 将完全无法连通后端；该写法同时也与文件头部注释声明的约定相悖（注释明确 develop 默认线上域名，本地 IP 为按需开启）。

**未直接修改的原因**：该开关自 `b9d3df54` 起已在历次提交中反复来回翻转（`b9d3df54` 开 → `0181cef7` 关 → `c46e957a` 开 → `af063a55` 关 → `d957fa15` 开），属长期存在的本地联调状态泄漏，而非本次新引入的缺陷；若当前正处于本地联调阶段，回退会直接中断调试。

**建议**：提交前复位为线上域名，或将该开关改为从本地配置文件读取并加入 `.gitignore`，从根上避免误提交。

**已知副作用**：导致 `miniapp/test-utils/utils/url.test.ts` 中 2 个用例失败（断言期待 `https://fangmengchina.com`）。此 2 个失败与本次修复无关。

---

## 已核查未发现问题的部分

对以下高影响面做了完整路径追踪，未发现达到报告门槛的缺陷：

**认证与权限**
- `_c_side_internal_checker`（`dependencies/auth.py:257`）叠加 `CurrentCustomerUserDep` → `require_roles(["customer"])` → `_user_has_any_role(INTERNAL_ROLE_CODES)`，C 端令牌体系 + 内部角色复核双层校验，角色口径与 `CurrentInternalUserDep` 一致，无绕过路径。
- `LeadService.authorize_assessment` / `create_reevaluation` 在 Service 层二次调用 `_ensure_internal_operator`，具备防绕过复核。
- 路由注册顺序安全：`/pending-assessment`、`/handled-assessment` 及 `/my/acquired/{lead_id}/*` 均声明在 `/{lead_id}`（`get_lead_detail`，leads.py:505）之前，不存在路径遮蔽。

**并发与事务**
- `authorize_assessment` / `create_reevaluation` 采用 `SELECT ... FOR UPDATE` 行级锁，锁持至 commit，「检查状态 → 流转」原子化，并发提交后到者走 409；`with_for_update` 与 `joinedload` 互斥已按 PostgreSQL 约束处理（`load_creator=False`）。

**分页与资源**
- 两段分页参数均受 `ge=1, le=settings.max_page_size` 约束（`PaginationDep` 与 `_pending_assessment_filter`），`search` 限长 50 并复用 `escape_like`，无无界分配或注入面。
- 移除 `HANDLED_ITEMS_LIMIT=50` 改为全量分页后，已由迁移 `add_lead_auditor_index.py`（幂等）与模型 `__table_args__` 同步补建 `leads(auditor_id, audit_time)` 复合索引，承接 `audit_time` 倒序 + offset 分页，无全表扫描退化。
- 触底分派策略「已处理优先、待评估兜底」页码单调递增，不存在无限循环。

**空引用 / 崩溃路径**
- `LeadEvalHistoryResponse.evaluator_name` 依赖 `evaluator` 关系，`get_evaluations` 与 `create_reevaluation` 均通过 `joinedload(LeadEvalHistory.evaluator)` 预加载，不会触发 lazy load 异常。
- `HandledItem.audit_time` 为必填字段，查询侧已有 `Lead.audit_time.is_not(None)` 过滤，不会因空值导致序列化失败。

**数据校验**
- `LeadAssessmentAuthorizeRequest` 通过 `model_validator(mode="after")` 强制 approve 必带 `eval_price`；`eval_price` 为 `Decimal(gt=0, decimal_places=2)`；端侧 `isValidEvalPrice` 与后端口径一致（>0、≤999 万、≤2 位小数）。

---

## 变更与验证清单

| 文件 | 变更 |
| --- | --- |
| `miniapp/pages/valuation/evaluate/index.ts` | 修复：reset 与无令牌路径释放 `handledLoadingMore` |
| `miniapp/test-utils/pages/valuation-evaluate.test.ts` | 新增：翻页在途静默刷新不残留标记的回归用例 |

验证结果：

- `npx vitest run test-utils/pages/valuation-evaluate.test.ts` → 15/15 通过
- `npx vitest run test-utils/pages/valuation-authorize.test.ts` → 8/8 通过
- `npx vitest run`（全量）→ 173 通过 / 2 失败，失败仅来自 RISK-1 导致的 `url.test.ts`，与本次改动无关
- `npx tsc --noEmit` → 无错误
- 后端 7 个变更文件 `py_compile` → 全部通过
