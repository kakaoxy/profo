# REQ-IT4 迭代 4 · 验收工件（小程序商户首页 / 门店详情体验修复）

- 迭代：迭代 4（2026-11-01）
- 需求台账：`docs/商户管理模块需求/商户管理模块-需求与迭代记录.md` §10
- 来源：用户 2026-11-01 第三轮反馈（m01938），5 条缺陷
- 状态：待验收（自动化全绿；小程序真机未复测）

## 1. 需求 ↔ 验证用例映射

| 编号 | 需求 | 自动化用例 | 类型 |
|---|---|---|---|
| REQ-IT4-01 | 底部主按钮居中 | `frontend/e2e/merchant-iteration4.spec.ts` › REQ-IT4-01 底部主按钮居中（源码断言） | 源码断言（小程序无法在 Playwright 内运行） |
| REQ-IT4-02 | 列表按距离由近到远 | 同上 › REQ-IT4-02 门店列表按距离由近到远，未传原点时无距离 | 接口真实调用 + 序列断言 |
| REQ-IT4-02 | 进入/刷新重新定位 | 同上 › REQ-IT4-02 小程序首页：进入/刷新重新定位并带原点请求 | 源码断言 |
| REQ-IT4-03 | 补录照片上传 | 同上 › REQ-IT4-03 照片补录上传走本地存储并可访问 | 真实 multipart 上传 + 静态文件回读 |
| REQ-IT4-04 | 拜访时间线实时刷新 | 同上 › REQ-IT4-04/05 小程序门店详情：onShow 静默刷新 + 消费 status-options | 源码断言 |
| REQ-IT4-05 | 合作状态可选项 | 同上 › REQ-IT4-05 合作状态可选值由后端裁决 | 接口真实调用 + 字典一致性断言 |
| REQ-IT4-06 | 表单「提交审核」按钮贴左 | 同上 › REQ-IT4-06 表单主操作按钮不贴左（全仓扫描） | 源码全仓扫描断言（正向 + 反向验证） |

## 2. 自动化命令与实测结果（2026-11-01）

### 2.1 新增 E2E（迭代 4）

```bash
cd frontend && npx playwright test e2e/merchant-iteration4.spec.ts --reporter=line
# → 7 passed (1.0s)（第 7 条为 REQ-IT4-06 追加的全仓扫描用例）
```

### 2.2 商户模块回归（9 个 spec，串行）

```bash
cd frontend && npx playwright test \
  e2e/merchant-iteration4.spec.ts e2e/merchant-iteration1.spec.ts e2e/merchant-iteration2.spec.ts \
  e2e/building-dict-region-dicts.spec.ts e2e/merchant-admin-forms.spec.ts e2e/merchant-company-admin.spec.ts \
  e2e/merchant-store-admin-v7.spec.ts e2e/merchant-store-activation.spec.ts e2e/merchant-map-tracks.spec.ts \
  --workers=1 --reporter=line
# → 26 passed (32.5s)
```

### 2.3 后端用例

```bash
cd backend && .venv/bin/pytest tests/test_merchant_admin.py tests/test_merchant_store_visit.py -q --no-cov
# → 32 passed, 2 warnings in 10.04s

cd backend && .venv/bin/ruff check services/merchant routers/merchant schemas/merchant
# → All checks passed!
cd backend && .venv/bin/ruff format --check services/merchant routers/merchant schemas/merchant
# → 29 files already formatted
```

### 2.4 静态检查

```bash
cd frontend && npx tsc --noEmit          # 零输出
cd frontend && pnpm lint                 # 0 error / 0 warning
cd miniapp  && npx tsc --noEmit          # 零输出
cd frontend && pnpm gen-api              # openapi-typescript 7.13.0，同步 frontend + miniapp 类型
```

## 3. 修复前后实测对照

### 3.1 REQ-IT4-03 照片上传（根因与修复证据）

| 阶段 | 命令 | 结果 |
|---|---|---|
| 修复前 | `POST /api/v1/public/files/upload`（C 端令牌，真实 PNG） | `HTTP 400 {"code":400,"message":"文件上传失败，请稍后重试"}` |
| 修复前（下探存储层） | `.venv/bin/python -c "...OSSStorage().upload_file(...)"` | `ServerError {'status': 502, 'x-oss-request-id': '', 'details': {}}` |
| 修复后 | 同上上传 | `{"url":"/static/uploads/20261101_c666c6b9.png","thumbnail_url":"/static/uploads/thumbs/20261101_c666c6b9.webp"}` |
| 修复后 | `curl <origin>/static/uploads/20261101_c666c6b9.png` | `static:200 type:image/png size:74` |
| E2E | 用例内 multipart 上传 + 回读 | 断言 `url` 含 `/static/uploads/` 且回读 200、`content-type` 含 `image` |

根因：本地 `.env` 指向阿里云**内网** OSS 端点（`oss-cn-shanghai-internal.aliyuncs.com`），开发机不可达。修复：本地 `STORAGE_BACKEND=local`。

### 3.2 REQ-IT4-02 距离排序

```bash
curl -s "http://127.0.0.1:8000/api/v1/public/merchant/stores?page=1&page_size=5&origin_lng=121.4737&origin_lat=31.2304" \
  -H "Authorization: Bearer <C 端令牌>"
# distance_m 依次：803.0 / 3213.0 / 3213.0 / 5392.0 / 15675.0（升序）
```

未传原点时 `distance_m` 全为 `null`，排序维持 `updated_at desc`（E2E 用例 1 已断言）。

### 3.3 REQ-IT4-05 合作状态可选项

```bash
curl -s "http://127.0.0.1:8000/api/v1/public/merchant/stores/c10a8215-.../status-options" -H "Authorization: Bearer <C 端令牌>"
# {"current_status":"negotiating","current_status_label":"洽谈中",
#  "items":[{"code":"not_cooperated","label":"未合作"},{"code":"paused","label":"暂停"},{"code":"terminated","label":"终止"}],
#  "reason":null}
```

`cooperated` 因该门店无已签协议被排除；`negotiating` 因已是当前状态被排除 —— 与后端 `POST /stores/{id}/status` 规则一致。

### 3.4 REQ-IT4-01 按钮居中（样式层证据）

`miniapp/app.wxss`：`.btn-primary`/`.btn-secondary` 含 `box-sizing: border-box`；
`miniapp/pages/merchant/{home,agreement/list,visit/create,store/create}/index.wxss`：`.footer` 含 `display: flex` + `justify-content: center`，`.footer__btn` 含 `flex: 1`（E2E 逐文件断言）。

### 3.5 REQ-IT4-06 表单提交按钮贴左（正向 + 反向验证）

根因：`.btn-primary` 为 `display: inline-flex`，页面 `.submit-btn` 未声明 width 也未居中时，按钮按内容收缩并贴在块级父容器（`.card`）左侧。REQ-IT4-01 的 `box-sizing` 只解决「width:100% 溢出裁切」，不解决「没有 width」的收缩贴左。

修复：4 个商户端表单页 `.submit-btn` 显式 `display: flex; width: 100%`：
`miniapp/pages/merchant/agreement/create/index.wxss`、`miniapp/pages/merchant/agreement/sign/index.wxss`、`miniapp/pages/merchant/broker/index.wxss`、`miniapp/pages/merchant/broker/store-create/index.wxss`。

**正向**：

```bash
cd frontend && npx playwright test e2e/merchant-iteration4.spec.ts --reporter=line
# → 7 passed (1.0s)
```

**反向验证（证明用例不是空断言）**：临时删除 `agreement/create/index.wxss` 的 `display:flex; width:100%` 后只跑该用例：

```bash
cd frontend && npx playwright test e2e/merchant-iteration4.spec.ts -g "REQ-IT4-06" --reporter=line
# → 1 failed
#   Error: 以下页面的提交按钮会贴左：pages/merchant/agreement/create/index.wxml
```

恢复后重跑 → 7 passed。

**同名但无需改动的页面（已逐个确认）**：`pages/bind-account/index`（`margin: 12rpx auto 0`）、`pages/profile/index`（`margin: 32rpx auto 0`）、`pages/login/password`（父级 `align-items: center`）、`pages/valuation/submit`（`.submit-wrap { justify-content: center }`）、`pages/about/index`（hero 内左对齐为设计意图）。

## 4. 数据与清理

- E2E 造数：`MARK = E2EIT4<时间戳>` 的公司/2 家门店（近店 ≈90m、远店 ≈4.7km，均带 `force_create_reason` 规避历史残留命中 500m 查重半径）。
- `afterAll` 用 `backend/.venv/bin/python` 按 `LIKE %E2E_MARK%` 清理 `MerchantStore` / `MerchantCompany`。
- 上传文件落在 `backend/static/uploads/`（`.gitignore` 已忽略 `backend/static/`），不进版本库。
- 用例串行执行（`test.describe.configure({ mode: "serial" })`），避免并行 worker 互删数据。

## 5. 小程序手工复测清单（真机，未执行）

| 步骤 | 预期 |
|---|---|
| 打开商户拓展首页 | 首次进入请求定位，列表按距离由近到远，卡片右下角显示 `xxx m` / `x.x km` |
| 点「刷新」/下拉刷新 | 重新定位后列表顺序可能变化；定位被拒时列表仍正常展示（无距离） |
| 观察底部「新增门店」按钮 | 水平居中、左右留白一致、无右侧裁切 |
| 进入门店详情 → 登记拜访 → 返回 | 拜访时间线立即出现新记录，页面无整页 loading 闪烁 |
| 门店详情 → 合作状态 | 弹层至少一个可选项；无选项时 toast 说明原因（如「员工仅可改为洽谈中，当前已是可选的最终状态」） |
| 门店详情 → 补录照片 | 选图后上传成功、照片回显、缩略图可预览 |

## 6. 已知偏差与遗留

1. **真机未覆盖**：上述 6 步均需真机（含「拒绝定位授权」路径），本轮仅完成静态/接口层验证。
2. **生产 OSS 未改动**：本地改 `local` 存储只解决开发环境；生产/预发的 OSS 内网端点可达性与公网访问需部署侧确认。
3. **无坐标门店**：存量门店 `lng/lat` 可空（v110 允许），这类门店恒排列表末尾且不显示距离。
4. **读写规则两处实现**：`status-options`（读）与 `POST /stores/{id}/status`（写）共用私有方法收敛，但仍是两条代码路径，后续改规则需同步。
5. **并行执行风险**：`merchant-iteration4.spec.ts` 依赖串行（`afterAll` 删除自身数据）；并行执行会互相删数据，已在文件内注释说明。
6. **REQ-IT4-06 为复测追加**：`agreement/create` 等 4 页的按钮居中属于用户复测（m02429）后补修，真机观感同样未复测；全仓扫描用例只能守住「样式声明存在」，不能证明渲染效果。
