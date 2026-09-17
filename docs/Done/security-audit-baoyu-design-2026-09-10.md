# 🔍 安全审计报告：baoyu-design

## 📊 执行摘要

- **审计对象**: `baoyu-design`（来源 `JimLiu/baoyu-design`）
- **安装路径**: `/Users/wither-e/Desktop/profo/.agents/skills/baoyu-design`
- **安装方式**: `npx skills add JimLiu/baoyu-design -s baoyu-design -y`（Vercel Labs `skills` CLI，项目级）
- **审计时间**: 2026-09-10 17:35 GMT+8
- **审计方式**: 纯静态文本分析（只读，未执行任何被审代码）
- **发现问题总数**: 3 个
  - 🔴 P0 阻断级: **0 个**
  - ⚠️ P1 需关注: **3 个**
  - 📝 信息性提醒: 2 个（非风险项，不计入风险总数）
- **安全评分**: **88 / 100**

### 第三方扫描结论（CLI 内置，仅供参考）

| 扫描器 | 结论 |
| --- | --- |
| Gen | Safe |
| Socket | 6 alerts |
| Snyk | Med Risk |
| 详情 | https://skills.sh/JimLiu/baoyu-design |

---

## 🔴 P0 阻断级风险发现

✅ 未发现 P0 风险。

逐项排查结论：

| 检查项 | 结果 |
| --- | --- |
| 下载 + 执行（`curl \| bash` / `wget \| sh`） | ❌ 未发现 |
| 远程脚本静默拉取并执行 | ❌ 未发现 |
| 读取敏感文件（`~/.ssh`、`.env`、云凭证）并外送 | ❌ 未发现 |
| 自动执行破坏性命令（`rm -rf /`、改系统配置） | ❌ 未发现（仅测试用 `fs.rmSync(tmpdir)`） |
| 隐蔽执行（`2>/dev/null` + `nohup` 组合） | ❌ 未发现 |
| 权限提升（`sudo`、`chmod 777`） | ❌ 未发现 |
| Base64 混淆命令 | ❌ 未发现（两处 `base64 -d` 为 GitHub API 取文件正文的正常用法） |

---

## ⚠️ P1 需关注风险发现

### 1. 自动执行本地依赖安装 + 下载 Chromium 二进制（环境变更）

- **位置**: `references/claude.md:126`、`references/claude.md:151`、`agents/gen-pptx/src/cli.ts:14`、`agents/gen-video/src/cli.ts:14`
- **代码片段**:
  ```
  cd <skill>/agents/gen-pptx && npm install && npx playwright install chromium && npm run build
  ```
- **风险描述**: 使用 PPTX / 视频导出功能时，该 skill 会指导 agent 在 skill 目录内执行 `npm install`，并通过 Playwright 下载约数百 MB 的 Chromium 浏览器二进制。属于**环境变更**而非全局污染。
- **判定说明**: 非 `-g` 全局安装，依赖来自官方 `registry.npmjs.org`（`playwright` / `jszip` / `esbuild` / `typescript` 均为知名包），`package.json` 中**无 `postinstall` / `preinstall` 钩子**，因此定级 P1 而非 P0。
- **建议**: 仅在确实需要导出 PPTX / MP4 时再执行；执行前确认网络与磁盘占用；不需要时完全跳过该步骤。

### 2. 内嵌第三方 vendor 代码无法逐行审计

- **位置**: `agents/vendor/babel.min.js`、`agents/vendor/fig-materialize.mjs`、`agents/vendor/`、`agents/gen-pptx/vendor/pptxgenjs/`
- **风险描述**: 仓库内嵌了 Babel standalone、PptxGenJS、`.fig` 解析器（含 WASM）等压缩/打包产物。压缩代码不可逐行静态审计，其行为只能靠来源可信度判断。这与 Socket 报出的「6 alerts」、Snyk 的「Med Risk」大概率同源。
- **说明**: `freesounds` / `c-rex.net` 两处命中已核实为 PptxGenJS 的 JSDoc 注释示例，非真实外联地址。
- **建议**: 如需更高保证，可用 `npm ls` 核对依赖版本，或仅使用不需要导出功能的纯 HTML 产出路径。

### 3. 技能以完整 agent 权限运行，可写文件 / 起本地服务 / 调 ffmpeg

- **位置**: `SKILL.md:54`、`agents/gen-video/src/orchestrator/encode.ts:64`（`spawn("ffmpeg", ...)`）、`http://localhost:4311/`
- **风险描述**: 该技能会写 HTML/资源文件到项目目录、启动本地预览服务（4311）、并调用 `ffmpeg` 与 headless Chromium。均为其功能所必需，但意味着**必须对产出目录和生成内容保持审查**。
- **建议**: 产出统一落在 `designs/<项目名>/`，不要让 agent 把设计文件散落到仓库根目录。

---

## 📝 信息性提醒（非风险项）

1. **`requireApiKey` 字段**（信息性提醒）
   - **位置**: `references/upstream-sync/built-in-skills.json:130,154`
   - **内容**: `"requireApiKey": "geminiApiKey"` / `"elevenlabsApiKey"`
   - **说明**: 仅声明某内置能力「需要哪一类 API Key」的元数据字段，**不含任何真实密钥值**，不构成泄露或投毒风险。
   - **建议**: 若后续使用 Gemini / ElevenLabs 能力，把密钥放环境变量，不要写进仓库。

2. **大体积 vendor 资产**（信息性提醒）
   - **位置**: `agents/vendor/babel.min.js` 等
   - **说明**: 会显著增大仓库体积（本次安装覆盖约 200+ 文件）。若提交进 Git，建议在 `.gitignore` 中排除或改用 submodule。

---

## 📋 详细检查结果

### 命令执行与权限检查

- 发现次数: 4 处实质命中
- 命中内容:
  - `agents/gen-video/src/orchestrator/encode.ts:64` — `spawn("ffmpeg", buildFfmpegArgs(opts), ...)`（视频编码，功能必需）
  - `agents/gen-video/src/cli.ts:66` — `spawn("ffmpeg", ["-version"])`（探测 ffmpeg 是否存在，只读）
  - `references/claude.md:126/151` — 文档中给出的安装指导命令
  - 其余 `.exec()` 命中全部为 JS 正则 `RegExp.exec()`，非命令执行

### 文件操作与敏感路径检查

- 敏感路径（`~/.ssh`、`~/.aws`、`/etc/passwd`、`.env`、`credentials`、`private_key`）: **0 处真实命中**
- 文件写入/复制: 集中在 `import-design-system.mjs`、`import-figma.mjs`、`compile-design-system.mjs`、`asset-store.mjs`，目标均为设计系统 / 项目产出目录
- 删除操作: 仅 `agents/tests/helpers.mjs:19` 的临时目录清理（`fs.rmSync(dir, {recursive:true, force:true})`），范围为测试沙箱

### 网络请求检查

- **HTTPS 域名 Top（83 处）**: `github.com`（83）、`registry.npmjs.org`（77）、`unpkg.com`（55）、`gitbrent.github.io`（20，PptxGenJS 文档）、`babeljs.io`（10）、`fonts.googleapis.com`（5）等
- **实际运行时外联**: 仅 Google Fonts（`fonts.googleapis.com`）拉字体、`data:` 内联 WASM、以及页面内 same-origin 取图
- **Base64 编码检测**: 未发现混淆载荷；`babel.min.js` 中含 base64 数据为 Babel 自身资源

### 远程脚本深度分析

✅ 不存在「自动下载并执行远程脚本」的 URL，无需深度分析（步骤 4 未触发）。

### 依赖安装风险检查

- **全局安装检测**: ❌ 未发现 `npm install -g` / `pip install`（非虚拟环境）
- **虚拟环境 / 隔离检查**: 依赖安装在 skill 自身的 `agents/gen-pptx`、`agents/gen-video` 目录内，天然隔离
- **依赖来源检查**: 全部为官方 npm registry，无 `--registry` 自定义源、无 `git+https://` 直装
- **install 钩子**: `package.json` 中无 `postinstall` / `preinstall` / `prepare`

---

## 💡 总体建议

1. **可以安装使用**：未发现投毒、后门、外送或破坏性行为，技能描述（设计产出）与实际代码行为一致。
2. **导出类功能（PPTX / MP4）保持谨慎**：会触发本地 npm 安装与 Chromium/ffmpeg 下载，按需执行即可。
3. **产出目录约束**：坚持把设计产出写在 `designs/<项目名>/`，不要落在仓库根。
4. **注意与 WorkBuddy 的目录不匹配**：本次 `skills` CLI 安装目标是 `.agents/skills/`（并为 Trae 建了软链），而 WorkBuddy 读取的项目级技能目录是 `.workbuddy/skills/`。若要在 WorkBuddy 中使用，需要额外建立链接（见下方结论附带说明）。

---

## ✅ 审计结论

**风险等级**: **P1 — 建议改进后使用**

**使用建议**:
- ⚠️ **P1 - 建议改进后使用**：无投毒风险，但存在本地依赖安装 / 大体积二进制下载 / 不可逐行审计的 vendor 代码三项环境与供应链提醒。确认后即可正常使用。
- 未发现 🚫 P0 阻断级问题。

---

**📌 审计原则提醒**:
- ✅ 本报告仅覆盖该 skill 的供应链投毒风险
- ❌ 未评估教学代码质量问题（命名、算法、架构等）
- 🎯 关键判断：该 skill **自动执行**的操作组合为「写文件 + 起本地服务 + 调用 ffmpeg/Chromium」，不含恶意意图
