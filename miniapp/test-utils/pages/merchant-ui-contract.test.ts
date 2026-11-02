/**
 * 商户模块设计契约（可执行版）.
 *
 * 契约来源：`docs/design/2026-11-02-小程序商户模块-UI审查报告.md` §6 验收基线 +
 * `DESIGN.md` 的「小程序（WeChat Mini Program）移动端补充条款」M1–M7。
 *
 * 做法与 `pages/valuation-authorize-actionbar.test.ts` 同范式：用 `?raw` 把页面静态资源内联进来，
 * 做正则/结构断言。这是本仓库唯一能对 WXSS/WXML 生效的自动化防线——微信开发者工具无法在 CI 里跑，
 * 所以「视觉基线」在这里被拆成可判定的机械规则：token 唯一入口、字号字重色值不许绕过 token、
 * 字符图标清零、按压态覆盖率、每屏一个主 CTA、状态色三档、四态齐备、底栏安全区。
 *
 * 只锁「能机械判定」的部分；间距节奏、阴影质感、交互手感仍需真机确认（DESIGN M8 U1–U6）。
 */
import { describe, expect, it } from "vitest";

import designMd from "../../../DESIGN.md?raw";
import themeWxss from "../../styles/merchant-theme.wxss?raw";

import acCreateWxml from "../../pages/merchant/agreement/create/index.wxml?raw";
import acCreateWxss from "../../pages/merchant/agreement/create/index.wxss?raw";
import acDetailWxml from "../../pages/merchant/agreement/detail/index.wxml?raw";
import acDetailWxss from "../../pages/merchant/agreement/detail/index.wxss?raw";
import acListWxml from "../../pages/merchant/agreement/list/index.wxml?raw";
import acListWxss from "../../pages/merchant/agreement/list/index.wxss?raw";
import acMerchantSignWxml from "../../pages/merchant/agreement/merchant-sign/index.wxml?raw";
import acMerchantSignWxss from "../../pages/merchant/agreement/merchant-sign/index.wxss?raw";
import acSignWxml from "../../pages/merchant/agreement/sign/index.wxml?raw";
import acSignWxss from "../../pages/merchant/agreement/sign/index.wxss?raw";
import brokerStoreCreateWxml from "../../pages/merchant/broker/store-create/index.wxml?raw";
import brokerStoreCreateWxss from "../../pages/merchant/broker/store-create/index.wxss?raw";
import brokerWxml from "../../pages/merchant/broker/index.wxml?raw";
import brokerWxss from "../../pages/merchant/broker/index.wxss?raw";
import homeWxml from "../../pages/merchant/home/index.wxml?raw";
import homeWxss from "../../pages/merchant/home/index.wxss?raw";
import storeCreateWxml from "../../pages/merchant/store/create/index.wxml?raw";
import storeCreateWxss from "../../pages/merchant/store/create/index.wxss?raw";
import storeDetailWxml from "../../pages/merchant/store/detail/index.wxml?raw";
import storeDetailWxss from "../../pages/merchant/store/detail/index.wxss?raw";
import visitCreateWxml from "../../pages/merchant/visit/create/index.wxml?raw";
import visitCreateWxss from "../../pages/merchant/visit/create/index.wxss?raw";

interface PageUnderTest {
  /** 相对 miniapp/ 的目录，用于生成期望的 @import 路径 */
  dir: string;
  wxml: string;
  wxss: string;
}

const PAGES: PageUnderTest[] = [
  { dir: "pages/merchant/home", wxml: homeWxml, wxss: homeWxss },
  { dir: "pages/merchant/store/create", wxml: storeCreateWxml, wxss: storeCreateWxss },
  { dir: "pages/merchant/store/detail", wxml: storeDetailWxml, wxss: storeDetailWxss },
  { dir: "pages/merchant/visit/create", wxml: visitCreateWxml, wxss: visitCreateWxss },
  { dir: "pages/merchant/broker", wxml: brokerWxml, wxss: brokerWxss },
  { dir: "pages/merchant/broker/store-create", wxml: brokerStoreCreateWxml, wxss: brokerStoreCreateWxss },
  { dir: "pages/merchant/agreement/list", wxml: acListWxml, wxss: acListWxss },
  { dir: "pages/merchant/agreement/create", wxml: acCreateWxml, wxss: acCreateWxss },
  { dir: "pages/merchant/agreement/detail", wxml: acDetailWxml, wxss: acDetailWxss },
  { dir: "pages/merchant/agreement/sign", wxml: acSignWxml, wxss: acSignWxss },
  { dir: "pages/merchant/agreement/merchant-sign", wxml: acMerchantSignWxml, wxss: acMerchantSignWxss },
];

/** 审查报告列出的字符图标与半角省略号（I1–I5、T9） */
const FORBIDDEN_GLYPHS = ["＋", "›", "✓", "→", "..."];

/** 只允许出现在 `styles/merchant-theme.wxss` 的旧类名与旧 token（P0-1/P0-5、C1–C3） */
const LEGACY_SYMBOLS = [
  ".hero",
  ".mini-btn",
  ".store-head",
  "chip-apricot",
  "chip-sky",
  "chip-fog",
  "--mint",
  "#1f6b52",
  "#2a5ca0",
  "var(--merchant-",
];

/** 页面 WXSS 里不允许出现的「绕过 token」写法（P0-2/P0-3、S1、M5、M6） */
const TOKEN_BYPASS_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "裸字号（必须用 --mp-* 五档）", re: /font-size:\s*[\d.]+rpx/ },
  { name: "字重 600/700（M2 上限 500）", re: /font-weight:\s*(?:600|700)/ },
  { name: "十六进制色值（必须用语义 token）", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "transition: all（M6 只允许具名属性）", re: /transition:\s*all/ },
  { name: "负 margin（M5 禁止）", re: /margin[a-z-]*:\s*-/ },
  { name: "9px 以下圆角（DESIGN 禁 <12px 锐角）", re: /border-radius:\s*(?:1\d|20)rpx/ },
  { name: "@keyframes 循环动画（M6 禁止）", re: /@keyframes/ },
];

interface TagToken {
  name: string;
  attrs: string;
  line: number;
  closing: boolean;
  selfClosing: boolean;
}

/** 极简 WXML 标签流解析：只为「结构里数按钮 / 数按压态」服务，不是通用 XML 解析器. */
function tokenize(wxml: string): TagToken[] {
  const tokens: TagToken[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z-]*)((?:[^<>]|"[^"]*"|\n)*?)(\/?)>/g;
  let match: RegExpExecArray | null = re.exec(wxml);
  while (match !== null) {
    const name = match[2];
    const closing = match[1] === "/";
    const isVoid = ["image", "input", "icon", "progress"].includes(name);
    tokens.push({
      name,
      attrs: match[3],
      line: wxml.slice(0, match.index).split("\n").length,
      closing,
      selfClosing: match[4] === "/" || isVoid,
    });
    match = re.exec(wxml);
  }
  return tokens;
}

/**
 * 返回每个标签的「祖先签名」：标签名 + class 值（自外向内），
 * 这样能判定某个按钮是否落在 `.foot` / `.modal-actions` / `.state` 里。
 */
function ancestorChains(tokens: TagToken[]): string[] {
  const stack: string[] = [];
  const chains: string[] = [];
  tokens.forEach((token) => {
    if (token.closing) {
      stack.pop();
      chains.push("");
      return;
    }
    chains.push(stack.join(" "));
    if (!token.selfClosing) {
      stack.push(`${token.name}:${attrValue(token.attrs, "class") || ""}`);
    }
  });
  return chains;
}

function attrValue(attrs: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : null;
}

describe("共享层是商户模块唯一样式来源", () => {
  it("11 个页面都以正确的相对深度 @import merchant-theme", () => {
    PAGES.forEach(({ dir, wxss }) => {
      // 目录相对 miniapp/ 的层级数 = 需要向上跳的次数
      const depth = dir.split("/").length;
      const expected = `@import "${"../".repeat(depth)}styles/merchant-theme.wxss";`;
      const firstLine = wxss.split("\n").find((line) => line.trim().length > 0) || "";
      expect(firstLine, `${dir}/index.wxss 首个非空行应是共享层 import`).toBe(expected);
    });
  });

  it("页面 WXSS 不再定义基础件（只写该页独有布局）", () => {
    PAGES.forEach(({ dir, wxss }) => {
      LEGACY_SYMBOLS.forEach((symbol) => {
        expect(wxss.includes(symbol), `${dir}/index.wxss 出现旧类名/旧 token：${symbol}`).toBe(false);
      });
    });
  });

  it("页面 WXSS 不绕过字号/字重/色值/动效 token", () => {
    PAGES.forEach(({ dir, wxss }) => {
      TOKEN_BYPASS_PATTERNS.forEach(({ name, re }) => {
        expect(re.test(wxss), `${dir}/index.wxss 命中「${name}」`).toBe(false);
      });
    });
  });

  it("共享层守住单文件行数上限，且只定义一套 token", () => {
    expect(themeWxss.split("\n").length).toBeLessThanOrEqual(500);
    ["--mp-title", "--mp-heading", "--mp-body", "--mp-label", "--mp-caption"].forEach((token) => {
      expect(themeWxss).toContain(token);
    });
    expect(themeWxss).toContain("calc(136rpx + env(safe-area-inset-bottom) + 24rpx)");
    expect(themeWxss).toContain("1rpx solid var(--mp-hairline)");
    expect(themeWxss).not.toMatch(/font-weight:\s*(?:600|700)/);
  });

  it("底栏主按钮撑满（回归：<button> 自带 184px 宽度，父级必须 flex + flex:1）", () => {
    const footBlock = /\.foot\s*\{([^}]*)\}/.exec(themeWxss)?.[1] || "";
    expect(footBlock, "底栏 .foot 必须是 flex 容器").toMatch(/display:\s*flex/);
    expect(themeWxss, "底栏按钮必须由父级 flex:1 分配宽度").toMatch(/\.foot\s+\.mbtn\s*\{[^}]*flex:\s*1/);
  });

  it("按钮复位小程序 <button> 内置的 184px 固定宽度", () => {
    expect(themeWxss, ".mbtn 需复位 width/min-width").toMatch(
      /\.mbtn\s*\{[^}]*width:\s*auto\s*!important/,
    );
    expect(themeWxss, ".mbtn--cta / .mbtn--block 需全宽").toMatch(
      /\.mbtn--cta\s*\{[^}]*width:\s*100%\s*!important/,
    );
  });
});

describe.each(PAGES)("$dir 的设计基线", ({ dir, wxml, wxss }) => {
  it("不重定义页面骨架（.page 由共享层拥有）", () => {
    expect(/\.page\s*\{/.test(wxss), `${dir}/index.wxss 重写了 .page`).toBe(false);
  });

  it("四态齐备（loading / error / needLogin）", () => {
    expect(wxml, "缺少 loading 态").toContain("state === 'loading'");
    expect(wxml, "缺少 error 态").toMatch(/state === 'error'/);
    expect(wxml, "缺少 needLogin 态").toContain("state === 'needLogin'");
  });

  it("没有字符图标冒充 SVG 图标", () => {
    FORBIDDEN_GLYPHS.forEach((glyph) => {
      expect(wxml.includes(glyph), `${dir}/index.wxml 仍在使用字符「${glyph}」`).toBe(false);
    });
  });

  it("每个可点标签都有按压态", () => {
    const tokens = tokenize(wxml);
    const missing = tokens
      .filter((token) => !token.closing)
      .filter((token) => /(?:bindtap|catchtap)=/.test(token.attrs))
      .filter((token) => attrValue(token.attrs, "hover-class") === null)
      .map((token) => `${dir}/index.wxml:${token.line} <${token.name}> 有 tap 无 hover-class`);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("每屏主内容区最多一个 Ink 填充，且底栏主按钮统一为 96rpx 全宽", () => {
    const tokens = tokenize(wxml);
    const chains = ancestorChains(tokens);
    const inkIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => !token.closing && (attrValue(token.attrs, "class") || "").includes("mbtn--ink"));
    expect(inkIndexes.length, `${dir}/index.wxml 完全没有 Ink 主按钮`).toBeGreaterThan(0);

    // 主内容区（不在底栏/弹层/登录引导里）不允许有 Ink 填充按钮
    inkIndexes.forEach(({ token, index }) => {
      const chain = chains[index];
      const allowed = ["foot", "modal-actions", "modal", "state"].some((scope) => chain.includes(scope));
      expect(allowed, `${dir}/index.wxml:${token.line} 的 Ink 按钮不在底栏/弹层/登录引导里`).toBe(true);
    });

    // 全宽主 CTA 每屏一个：只许出现在底栏或登录引导（互斥分支各自一个，同屏只见一个）
    const primaries = inkIndexes.filter(({ token }) => /mbtn--cta/.test(token.attrs));
    expect(primaries.length, `${dir}/index.wxml 缺少 96rpx 全宽主按钮`).toBeGreaterThan(0);
    primaries.forEach(({ token, index }) => {
      const chain = chains[index];
      const allowed = chain.includes("foot") || chain.includes("state");
      expect(allowed, `${dir}/index.wxml:${token.line} 的全宽主按钮不在底栏/登录引导里`).toBe(true);
    });
  });

  it("页面标题落在画布上，且每屏只有一个（P0-5 / L1）", () => {
    const titles = wxml.match(/class="head__title"/g) || [];
    // 2 个仅允许出现在互斥状态分支（如经纪人的「认证」与「档案」两态）
    expect(titles.length, `${dir}/index.wxml 的 head__title 数量应为 1（或互斥分支各 1）`).toBeGreaterThanOrEqual(1);
    expect(titles.length).toBeLessThanOrEqual(2);
    expect(wxml, `${dir}/index.wxml 的标题不应再包在白卡 .hero 里`).not.toMatch(/class="hero"/);
  });

  it("有固定底栏的页面必须留出底栏 + 安全区（P0-7）", () => {
    if (wxml.includes('class="foot"')) {
      expect(wxml, `${dir}/index.wxml 有底栏但根节点没用 page page--foot`).toContain("page page--foot");
    }
  });

  it("状态色只用三档语义 chip", () => {
    const chips = wxml.match(/chip--[a-z-]+/g) || [];
    const literal = chips.filter((name) => !name.startsWith("chip--{"));
    const allowed = new Set(["chip--todo", "chip--done", "chip--void", "chip--tap", "chip--on"]);
    literal.forEach((name) => {
      expect(allowed.has(name), `${dir}/index.wxml 出现非三档状态 chip：${name}`).toBe(true);
    });
  });
});

describe("DESIGN.md 已补写小程序移动端条款", () => {
  it("含 M1–M8 且写清五档字号与状态色映射", () => {
    expect(designMd).toContain("小程序（WeChat Mini Program）移动端补充条款");
    ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"].forEach((marker) => {
      expect(designMd, `DESIGN.md 缺少 ${marker}`).toContain(`### ${marker}`);
    });
    // M1 五档 ramp：rpx 值写在表格列里，不重复带单位
    expect(designMd).toContain("| `--mp-title` | 22 | 44 | 1.25 |");
    expect(designMd).toContain("| `--mp-caption` | 12 | 24 | 1.4 |");
    // M4 按钮三档
    expect(designMd).toContain("30px / 60rpx");
    expect(designMd).toContain("40px / 80rpx");
    expect(designMd).toContain("48px / 96rpx");
  });
});
