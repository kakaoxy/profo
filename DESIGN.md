# Steep — Style Reference
> Soft dawn on a marble dashboard

**Theme:** light

Steep is a daylight analytics workspace: an almost achromatic canvas of white and warm-gray surfaces warmed by a single, restrained rust-peach accent and softened by a serif/sans pairing that reads as editorial rather than enterprise. The hero is a peach-lit dawn — a soft radial glow behind a monumental Signifier headline and floating product cards — then the screen settles into a cool marble dashboard where the product does the talking. Signifier carries all display weight (a deliberate contrast against the utilitarian Sohne body), radii are generously large (24px cards feel like ceramic tiles, not windows), and the entire palette treats color as punctuation: chrome is monochrome, data visualization gets the only two chromatic voices (warm rust and cool blue), and one dark fill button does all the asking. The result feels closer to a magazine layout than a SaaS dashboard — calm, editorial, confident.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | `#17191c` | `--color-ink` | Primary text, filled CTA buttons, dark surfaces — near-black with a whisper of warmth that pairs naturally with the peach accent |
| Pure White | `#ffffff` | `--color-pure-white` | Page canvas, card surfaces, text on dark buttons |
| Fog | `#f7f7f8` | `--color-fog` | Secondary canvas and section backgrounds, sidebar surfaces |
| Ash | `#4c4c4c` | `--color-ash` | Muted body text, secondary strokes |
| Graphite | `#777b86` | `--color-graphite` | Tertiary text, icon strokes, inactive link borders |
| Dove | `#a3a6af` | `--color-dove` | Hairline borders, placeholder text, low-emphasis dividers |
| Slate | `#8b8c8d` | `--color-slate` | Subtle icon and link borders in low-emphasis contexts |
| Obsidian | `#000000` | `--color-obsidian` | Sharp borders, hairlines, deep strokes — used at very small weights to delineate without color |
| Rust | `#5d2a1a` | `--color-rust` | Signature warm accent — donut chart strokes, chart line accents, warm data-viz borders, decorative strokes |
| Apricot Wash | `#fbe1d1` | `--color-apricot-wash` | Soft warm card background for warm-toned data widgets, hero glow tint |
| Sky Wash | `#d3e3fc` | `--color-sky-wash` | Soft cool card background for cool-toned data widgets and chat surfaces |

### Warm Ladder — 科目层级 ①~⑦ 的暖色梯度（受控扩展）

七级科目层级需要可区分的色阶，但不得引入彩虹色。梯度全部取自 Rust/Apricot 同色系，
浅底配深字、深底配白字，**每一级的正文对比度均 ≥ 4.5:1**（层级序号 ①~⑦ 同时写在文案里，颜色只作强化）。
定义位置：`frontend/src/app/(main)/admin/ledger/subjects/_components/subject-schema.ts` 的 `LEVEL_PILL_CLASS`。

| 层级 | 底色 | 描边（同色系加深） | 文字 | 用途 |
|------|------|------|------|------|
| ① 取得成本 | `#fbe1d1`（= Apricot Wash） | `#f2d0ba` | Rust | 浅底深字组 |
| ② 直接改造成本 | `#f7d0b4` | `#eec3a3` | Rust | 浅底深字组 |
| ③ 交易费用 | `#f0bd97` | `#e6b088` | Rust | 浅底深字组 |
| ④ 资金成本 | `#e6a877` | `#dc9c6a` | Rust | 浅底深字组 |
| ⑤ 现金流专属 | `#a85028` | `#9a4723` | Pure White | 深底白字组 |
| ⑥ 收入项 | `#83381b` | `#763116` | Pure White | 深底白字组 |
| ⑦ 配对项 | `#5d2a1a`（= Rust） | `#5d2a1a` | Pure White | 深底白字组 |

> **此梯度是调色板唯一的「受控扩展」：不要在其它模块复制这些值来做装饰性底色；
> 新增层级时请沿用同色系并校验对比度。**

### Signifier — Display serif used exclusively for hero and section headlines — the only place the brand 'raises its voice'. Its editorial weight against Sohne's utility is the system's most distinctive typographic move · `--font-signifier`
- **Substitute:** GT Sectra, Tiempos Headline, Source Serif Pro
- **Weights:** 400
- **Sizes:** 44px, 64px, 90px
- **Line height:** 1.10
- **Letter spacing:** -0.025em at 64-90px, -0.015em at 44px
- **Role:** Display serif used exclusively for hero and section headlines — the only place the brand 'raises its voice'. Its editorial weight against Sohne's utility is the system's most distinctive typographic move

### Sohne — Body and UI workhorse — navigation, buttons, table cells, form labels, captions. The unusual 430/450/480 micro-weights create a finely graduated hierarchy across data-dense screens without changing font families · `--font-sohne`
- **Substitute:** Inter, Untitled Sans, Söhne (commercial), General Sans
- **Weights:** 400, 430, 450, 480, 500
- **Sizes:** 14px, 15px, 16px, 17px, 18px, 22px, 26px
- **Line height:** 1.25-1.50
- **Letter spacing:** -0.009em
- **Role:** Body and UI workhorse — navigation, buttons, table cells, form labels, captions. The unusual 430/450/480 micro-weights create a finely graduated hierarchy across data-dense screens without changing font families

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 14px | 1.5 | -0.13px | `--text-caption` |
| body | 16px | 1.38 | -0.14px | `--text-body` |
| body-lg | 18px | 1.35 | -0.16px | `--text-body-lg` |
| subheading | 22px | 1.25 | -0.2px | `--text-subheading` |
| heading-sm | 26px | 1.18 | -0.23px | `--text-heading-sm` |
| heading | 44px | 1.1 | -0.66px | `--text-heading` |
| heading-lg | 64px | 1.1 | -1.6px | `--text-heading-lg` |
| display | 90px | 1.1 | -2.25px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |
| 124 | 124px | `--spacing-124` |
| 128 | 128px | `--spacing-128` |
| 160 | 160px | `--spacing-160` |

### Border Radius

| Element | Value |
|---------|-------|
| tags | 9999px |
| cards | 24px |
| images | 12px |
| inputs | 16px |
| avatars | 9999px |
| buttons | 9999px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgba(4, 23, 43, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1)...` | `--shadow-subtle` |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20-24px
- **Element gap:** 8px

## Components

### Filled Dark CTA
**Role:** Primary action button

Pill shape (9999px radius), Ink (#17191c) background, white text at Sohne 15px weight 450, 8px 20px padding, -0.009em tracking. The only filled button in the system; one per screen maximum.

### Text Link Button
**Role:** Secondary action

Ink (#17191c) text, Sohne 15px weight 450, no border or background, paired horizontally with the filled CTA. Sits immediately to the right of the primary button.

### Top Navigation Bar
**Role:** Global navigation

White background, no shadow, Ink logo at left, horizontal nav links (Product, Resources, Customers, Pricing) at Sohne 15px in Ink, ghost text-link and filled CTA grouped at right. Sticky, 64-72px tall, hairline Dove bottom border optional.

### Product Dashboard Card
**Role:** Data widget container

White surface, 24px radius, 20-24px internal padding, card shadow (1px ink-tinted border-shadow + soft 20px/25px drop). Houses a single data visualization: bar chart, donut, line chart, or table.

### Warm Data Card
**Role:** Chart card with warm accent

Apricot Wash (#fbe1d1) background, 24px radius, 20-24px padding. Contains warm-toned visualizations (donut with Rust stroke, line chart with Rust fill). Used sparingly to warm the data grid.

### Cool Data Card
**Role:** Chart card with cool accent

Sky Wash (#d3e3fc) background, 24px radius, 20-24px padding. Contains cool-toned visualizations (bar charts in blue tones, line charts in blue).

### Sidebar Navigation
**Role:** Product app navigation

Fog (#f7f7f8) background, ~240px wide, no border. Logo at top, primary nav items with 16px icons + 15px Sohne text in Ink, grouped sections (Teams with color-dot indicators, Favorites). Active item shows subtle background tint.

### Chat Input Field
**Role:** AI query input

White surface, 16-20px radius, 16px 20px padding, subtle 1px Dove border, 15px Sohne placeholder in Graphite. Black circular send button (40px, 9999px radius) anchored at right.

### AI Response Card
**Role:** Chat response with chart

White surface, 24px radius, soft shadow, contains: light blue chart card (Sky Wash, 16px radius) with line chart in two colors (Rust for 'last month', blue for current), followed by H3 heading and body text in Ink and Ash.

### Avatar Badge
**Role:** User identity marker

32-40px circle, 9999px radius, colored pastel background (mint, sky, peach), 2-letter monogram in Ink at 13px weight 500. Floats over chart cards as annotation callouts.

### Region Stats Card
**Role:** Compact data table widget

White surface, 24px radius, 20px padding. Title in Sohne 15px weight 500 Ink, rows with region name in Graphite at 14px and right-aligned count in Ink at 14px weight 480. 12px row gap.

### Floating Hero Card
**Role:** Decorative product preview in hero

White surface, 24px radius, soft elevation shadow, positioned absolutely around the hero headline. Casts a single signature shadow: 1px ink-tinted border + 20px/25px soft drop + 8px/10px micro drop. Anchors with an avatar badge on one corner.

### Stat Card with Delta
**Role:** KPI display

White surface, 24px radius, 20px padding. Large Sohne number (26-44px Signifier or large Sohne 480) in Ink, small caption label in Graphite 13px, green/red delta indicator with arrow at 12px.

## Do's and Don'ts

### Do
- Use Signifier exclusively at 44-90px for hero and section headlines; never below 40px
- Set filled CTA radius to 9999px with Ink (#17191c) background — one per viewport, paired right with a text-link secondary
- Use 24px radius for all content cards, 20px for inner padding, 12px for product image crops
- Reserve the warm gradient glow for hero contexts only; product UI stays on white/Fog canvas
- Apply Apricot Wash (#fbe1d1) and Sky Wash (#d3e3fc) as card backgrounds for data widgets, not as decorative washes
- Set letter-spacing to -0.009em on all Sohne text and -0.025em on Signifier 64px+
- Build the signature card shadow as a three-layer stack: 1px ink-tinted border + 20px/25px drop + 8px/10px micro drop

### Don't
- Don't use Signifier for body copy, labels, navigation, or anything below 40px
- Don't introduce saturated blues, greens, or reds for UI chrome — the only chromatic voices are Rust and the two pastel washes
- Don't use sharp corners below 12px; the system depends on generous radii to feel soft
- Don't place the warm radial gradient anywhere outside the hero section
- Don't add borders heavier than 1px; delineation happens through surface tints and radii
- Don't use the dark Ink fill for anything other than the primary CTA and dark text
- Don't exceed one filled button per screen; secondary actions are text links, not ghost buttons

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 1 | Canvas | `#ffffff` | Page background, hero backdrop |
| 2 | Fog | `#f7f7f8` | Section backgrounds, sidebar canvas, product shell |
| 3 | Card | `#ffffff` | Elevated content cards with 24px radius |
| 4 | Warm Tint | `#fbe1d1` | Data visualization cards with warm-toned charts |
| 5 | Cool Tint | `#d3e3fc` | Data visualization cards with cool-toned charts, chat bubble surfaces |
| 6 | Ink | `#17191c` | Dark surface for filled CTAs, high-contrast blocks |

## Elevation

- **Floating product card:** `rgba(4, 23, 43, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px`

## Imagery

The site uses no photography or illustration in the marketing chrome — visual interest is generated entirely by floating product UI cards (data widgets, chat inputs, stat blocks) that orbit the hero headline. These cards are rendered as crisp white surfaces with real product content (bar charts, donut charts, line graphs, avatars) rather than abstract decoration. The product screenshots inside the app are clean white dashboards on Fog canvas with sidebar navigation. Iconography is outline-style at ~16-20px, monochrome Ink or Graphite, with a 1.5-2px stroke weight that matches the hairline border language. Avatar badges use pastel backgrounds (mint, sky, peach) as the only spot colors in the UI.

## Layout

Marketing pages use a max-width ~1200px centered column with the hero spanning full viewport width. The hero centers a large Signifier headline (one or two lines) over a soft warm radial gradient, with subtitle and CTA group centered below, surrounded by four floating product cards positioned at corners and edges. Below the hero, sections alternate between white and Fog (#f7f7f8) bands with 80px vertical gaps. Content blocks typically use a 2-column split (text + visual) or a 3-column card grid. The product app uses a fixed left sidebar (240px) with a fluid content area containing responsive card grids (3-4 columns of 24px-radius widgets). Navigation is a single sticky top bar — no mega-menus, no sidebar marketing nav.

## Agent Prompt Guide

**Quick Color Reference**
- text: #17191c (Ink)
- background: #ffffff (Pure White)
- surface: #f7f7f8 (Fog)
- border: #a3a6af (Dove) / #777b86 (Graphite)
- accent: #5d2a1a (Rust)
- primary action: #17191c (filled action)

**Example Component Prompts**
1. *Hero section:* white canvas with soft radial gradient glow in #fbe1d1 at 30% opacity, centered. Headline at 64px Signifier weight 400, #17191c, letter-spacing -1.6px. Subtitle at 18px Sohne weight 400, #4c4c4c. Filled CTA (Ink #17191c, white text, 9999px radius, 8px 20px padding) paired right with a text-link secondary.

2. *Dashboard card grid:* Fog (#f7f7f8) canvas, 3-column grid of white cards (24px radius, 20px padding, signature three-layer shadow). One card uses Apricot Wash background with a Rust-stroke donut chart; another uses Sky Wash with a blue bar chart.

3. *AI response card:* white surface, 24px radius, signature shadow. Inner chart card with Sky Wash background (16px radius) containing a two-line chart — Rust (#5d2a1a) for previous period, #4a90e2 blue for current. Followed by 26px Sohne weight 500 Ink heading and 16px Sohne weight 400 Ash body text with blue inline links.

4. *Sidebar navigation:* Fog (#f7f7f8) background, 240px wide, no border. Logo at top, nav items with 16px outline icons + 15px Sohne 450 in Ink, grouped under section labels (13px Sohne 500 in Graphite, uppercase, 0.5px tracking). Active item shows #ffffff background with 12px radius.

5. *Region stats card:* white surface, 24px radius, 20px padding. Title 'Region' at 15px Sohne 500 Ink. Rows at 14px Sohne — region name in #777b86, right-aligned count in Ink weight 480, separated by 12px vertical gap with no visible dividers.

## Typographic Voice

The Signifier/Sohne pairing is the brand's most identifiable decision. Signifier is the editorial voice — used only when the page is making a statement (hero headline, section openers, possibly pull quotes). Sohne is the working voice for everything else, including the rare subheading larger than 22px. The micro-weight range (430, 450, 480) within Sohne creates a granular hierarchy that replaces the usual bold/regular binary — a 450 weight table header reads as 'important' without being heavy. Never bold Sohne; use weight 480 or 500 instead. Never set Signifier below 40px — it loses its editorial authority and becomes an awkward novelty.

## Similar Brands

- **Linear** — Same editorial restraint: single dark CTA pill, generous 24px+ card radii, achromatic canvas with a single restrained accent, and a dual-typeface system that pairs a distinctive display face with a utility sans
- **Vercel** — Matches the floating-product-cards-around-headline hero pattern, monochrome chrome with warm gradient glow, and the same 'marble dashboard' product UI with sidebar + card grid
- **Stripe** — Same editorial typography pairing (serif display + sans body), generous spacing, and the use of soft pastel tints as card backgrounds for data visualization
- **Raycast** — Shares the pill-button + monochrome chrome + generous radii language, though Raycast is darker and more compact; Steep is the daylight equivalent
- **Height** — Same achromatic productivity-tool palette with a single warm accent, large radii, and the editorial-light feel of a tool that treats data as content rather than chrome

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-ink: #17191c;
  --color-pure-white: #ffffff;
  --color-fog: #f7f7f8;
  --color-ash: #4c4c4c;
  --color-graphite: #777b86;
  --color-dove: #a3a6af;
  --color-slate: #8b8c8d;
  --color-obsidian: #000000;
  --color-rust: #5d2a1a;
  --color-apricot-wash: #fbe1d1;
  --color-sky-wash: #d3e3fc;

  /* Typography — Font Families */
  --font-signifier: 'Signifier', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sohne: 'Sohne', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 14px;
  --leading-caption: 1.5;
  --tracking-caption: -0.13px;
  --text-body: 16px;
  --leading-body: 1.38;
  --tracking-body: -0.14px;
  --text-body-lg: 18px;
  --leading-body-lg: 1.35;
  --tracking-body-lg: -0.16px;
  --text-subheading: 22px;
  --leading-subheading: 1.25;
  --tracking-subheading: -0.2px;
  --text-heading-sm: 26px;
  --leading-heading-sm: 1.18;
  --tracking-heading-sm: -0.23px;
  --text-heading: 44px;
  --leading-heading: 1.1;
  --tracking-heading: -0.66px;
  --text-heading-lg: 64px;
  --leading-heading-lg: 1.1;
  --tracking-heading-lg: -1.6px;
  --text-display: 90px;
  --leading-display: 1.1;
  --tracking-display: -2.25px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-w430: 430;
  --font-weight-w450: 450;
  --font-weight-w480: 480;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-124: 124px;
  --spacing-128: 128px;
  --spacing-160: 160px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 80px;
  --card-padding: 20-24px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-sm: 0.01px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 24px;

  /* Named Radii */
  --radius-tags: 9999px;
  --radius-cards: 24px;
  --radius-images: 12px;
  --radius-inputs: 16px;
  --radius-avatars: 9999px;
  --radius-buttons: 9999px;

  /* Shadows */
  --shadow-subtle: rgba(4, 23, 43, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px;

  /* Surfaces */
  --surface-canvas: #ffffff;
  --surface-fog: #f7f7f8;
  --surface-card: #ffffff;
  --surface-warm-tint: #fbe1d1;
  --surface-cool-tint: #d3e3fc;
  --surface-ink: #17191c;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-ink: #17191c;
  --color-pure-white: #ffffff;
  --color-fog: #f7f7f8;
  --color-ash: #4c4c4c;
  --color-graphite: #777b86;
  --color-dove: #a3a6af;
  --color-slate: #8b8c8d;
  --color-obsidian: #000000;
  --color-rust: #5d2a1a;
  --color-apricot-wash: #fbe1d1;
  --color-sky-wash: #d3e3fc;

  /* Typography */
  --font-signifier: 'Signifier', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sohne: 'Sohne', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 14px;
  --leading-caption: 1.5;
  --tracking-caption: -0.13px;
  --text-body: 16px;
  --leading-body: 1.38;
  --tracking-body: -0.14px;
  --text-body-lg: 18px;
  --leading-body-lg: 1.35;
  --tracking-body-lg: -0.16px;
  --text-subheading: 22px;
  --leading-subheading: 1.25;
  --tracking-subheading: -0.2px;
  --text-heading-sm: 26px;
  --leading-heading-sm: 1.18;
  --tracking-heading-sm: -0.23px;
  --text-heading: 44px;
  --leading-heading: 1.1;
  --tracking-heading: -0.66px;
  --text-heading-lg: 64px;
  --leading-heading-lg: 1.1;
  --tracking-heading-lg: -1.6px;
  --text-display: 90px;
  --leading-display: 1.1;
  --tracking-display: -2.25px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-124: 124px;
  --spacing-128: 128px;
  --spacing-160: 160px;

  /* Border Radius */
  --radius-sm: 0.01px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 24px;

  /* Shadows */
  --shadow-subtle: rgba(4, 23, 43, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px;
}
```

---

## 小程序（WeChat Mini Program）移动端补充条款

> **来源**：`docs/design/2026-11-02-小程序商户模块-UI审查报告.md` 第 8 节列出的 7 项契约缺项（移动端比例尺缺失、中文替代未定义、微字重不可用、Dove/Graphite 对比度、移动端组件缺席、状态色语义未定义、触控未定义）。本节是这些缺项的裁决结果，**自本节起对 `miniapp/**` 生效**。
> **冲突处理**：上文 Web 契约（Signifier 不得低于 40px、430/450/480 微字重、三层阴影等）在 `miniapp/**` 内不适用，以本节为准；Web 仍以上文为准。
> **单位约定**：设计基准 375pt，`750rpx = 375px`，即 `1px = 2rpx`。本节同时标注 px 与 rpx。

### M1 · 移动端字号 ramp（补 §8.1）

DESIGN 的 14 / 22 / 26 / 44 / 64 / 90 在 375pt 上缺中间档，且 Signifier 不得低于 40px → 移动端原本没有合法的标题字号。移动端只允许以下五档，**不得出现第六档**：

| Token | px | rpx | line-height | letter-spacing | 用途 |
|---|---|---|---|---|---|
| `--mp-title` | 22 | 44 | 1.25 | -0.2px | 页面标题，每页唯一 |
| `--mp-heading` | 18 | 36 | 1.3 | -0.16px | 卡片/区块标题 |
| `--mp-body` | 16 | 32 | 1.5 | -0.14px | 正文、列表主字段 |
| `--mp-label` | 14 | 28 | 1.45 | -0.13px | label、当前状态、按钮文字、次要字段 |
| `--mp-caption` | 12 | 24 | 1.4 | -0.1px | 角标、时间、单位（下限，不得更小） |

- 标题不得继承 `page` 的 `line-height: 1.4`，必须显式给行高。
- 说明文字行高统一 `1.5`，只有协议正文允许 `1.7`。

### M2 · 中文字体与字重降级（补 §8.2、§8.3）

- 字体栈固定为 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif`。小程序内**不使用 Signifier（衬线）**，标题也不降级为衬线。
- iOS/Android 中文字族只暴露 400/500/600，DESIGN 的 430/450/480 无法实现 → 移动端**只允许 `font-weight: 400` 与 `500`**。层级靠字号、颜色、间距分层，不靠字重；`600` 及以上一律视为违规。
- 不使用 `bold` 关键字与 `<text>` 内联 `font-weight`。
- 所有文本 `letter-spacing: -0.009em` 的等价移动端写法已在 M1 表内按档给值，不再单独设置。

### M3 · 状态色语义映射（补 §8.6）

状态只有三种语义，同一颜色不得表示两种含义：

| 语义 | 底色 | 文字色 | 适用 |
|---|---|---|---|
| 待处理 | Apricot Wash `#fbe1d1` | Rust `#5d2a1a` | 待审核、待签署、待补录 |
| 已落定 | Fog `#f7f7f8` | Graphite `#676b76` | 正常、已合作、已签署、已绑定 |
| 异常/已失效 | Pure White `#ffffff` + `1rpx` hairline 描边 | Rust `#5d2a1a` | 已作废、已过期、距离异常、已解绑 |

- **停用**：Sky Wash `#d3e3fc`、`#d1f2e8`（mint）、`#1f6b52`、`#2a5ca0` 在 UI chrome 中不得出现（仅允许作数据卡底色，当前商户模块无数据卡）。
- 状态不得只靠颜色区分，必须带文字标签。
- Rust 只承担两件事：文本动作（link）与「印/异常」。不用于大面积填充、不做选中底色。

### M4 · 卡片 / 按钮 / 输入（补 §8.5）

**卡片**：内边距 `20px/40rpx`，卡间距 `12px/24rpx`，圆角 `24px/48rpx`，行内小块最小 `12px/24rpx`。阴影降为单层 hairline + 一层柔和投影：`0 0 0 1rpx rgba(23,25,28,0.06), 0 8rpx 16rpx -8rpx rgba(0,0,0,0.08)`。**页面标题不进卡片**，直接落在 Fog 画布上。

**按钮三档**（高度 / 字号 / 内边距）：

| 档位 | 高度 | 字号 | 内边距 | 用途 |
|---|---|---|---|---|
| 行内小 | 30px / 60rpx | 14px / 28rpx | 0 12px / 0 24rpx | 列表行内动作 |
| 标准次要 | 40px / 80rpx | 14px / 28rpx | 0 16px / 0 32rpx | 弹层、卡内次要动作 |
| 主 CTA | 48px / 96rpx | 14px / 28rpx | 0 16px / 0 32rpx | 每屏唯一 |

- 每屏最多一个 Ink 填充按钮。次要动作用 Rust 文本链接或 Fog 面胶囊，不用二阶描边按钮。
- tab / 筛选项 / 下拉选项的激活态 = **白面 + `2rpx` Ink 描边 + Ink 文字**，不用 Ink 填充、不用 Apricot 底。
- 主 CTA 必须是 `<button>`（有 `loading`/`disabled`）；次要动作用 `<view bindtap>` 时必须带 `hover-class` 且不可重复触发。

**输入**：高 `44px/88rpx`、Fog 底色、`2rpx` `--mp-hairline` 边框、聚焦边框换 Rust、圆角 `16px/32rpx`、占位色 Graphite（**不用 Dove**）。多行输入高 `75px/150rpx`。

### M5 · 间距与对齐

- 4px 网格：8 / 12 / 16 / 20 / 24px（16 / 24 / 32 / 40 / 48rpx）。禁止 6/18/22/28rpx 这类非网格值。
- 一屏内所有内容左缘只有一条：页面级 `16px/32rpx`，卡片内部再内缩 `20px/40rpx`。
- 禁止负 margin 修间距。

### M6 · 图标、触控与动效（补 §8.7）

- **图标**：一律内联 SVG（base64 data URI，避免 CDN/iconfont 失败），统一 `viewBox="0 0 24 24"`、`fill="none"`、`stroke-width="2.4"`、`stroke-linecap/linejoin="round"`、单色 Ash `#4c4c4c`，渲染 `18px/36rpx` → 视觉描边 **1.8px**（落进 DESIGN 的 1.5–2px 区间）。禁止用字符当图标（`＋ › × ✓ →` 全部禁止），不套圆形底座。chevron 用旋转后的路径，不用 `transform: rotate()` 转字符。
- **触控**：可点区域 ≥ `44×44px`（88rpx）。视觉元素小于该尺寸时（chip、删除按钮、chevron），必须用透明内边距把热区撑到 88rpx。
- **按压态**：所有 `bindtap` 的 `<view>`/`<text>` 必须带 `hover-class="hoverable"`（见 M7 样式）；按压只改背景/透明度，不改尺寸。
- **禁用态**：`opacity: 0.4` 且不可触发；`<button>` 用原生 `disabled`。
- **动效**：只允许 `background-color / color / border-color / transform / opacity` 的 `transition`，时长 `120–180ms`，缓动 `ease-out`。禁止 `transition-all`、禁止循环动画、禁止位移类入场。

### M7 · 安全区与固定底栏

- 固定底栏高度 `68px/136rpx` + `env(safe-area-inset-bottom)`；底栏背景为不透明 Fog + 顶部 `1rpx` hairline（不用渐变遮罩）。
- 页面滚动容器底部留白必须为 `calc(136rpx + env(safe-area-inset-bottom) + 24rpx)`，不得写死 160/180/200rpx。
- 登录 / 加载 / 错误 / 空 四态统一：`padding: 60px/120rpx 24px/48rpx`，标题 `--mp-heading`，说明 `--mp-label` Graphite，动作 Rust 文本链接。

### M8 · 已知未收敛项（⚠️ 显式登记）

| 项 | 现状 | 处理 |
|---|---|---|
| Graphite 对比度 | 上文 token `#777b86` 白底约 4.2:1，低于 AA 4.5:1；小程序 `miniapp/app.wxss:10` 已加深为 `#676b76`（白底 5.3:1） | 小程序侧确认 `#676b76` 为权威值；Web `frontend/src/app/globals.css:148 --color-graphite` 仍为 `#777b86`，需单独评审后再同步 |
| Dove 用途 | `#a3a6af` 约 2.4:1 | 仅装饰：分隔线、禁用态、图标；**永不作正文与占位色** |
| 真机观感 | 阴影强度、`switch` 颜色、横向 tab 滚动、刘海屏留白依赖真机 | 见审查报告第 9 节 U1–U6，需微信开发者工具确认 |
