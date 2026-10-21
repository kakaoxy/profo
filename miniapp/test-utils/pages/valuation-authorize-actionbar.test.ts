/**
 * 「评估授权」页底部操作栏文案长度回归测试.
 *
 * 背景（2026-10-21 真实缺陷）：viewMode 两动作栏左键曾写「标记为他司成交」（7 字）。
 * 320px 窄屏下该文案在 95px 可用宽内换行成两行，被 `.abtn` 固定 `line-height: 92rpx`
 * 裁掉第二行 —— 现场表现就是「按钮文字显示不全」（实测 scrollHeight 68px > clientHeight 44px）。
 *
 * 修复两道防线（本测试锁死）：
 * 1. 文案收敛为 4 字「他司成交」，且与三动作栏同文案（同一动作不应两种说法）；
 * 2. `.abtn` 增加 white-space: nowrap + overflow: hidden + text-overflow: ellipsis，
 *    让未来任何更长的文案退化为省略号而不是「被裁掉一半」。
 *
 * 宽度预算（375px 屏，1rpx=0.5px，font-size 28rpx=14px）：
 *   两动作栏 左键 ≈ 115px；三动作栏「他司成交」≈ 77px、「分享给客户」定宽 100px。
 *   4 个汉字 ≈ 56px，含安全余量。**底部栏单按钮文案上限按 6 个汉字计。**
 */
import { describe, expect, it } from "vitest";
// wxml/wxss 以 ?raw 静态内联（声明见 test-utils/types/vite-raw.d.ts）
import authorizeWxml from "../../pages/valuation/authorize/index.wxml?raw";
import authorizeWxss from "../../pages/valuation/authorize/index.wxss?raw";

/** 从 wxml 里取出所有底部操作栏区块 */
function actionBarBlocks(wxml: string): string[] {
  return wxml.match(/<view class="actionbar"[\s\S]*?<\/view>/g) ?? [];
}

/** 取区块内所有按钮的纯文本文案 */
function buttonTexts(block: string): string[] {
  return [...block.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
}

/** 按 CJK=1em、ASCII≈0.5em 估算渲染宽度（px），字号 14px */
function estimateWidthPx(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) w += 14;
    else if (ch === " ") w += 4;
    else w += 7;
  }
  return w;
}

/** 底部栏单按钮文案长度上限（汉字数）——超过即需改短，不靠换行容纳 */
const MAX_BAR_BUTTON_HANZI = 6;

/** 设备宽度（px）与 1rpx 对应 px —— 用于按最窄常见机评可用宽 */
const NARROW_DEVICE_PX = 320;
const RPX = 0.5;
/** .actionbar 左右 padding 32rpx、按钮间距 20rpx */
const BAR_PADDING_PX = 32 * RPX * 2;
const BAR_GAP_PX = 20 * RPX;
/** `.abtn--share` 定宽：padding 0 30rpx + 5 汉字 */
const SHARE_BTN_PX = 30 * RPX * 2 + 2 * 14; // 「分享」2 字 + padding 0 30rpx

/**
 * 按 wxml 中每个按钮的 flex 声明，算出它在最窄设备上**自己**的可用宽度.
 *
 * 必须逐个按钮算而不能一律取最窄值：默认栏右键是 flex:1.9（320px 下有 181px），
 * 若按左键 95px 一刀切会误报「给出评估价并批准」溢出。
 */
function availableWidths(block: string): { text: string; avail: number }[] {
  const buttons = [...block.matchAll(/<button class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({
    cls: m[1],
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
  const inner = NARROW_DEVICE_PX - BAR_PADDING_PX - BAR_GAP_PX * (buttons.length - 1);
  const shareCount = buttons.filter((b) => b.cls.includes("abtn--share")).length;
  const wideFixed = shareCount * SHARE_BTN_PX;
  const totalFlex = buttons.reduce((sum, b) => {
    if (b.cls.includes("abtn--share")) return sum;
    const m = b.cls.match(/abtn--primary/);
    return sum + (m ? 1.9 : 1);
  }, 0);
  const flexUnit = (inner - wideFixed) / totalFlex;
  return buttons.map((b) => ({
    text: b.text,
    avail: b.cls.includes("abtn--share") ? SHARE_BTN_PX : (b.cls.includes("abtn--primary") ? 1.9 : 1) * flexUnit,
  }));
}

describe("底部操作栏文案（真实缺陷回归）", () => {
  it("wxml 里存在底部操作栏区块", () => {
    expect(actionBarBlocks(authorizeWxml).length).toBe(2); // 默认栏（评估前）+ viewMode 栏（评估后）
  });

  it("窄键（flex:1）上的按钮文案 ≤ 6 个汉字；宽键（flex:1.9）放宽到 8 字", () => {
    // 口径说明：两动作栏左键 320px 下仅 ~95px，最多容 6 汉字；
    // 右键是 1.9 倍宽（~181px），8 字「给出评估价并批准」实测 112px 可容纳。
    const violations: string[] = [];
    for (const block of actionBarBlocks(authorizeWxml)) {
      const buttons = [...block.matchAll(/<button class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)];
      for (const m of buttons) {
        const cls = m[1];
        const text = m[2].replace(/<[^>]+>/g, "").trim();
        const hanziCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
        const limit = cls.includes("abtn--primary") ? 8 : MAX_BAR_BUTTON_HANZI;
        if (hanziCount > limit) violations.push(`${text}（${hanziCount} 汉字 > ${limit}）`);
      }
    }
    expect(violations, `以下底部栏文案过长：${violations.join("、")}`).toEqual([]);
  });

  it("每个底部栏按钮文案都能在自己的可用宽内放下（320px 最窄机，逐按钮按 flex 核算）", () => {
    const overflow: string[] = [];
    for (const block of actionBarBlocks(authorizeWxml)) {
      for (const { text, avail } of availableWidths(block)) {
        const need = estimateWidthPx(text);
        // 留 8px 安全余量（字重 600 实机会略宽于估算）
        if (need > avail - 8) {
          overflow.push(`${text}（需 ${need.toFixed(0)}px / 可用 ${avail.toFixed(0)}px）`);
        }
      }
    }
    expect(overflow, `以下文案在 320px 屏会换行被行高裁掉：${overflow.join("、")}`).toEqual([]);
  });

  it("底部操作栏不再放分享按钮（唯一分享入口在「评估结论」卡内，避免重复入口）", () => {
    const barShareCount = actionBarBlocks(authorizeWxml).filter((b) => b.includes("abtn--share")).length;
    expect(barShareCount, "底部栏不应再有 open-type=share 按钮：分享只保留结论卡内 vp-share").toBe(0);
  });

  it("分享按钮仍在页面上方结论卡内（vp-share，open-type=share）", () => {
    // 防"两侧都删掉"的误操作：结论卡必须有且是唯一分享入口
    const shareButtons = [...authorizeWxml.matchAll(/<button class="vp-share"[^>]*>/g)];
    expect(shareButtons.length).toBe(1);
    expect(shareButtons[0][0]).toContain('open-type="share"');
    // 全文 open-type="share" 出现次数应为 1（唯一入口）
    const total = (authorizeWxml.match(/open-type="share"/g) ?? []).length;
    expect(total, "分享入口应只有结论卡内一个").toBe(1);
  });

  it("「评估不符」不再带「· 放弃」后缀（9 字在 320px 需 99px 超 96px 可用）", () => {
    const texts = actionBarBlocks(authorizeWxml).flatMap(buttonTexts).join("|");
    expect(texts).toContain("评估不符");
    expect(texts).not.toContain("评估不符 · 放弃");
  });

  it("「他司成交」动作只用 4 字文案，不再出现 7 字的「标记为他司成交」", () => {
    const barText = actionBarBlocks(authorizeWxml).flatMap(buttonTexts).join("|");
    expect(barText).toContain("他司成交");
    expect(barText).not.toContain("标记为他司成交");
  });

  it("底部栏只有一个「他司成交」按钮，且文案为 4 字", () => {
    // 合并分享入口后，viewMode 底部栏只剩一个分支（他司成交 + 更新跟进）
    const lostLabels = actionBarBlocks(authorizeWxml)
      .flatMap((b) =>
        [...b.matchAll(/<button class="[^"]*abtn--lost[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
          m[1].replace(/<[^>]+>/g, "").trim(),
        ),
      );
    expect(lostLabels.length).toBe(1);
    expect(lostLabels[0]).toBe("他司成交");
  });
});

describe(".abtn 样式防线：禁止换行（防未来长文案被裁）", () => {
  it(".abtn 声明了 white-space: nowrap", () => {
    const block = authorizeWxss.match(/\.abtn\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(block).toContain("white-space: nowrap");
  });

  it(".abtn 声明了 overflow: hidden 与 text-overflow: ellipsis（长文案退化为省略号而非被裁一半）", () => {
    const block = authorizeWxss.match(/\.abtn\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(block).toContain("overflow: hidden");
    expect(block).toContain("text-overflow: ellipsis");
  });

  it(".abtn 保持固定行高（nowrap 前提下不会再触发两行裁切）", () => {
    const block = authorizeWxss.match(/\.abtn\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(block).toMatch(/line-height:\s*92rpx/);
    expect(block).toMatch(/height:\s*92rpx/);
  });
});
