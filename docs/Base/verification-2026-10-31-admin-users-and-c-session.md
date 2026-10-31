# 修复验证记录：admin/users 内部用户漏显 + 小程序绑定失败

日期：2026-10-31　环境：生产 139.224.162.134（诊断）／本地开发库（复现与回归）

---

## 问题 1：admin/users 只显示 11 个内部用户，搜索却搜得到

### 根因

页面 `frontend/src/app/(main)/admin/users/page.tsx` 用 `page_size=200` 一次性取数，再在浏览器端按
`role.code` 切「内部用户 / C 端用户」两个 tab 并统计。后端 `settings.max_page_size = 200`
（`backend/settings.py:199`），且 `UserService.get_users`（`backend/services/system/user/core.py:139-210`）
**没有任何角色范围过滤**——它只按 `status/username/...` 过滤后 `count()` + `LIMIT`。

生产 active 用户 206 名 > 200：按 `created_at desc` 排序后最老的 6 条被静默丢弃。内部账号多为早期
创建，于是只剩 11 个。搜索能命中是因为 `username LIKE` 发生在 `LIMIT` 之前。

生产库实测（`docker compose exec -T db psql`）：

```sql
with top200 as (select u.* from users u where u.status='active' order by u.created_at desc limit 200)
select count(*) filter (where r.code <> 'customer') as internal,
       count(*) filter (where r.code =  'customer') as customer
from top200 t join roles r on r.id = t.role_id;
-- internal = 11, customer = 189
```

### 修复

`page.tsx` 新增 `getAllUsers()`：先取第 1 页拿 `total`，再 `Promise.all` 并行补齐其余页并合并
`items`，使「全量」这一前提成立；不改变后端契约（无需 `pnpm gen-api`），tab/统计/客户端分页逻辑保持不变。

### 验证（可重跑）

```bash
cd frontend
pnpm exec playwright test e2e/admin-users-internal-list.spec.ts --reporter=line
```

用例自建前置条件：本地 active 用户 186 < 200 时，用 SQL 克隆 20 个 C 端账号把总数顶到 206
（创建接口限流 10/hour，故走 SQL；`E2E_DB_CONTAINER` 可覆盖容器名，默认 `profo-db-1`），
结束后 `DELETE FROM users WHERE username LIKE 'e2e_paging_%'` 清理。

| 版本 | 内部 tab 计数（期望 17） | 结果 |
| --- | --- | --- |
| 修复前（`git checkout` 回原文件） | 实际渲染 **11** | ❌ 失败，复现线上症状 |
| 修复后 | 实际渲染 **17**，C 端 189 | ✅ 通过 |

修复前的失败输出（`test-results/.../error-context.md`）：

```
Locator: locator('.users-tab-btn').filter({ hasText: '内部用户' }).locator('span').first()
Expected: "17"
Received: "11"
```

修复后落盘工件 `frontend/test-results/admin-users-internal-list.json`：

```json
{
  "active_total": 206,
  "seeded_users": 20,
  "expected_internal_total": 17,
  "expected_customer_total": 189,
  "rendered_internal_badge": "17",
  "rendered_customer_badge": "189",
  "oldest_internal_username": "admin",
  "oldest_internal_visible": true
}
```

---

## 问题 2：zhangli 在小程序绑定账号提示「绑定失败」

### 根因

生产日志（`docker compose logs backend --since 24h`，IP 117.136.119.52）：

```
GET  /api/v1/public/marketing/subscriptions/status 401   服务层业务异常: 401 - 无法验证凭据
POST /api/v1/public/auth/refresh                   401   服务层业务异常: 401 - 刷新令牌无效
GET  /api/v1/public/auth/me                        401
POST /api/v1/public/users/phone/wechat             401
POST /api/v1/public/users/merge                    401  ×18
```

`validate_token`（`backend/utils/auth/token.py:127-157`）对「刷新令牌无效」的判定是 JWT 级失败
（过期 / aud 不符 / type 不符），不是吊销或 token_version 失效——即用户手里的 C 端
`refresh_token` 已过期，客户端只持有旧的轮换结果（`refresh_tokens` 表中 483218e2… 于 10-31 03:17:07
过期，失败发生在 03:13:52 之前的老令牌上）。

关键缺陷在客户端：`miniapp/utils/request.ts` 的 401 处理只尝试 `refreshCAccessToken()`，
refresh 失败后清空 `c_*` 令牌并 reject。此后所有 `/public/*` 请求都因「无 c_refresh_token →
直接返回 null」而永久 401，小程序进入「看起来已登录、实际全部 401」的僵死状态；
`pages/bind-account` 只对已知业务码给文案，401 落到兜底分支 → 统一显示「绑定失败」。

### 修复

- `miniapp/utils/request.ts`：新增 `registerCSessionRecovery()` / `recoverCSession()`（并发单飞）/
  `renewCToken()`；C 端 401 先刷新，刷新失败再静默微信登录一次，成功后用新令牌重试原请求。
  以回调注册而非直接 import `wechatLogin`，避免 `wechat-auth → request` 循环依赖。
- `miniapp/app.ts`：`onLaunch` 注册恢复回调，保留「仅同意过协议才收集 openid」的门槛。
- `miniapp/pages/bind-account/index/index.ts`：补 `40903`（该账号已完成绑定）与 `401`
  （登录已过期，请重新登录）文案，不再一律提示「绑定失败」。

### 验证（可重跑）

```bash
cd miniapp
pnpm exec vitest run test-utils/utils/request.test.ts test-utils/utils/c-session-recovery-wiring.test.ts
pnpm exec vitest run      # 全量：47 文件 / 870 用例
pnpm exec tsc --noEmit
```

- `request.test.ts` 新增 4 例：刷新失败 → 恢复成功并用新令牌重试；恢复失败 → 原 401 上抛且只尝试一次；
  刷新成功不触发恢复；后台接口 401 不触发 C 端恢复。
- `c-session-recovery-wiring.test.ts`（接线验证）：真实 `utils/request` + 真实 `app.onLaunch`，
  仅桩掉 `wechatLogin`，验证「注册 → 401 → 静默重登 → 重试成功」整条链路，以及未同意协议时不重登。
- 结果：47 文件 / 870 用例全部通过，`tsc --noEmit` 无错。

---

## ⚠️ 未覆盖 / 待人工执行

- 以上验证在本地开发库与本地构建上完成；**生产复验需部署后执行**（前端镜像 + 小程序重新发版），
  生产 admin/users 应显示 19 个内部账号（其中 17 个 active，默认 `status=active` 过滤下显示 17）。
- 小程序为独立发布通道，恢复逻辑要等新版本被用户更新后才生效；旧版本仍会在 refresh_token 过期后
  卡在「绑定失败」，缓解手段是让用户手动重新登录一次。
- 本次未执行 `git commit` / `git push`（按 AGENTS.md 约定由人工审核后提交）。
