import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * REQ-IT6-01/02/03（2026-11-02）：商户端体验优化。
 *
 * 1. 首页门店卡片：去掉详细地址、右侧新增「拜访」直达拜访录入；
 * 2. 门店详情：动作区改内置 SVG 图标、「补录照片」→「佣金结算（下一期）」并与「合作协议」换位；
 * 3. 配色按 DESIGN.md 对齐：hero 去深色底、卡片三层阴影、一屏一个 Ink 填充 CTA。
 *
 * 本轮全部为小程序视图层改动（wxml/wxss/ts），无法在浏览器里渲染验证，
 * 因此用例以「源码契约」为基础，配合 miniapp `tsc --noEmit` 与真机复测清单（见验收工件）。
 */

const MINIAPP = path.resolve(__dirname, "../../miniapp");

function read(rel: string): string {
  return fs.readFileSync(path.resolve(MINIAPP, rel), "utf8");
}

/** 递归收集商户分包下的 wxss，用于配色规则的整体校验。 */
function merchantWxss(): Array<{ rel: string; content: string }> {
  const root = path.resolve(MINIAPP, "pages/merchant");
  const out: Array<{ rel: string; content: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "index.wxss") {
        out.push({ rel: path.relative(MINIAPP, full), content: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

test("REQ-IT6-01 首页卡片：不显示详细地址，右侧「拜访登记」直达拜访录入", () => {
  const wxml = read("pages/merchant/home/index.wxml");
  const ts = read("pages/merchant/home/index.ts");

  // 详细地址下线，只保留区域 · 商圈
  expect(wxml).not.toContain("item.address");
  expect(wxml).toContain("store__region");
  expect(wxml).toMatch(/\{\{item\.district\}\}\{\{item\.district && item\.business_circle \? ' · ' : ''\}\}\{\{item\.business_circle\}\}/);

  // 卡片右侧拜访按钮：catchtap 防止冒泡回卡片 tap 再跳一次详情
  expect(wxml).toMatch(/<view class="link store__visit" hover-class="hoverable" catchtap="onVisitTap" data-id="\{\{item\.id\}\}">/);
  expect(wxml).toContain("拜访登记");

  // 点击直接进入拜访录入（带 store_id）
  expect(ts).toMatch(/onVisitTap\(e: WechatMiniprogram\.BaseEvent\)/);
  expect(ts).toContain("/pages/merchant/visit/create/index?store_id=${id}");

  // 距离仍展示（REQ-IT4-02 保留）
  expect(wxml).toContain("store__distance");
  expect(wxml).toContain('bindtap="onRefresh"');
});

test("REQ-IT6-02 门店详情：动作区收敛为编辑/合作状态/邀请经纪人，统一使用内置图标", () => {
  const wxml = read("pages/merchant/store/detail/index.wxml");
  const ts = read("pages/merchant/store/detail/index.ts");

  // 详情页次要动作使用内置图标，不再使用汉字占位圆标
  for (const key of ["pencil", "tag", "grid"]) {
    expect(wxml).toContain(`src="{{icons.${key}}}"`);
  }
  expect(ts).toContain("MP_ICONS");
  expect(wxml).not.toMatch(/<text class="action__icon">[访编状照协邀]<\/text>/);
  // 不得出现远程图标地址
  expect(ts).not.toMatch(/https?:\/\/[^"']*(iconfont|cdn|alicdn|fontawesome)/i);

  // 动作区：编辑门店 / 合作状态 / 邀请经纪人，顺序固定
  const opsStart = wxml.indexOf('class="ops"');
  const opsEnd = wxml.indexOf("<!-- 拜访时间线", opsStart);
  const ops = wxml.slice(opsStart, opsEnd);
  expect(ops.indexOf("编辑门店")).toBeGreaterThan(0);
  expect(ops.indexOf("编辑门店")).toBeLessThan(ops.indexOf("合作状态"));
  expect(ops.indexOf("合作状态")).toBeLessThan(ops.indexOf("邀请经纪人"));
  // 佣金结算入口已按后续重构移除（原为下一期占位功能）
  expect(wxml).not.toContain("onCommission");
  expect(wxml).not.toContain("ACTION_ICONS");

  // 照片补录按钮已按反馈移除（非高频动作，统一在「编辑门店」里处理）
  expect(wxml).not.toContain("onAddPhotos");
  expect(wxml).not.toContain("＋ 补录");
  expect(ts).not.toMatch(/onAddPhotos/);
  // 详情页只展示照片；空态提示指向编辑门店
  expect(wxml).toContain("暂无照片，可在「编辑门店」里补门头照");
  expect(wxml).toMatch(/<scroll-view scroll-x class="photo-scroll" wx:if="\{\{photos\.length\}\}">/);
  // 能力仍在：编辑门店页负责照片增删
  const editForm = read("pages/merchant/store/create/index.ts");
  const editWxml = read("pages/merchant/store/create/index.wxml");
  expect(editForm).toContain("pickAndUploadPhotos");
  expect(editWxml).toContain('bindtap="onAddPhoto"');
  expect(editWxml).toContain('bindtap="onRemovePhoto"');
});

test("REQ-IT6-03 商户端配色对齐 DESIGN.md：hero 去深色底、卡片统一三层阴影、一屏一个 Ink 填充 CTA", () => {
  const files = merchantWxss();
  expect(files.length).toBeGreaterThanOrEqual(11);

  const offenders: string[] = [];
  for (const { rel, content } of files) {
    // 1) 每个商户页都纳入主题，且 @import 的相对路径从该文件出发必须真实存在
    const importMatch = content.match(/@import\s+"([^"]*merchant-theme\.wxss)";/);
    if (!importMatch) {
      offenders.push(`${rel}: 缺少 merchant-theme 引入`);
    } else {
      const resolved = path.resolve(path.dirname(path.resolve(MINIAPP, rel)), importMatch[1]);
      if (!fs.existsSync(resolved)) {
        offenders.push(`${rel}: theme 路径无法解析（${importMatch[1]}）`);
      }
    }
    // 2) 不允许字面色与整片白色 alpha 文本（深色 hero 时代遗留）
    if (/#fff\b|#ffffff\b/i.test(content)) {
      offenders.push(`${rel}: 残留字面色值 #fff`);
    }
    // 照片类型角标位于图片上，白色半透明底属于可读性需要（DESIGN D13），不算深色底遗留
    const withoutPhotoBadge = content.replace(/\.photo-type\s*\{[^}]*\}/g, "");
    if (/rgba\(255,\s*255,\s*255/.test(withoutPhotoBadge)) {
      offenders.push(`${rel}: 残留白色 alpha（深色底遗留）`);
    }
    // 3) hero / store-head 不再整块 Ink 填充（DESIGN：深墨只留给主 CTA）
    for (const sel of [".hero", ".store-head"]) {
      const idx = content.indexOf(`${sel} {`);
      if (idx >= 0) {
        const block = content.slice(idx, content.indexOf("}", idx));
        if (block.includes("background: var(--ink)")) {
          offenders.push(`${rel}: ${sel} 仍是深色底`);
        }
      }
    }
    // 4) 卡片统一 DESIGN 三层阴影
    if (content.includes("var(--shadow-sm)")) {
      offenders.push(`${rel}: 仍用旧单层阴影 --shadow-sm`);
    }
  }
  expect(offenders).toEqual([]);

  const theme = read("styles/merchant-theme.wxss");
  expect(theme).toContain("--mp-shadow: 0 0 0 1rpx rgba(23, 25, 28, 0.06)");
  expect(theme).toContain("--mp-hairline: rgba(23, 25, 28, 0.08)");
  expect(theme).toContain("--mp-radius-card: 48rpx");

  // 次级按钮降级：状态页按钮与搜索按钮不再是 Ink 填充（一屏只留一个主 CTA）
  const homeWxml = read("pages/merchant/home/index.wxml");
  const searchRow = homeWxml.slice(homeWxml.indexOf('class="search-row'), homeWxml.indexOf("</view>", homeWxml.indexOf('class="search-row')));
  expect(searchRow).toContain('class="mbtn"');
  expect(searchRow).not.toContain("mbtn--ink");

  const stateBtnOffenders = files
    .filter(({ content }) => {
      const idx = content.indexOf(".state__btn {");
      if (idx < 0) {
        return false;
      }
      const block = content.slice(idx, content.indexOf("}", idx));
      return block.includes("background: var(--ink)");
    })
    .map(({ rel }) => rel);
  expect(stateBtnOffenders).toEqual([]);

  // 页脚主 CTA 唯一：每个带 footer 的页面仍用共享 Ink 主按钮
  for (const rel of [
    "pages/merchant/home/index.wxml",
    "pages/merchant/store/create/index.wxml",
    "pages/merchant/visit/create/index.wxml",
  ]) {
    expect(read(rel)).toContain('class="mbtn mbtn--ink mbtn--cta"');
  }
});
