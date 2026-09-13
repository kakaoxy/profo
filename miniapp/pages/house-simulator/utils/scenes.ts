/**
 * 购房模拟器 · 场景视图构建（22 屏 → 有序 SceneBlock 列表）.
 *
 * 与 HiFi 原型 renderScene(scene) 一一对应：每屏产出「顺序化内容块」，
 * WXML 按块类型（banner/chat/rows/opts/cta/...）渲染，天然保留 HiFi 的
 * 文案顺序与交互层级。纯函数，仅依赖 SimState 与 calc 工具，便于单测。
 * 文案逐条移植自 docs/design/购房模拟器-hifi.html（PRD §7 沉浸式第一人称）。
 *
 * ⚠️ 单文件 >500 行说明：本模块是 23 屏 → SceneBlock 的单一分发器（switch），
 * 场景文案与布局高度交织、按流程顺序排列，拆散会破坏评审与逐屏对照；其余逻辑
 * （配置/计算/页面状态）已分别拆入 constants.ts、calc.ts、index.ts。
 */

import {
  buildQA,
  fmt,
  fmtY,
  fmtYuan,
  judgeQA,
  nego2Options,
  NEGO_R1,
  pct,
  pmt,
  QA_DEFS,
} from "./calc";
import {
  downRateFor,
  HOUSES,
  INCOME,
  LOAN_TYPES,
  NODES,
  ROLES,
  SimState,
} from "./constants";

/** 对话气泡. */
export interface ChatItem {
  who: string;
  /** 头像字符（who 首字）. */
  whoChar: string;
  text: string;
  me?: boolean;
}

/** 账单行. */
export interface RowItem {
  k: string;
  v: string;
  total?: boolean;
}

/** KPI 卡. */
export interface KpiItem {
  label: string;
  value: string;
  unit: string;
}

/** 大按钮选项. */
export interface OptItem {
  action: string;
  title: string;
  desc?: string;
  marker?: string;
  /** 已用渠道的置灰占位（标题即占位文案，渲染为不可点卡片）. */
  disabled?: boolean;
}

/** 房源卡. */
export interface HouseCardItem {
  id: string;
  emoji: string;
  thumbCls: string;
  tag: string;
  tagCls: string;
  name: string;
  ringTag: string;
  meta: string;
  price: string;
  cut: string;
}

/**
 * 场景内容块（有序），WXML 按 t 分发渲染.
 * 块类型覆盖全部 22 屏的不同布局：页眉/对话/横幅/账单行/KPI/成交卡/房源卡/
 * 选项/提示条/表单(现金·自定义·年限)/CTA/链接/打卡/电子证照.
 */
export type SceneBlock =
  | { t: "eyebrow"; text: string }
  | { t: "title"; text: string; hero?: string; big?: boolean }
  | { t: "sub"; text: string }
  | { t: "dots"; items: { on: boolean }[] }
  | { t: "chat"; items: ChatItem[] }
  | { t: "banner"; cls: "warm" | "sky"; title?: string; desc?: string; large?: boolean }
  | { t: "rows"; items: RowItem[] }
  | { t: "kpis"; items: KpiItem[] }
  | {
      t: "deal";
      origText: string;
      deal: string;
      chips: { text: string; cls: string }[];
    }
  | { t: "houses"; items: HouseCardItem[] }
  | { t: "opts"; items: OptItem[] }
  | { t: "note"; bold?: string; text: string }
  | { t: "form-cash" }
  | { t: "form-custom" }
  | { t: "form-years"; items: { action: string; label: string; active: boolean }[] }
  | {
      t: "downSteps";
      items: { action: string; label: string; amount: string; active: boolean }[];
      min: string;
    }
  | { t: "cta"; items: { action: string; title: string; cls: string }[] }
  | { t: "link"; action: string; text: string }
  | { t: "check"; items: string[] }
  | { t: "deed"; name: string; area: string };

/** 构建当前场景内容块（每次 setData 全量重建）. */
export function buildScene(S: SimState): SceneBlock[] {
  switch (S.scene) {
    case "start":
      return [
        { t: "eyebrow", text: "沉浸式流程模拟 · 10 分钟" },
        { t: "title", text: "在上海，\n买下第一套房", big: true },
        { t: "sub", text: "从选房到交房，以第一人称走完全流程：身份、选房、资格、砍价、算钱、借款、贷款、过户。每一步都算给你看。" },
        {
          t: "banner",
          cls: "sky",
          title: "你会遇到",
          desc: "身份角色（刚需 / 置换 / 投资）· 可动用现金预设 · 限购问答树 · 多轮砍价博弈与「到手价」暗坑 · 自定义房源 · 贷款方式选择（商贷/组合/公积金）· 资金缺口与红线借款 · 组合贷月供 · 资金监管到领证放款",
        },
        { t: "note", text: "演示数据 · 计算结果仅供参考，以政府部门、银行、税务机关为准。本模拟不收集任何个人信息。" },
        { t: "cta", items: [{ action: "role", title: "开始模拟", cls: "btn-ink" }] },
      ];

    case "role": {
      const opts = (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => {
        const r = ROLES[k];
        return {
          action: "role:" + k,
          title: r.emoji + " " + r.name,
          desc: r.desc,
          marker: r.owned === 0 ? "首套" : k === "invest" ? "二套" : "置换",
        };
      });
      return [
        { t: "eyebrow", text: "第一步 · 你的身份" },
        { t: "title", text: "你为什么买房？" },
        { t: "sub", text: "身份决定贷款利率、名下套数与税费口径；首付比例在选定贷款方式后确定（商贷最低 15%）。先定身份，再挑房子。" },
        { t: "opts", items: opts },
        { t: "note", bold: "提示：", text: "置换（卖一买一）按首套首付与利率，且一年内卖房再买房个税可退；投资二套首付与利率上浮（二套公积金 3.075% / 商贷 3.06%），且可能触发房产税（上海试点）。" },
      ];
    }

    case "cash": {
      const presets: [number, string, string][] = [
        [50, "50 万", "刚工作不久，积蓄不多——选房按“够得着”来。"],
        [70, "70 万", "不上不下，最常见的状态。"],
        [100, "100 万", "有备而来，从容一点。"],
        [200, "200 万", "准备充分，可覆盖换房周期。"],
        [300, "300 万", "资金雄厚，几乎不为首付发愁。"],
      ];
      const opts = presets.map((p) => {
        const sel = S.cashSet && S.cash === p[0] * 10000;
        return {
          action: "cash:p" + p[0],
          title: p[1],
          desc: p[2],
          marker: sel ? "已选" : p[0] + "万",
        };
      });
      return [
        { t: "title", text: "你能拿出多少现金？" },
        { t: "sub", text: "首付 = 房款首付 + 全部交易税费，都要从你手头这沓现金里出。先亮家底，后面才不会到算账时傻眼。" },
        { t: "opts", items: opts },
        { t: "form-cash" },
        { t: "note", bold: "为什么先问现金：", text: "同样一套房，手头 50 万和 300 万，面临的方案天差地别——这道题决定你后面要不要借钱、借多少。" },
      ];
    }

    case "custom":
      return [
        { t: "title", text: "自定义一套房源" },
        { t: "sub", text: "预设房源不够贴身？把自己的预算和税费条件填进去，后面照常核验资格、砍价。" },
        { t: "form-custom" },
        { t: "note", bold: "说明：", text: "议价空间（房东可让幅度）按默认 5% 计；面积 ≤140㎡ 契税 1%，否则首套 1.5% / 二套 2%。填完即可模拟，全程不落库。" },
        { t: "cta", items: [{ action: "custOk", title: "确认这套 · 去核验资格", cls: "btn-ink" }] },
      ];

    case "select": {
      const hh: HouseCardItem[] = HOUSES.map((h) => {
        const downEst = fmt(h.price * downRateFor(S.role!.k, h.ring, S.loanType));
        return {
          id: h.id,
          emoji: h.emoji,
          thumbCls: h.thumbCls,
          tag: h.tag,
          tagCls: h.tagCls,
          name: h.name,
          ringTag: h.ring === "内" ? "外环内" : "外环外",
          meta: h.area + " · " + h.type + " · 首付约 " + downEst + " 万 · 卖家 " + h.seller,
          price: fmt(h.price) + "万",
          cut: "可砍 " + (h.negotiable * 100).toFixed(0) + "%",
        };
      });
      hh.push({
        id: "custom",
        emoji: "✏️",
        thumbCls: "thumb-c",
        tag: "自由填写",
        tagCls: "badge-hair",
        name: "自定义房源",
        ringTag: "",
        meta: "挂牌价 / 面积 / 环线 / 税费条件全由你定——用你自己的房价和年限。",
        price: "✨ 造一套自己的房子",
        cut: "",
      });
      return [
        {
          t: "chat",
          items: [
            bubble("中介 小王", "钥匙在手，几个盘随便挑：200 万到 1600 万都有。先看哪套？税费和议价空间差挺多的——满五唯一、满二不唯一、还有一套不满 2 年要缴全额增值税。也可以说个数，我给你现造一套。"),
          ],
        },
        {
          t: "note",
          bold: "身份：",
          text: S.role!.emoji + " " + S.role!.name + " · 现金 " + fmt(S.cash) + " 万 · 首付约 " + (S.downRate * 100).toFixed(0) + "%（默认" + LOAN_TYPES[S.loanType].name + "估算，选房后可调）",
        },
        { t: "houses", items: hh },
      ];
    }

    case "qa": {
      const steps = buildQA(S);
      const cur = steps[S.qaProg];
      const d = QA_DEFS[cur];
      const opts = d.opts.map((o) => ({ action: "qa:" + cur + ":" + o[0], title: o[1] }));
      const blocks: SceneBlock[] = [
        { t: "dots", items: steps.map((_, i) => ({ on: i <= S.qaProg })) },
        { t: "title", text: d.q },
        { t: "sub", text: "答案只用于本机判定，不会上传或收集。" },
        { t: "opts", items: opts },
      ];
      if (S.qaProg > 0) {
        blocks.push({ t: "link", action: "qaBack", text: "‹ 上一步" });
      }
      return blocks;
    }

    case "blocked": {
      const j = S.judge!;
      return [
        { t: "banner", cls: "warm", title: (j.ok ? "✓ " : "✕ ") + j.title, desc: j.reason },
        {
          t: "cta",
          items: [
            { action: "select", title: "换一套试试", cls: "btn-out" },
            { action: "start", title: "放弃模拟", cls: "btn-ink" },
          ],
        },
      ];
    }

    case "nego1": {
      const h = S.house!;
      return [
        { t: "banner", cls: "warm", title: "在谈 · " + h.name, desc: "挂牌价 " + fmt(h.price) + " 万\n" + h.intro },
        {
          t: "chat",
          items: [bubble("中介 小王", "这套房诚意挂价 " + fmt(h.price) + " 万，" + h.seller + "那边我熟，好好谈有空间。你的心理价多少？")],
        },
        {
          t: "opts",
          items: [
            { action: "n1:hard", title: "直接还价", desc: "第一天就摆底线：-6%，能行就签。", marker: "-6%" },
            { action: "n1:soft", title: "试探出价 -3%", desc: "礼貌试探：挂牌价虚高，砍一点意思意思。", marker: "-3%" },
            { action: "n1:chat", title: "先聊聊，为什么卖？", desc: "不问价，先听故事——急售的人往往最好谈。" },
          ],
        },
        {
          t: "note",
          bold: "谈判口径：",
          text: "房东的底线约在挂牌价下方 " + (h.negotiable * 100).toFixed(0) + "% 附近。第一轮报价就冲破底线，房东会直接甩脸拒绝——后面只能往回找补。",
        },
      ];
    }

    case "nego2": {
      const r = nego2Options(S);
      const over = r.over;
      const h = S.house!;
      const baseChip = NEGO_R1[S.negoR1 as "hard" | "soft" | "chat"].chip;
      const score = (
        { hard: "第一轮你直接还了 -6%", soft: "第一轮你试探了 -3%", chat: "第一轮你们聊得不错" } as Record<string, string>
      )[S.negoR1 as string];
      let sellerLine: string;
      if (over) {
        sellerLine =
          baseChip > 0
            ? "低于 " + pct(baseChip) + "？这个价我做不了，真做不了。你要诚心想买，就再给我一个够得着的价。"
            : "价还没谈，你上来就压这么狠，这单没法聊。";
      } else {
        sellerLine = (
          {
            hard: "小伙子上来就砍 6%？你要真喜欢，我再看看能让多少，但你也别太狠。",
            soft: "-3% 不太够意思，除非……你再有点诚意？",
            chat: "你懂我的难处。这样吧，你要真喜欢，我再给你个实在价。",
          } as Record<string, string>
        )[S.negoR1 as string];
      }
      const opts = r.opts.map((o) => ({
        action: "n2:" + o.key,
        title: o.label,
        desc: o.d,
        marker: (o.chip * 100).toFixed(1).replace(/\.0$/, "") + "%",
      }));
      return [
        {
          t: "chat",
          items: [
            bubble("中介 小王", score + "。" + (over ? "价位过了头，" + h.seller + "这边很抵触。" : "对方在犹豫。") + "第二轮你打算怎么出？"),
            bubble(h.seller + "（房东）", sellerLine),
          ],
        },
        { t: "opts", items: opts },
        {
          t: "note",
          text: "房东可接受底线约在挂牌价下方 " + (h.negotiable * 100).toFixed(0) + "% 附近；报价高出不超过这个数才有得谈，超了会被叫停。",
        },
      ];
    }

    case "nego3": {
      const h = S.house!;
      const cut = h.price - S.deal;
      const off = cut / h.price;
      const blocks: SceneBlock[] = [
        {
          t: "chat",
          items: [
            bubble(h.seller + "（房东）", S.negoCap ? "这个价我真做不了，你给个准话。" : "行吧，" + fmt(S.deal) + " 万，说定。我这个人最讲信用。"),
            bubble("中介 小王", "成了！" + fmt(S.deal) + " 万成交，比挂牌省了 " + fmt(cut) + " 万。我帮你们走后续流程。"),
          ],
        },
        {
          t: "deal",
          origText: "成交价（原挂牌 " + fmtY(h.price) + "）",
          deal: fmtY(S.deal),
          chips: [
            { text: "砍下 " + fmt(cut) + " 万 · " + (off * 100).toFixed(1) + "%", cls: "badge-warm" },
            { text: (1 - off).toFixed(2) + " 折", cls: "badge-hair" },
          ],
        },
      ];
      if (S.negoCap) {
        /* 叫停：房东已亮明底线，只剩 接受底价 / 换房，不再有任何“加价”空间 */
        blocks.push({
          t: "banner",
          cls: "warm",
          title: "卖家叫停",
          desc: "超过我的底线了，最多让到 " + fmt(S.deal) + " 万，一句顶八句。",
        });
        blocks.push({
          t: "opts",
          items: [
            { action: "negoAccept", title: "接受底价 " + fmt(S.deal) + " 万", desc: "不再拉扯，按房东底线成交，后面流程照走。", marker: "成交" },
            { action: "negoQuit", title: "谈崩了，换一套", desc: "不勉强，回选房重新挑。" },
          ],
        });
      } else {
        /* —— 成交后的「到手价」暗坑 —— 仅当房源有卖方税费（非满五唯一/非新房）时出现 */
        const canTransfer = S.vat > 0 || S.sellerTax > 0;
        if (canTransfer) {
          const taxParts =
            (S.vat ? "增值税 " + fmt(S.vat) + " 万" + (S.vatAdd ? "+" + fmt(S.vatAdd) + " 万" : "") : "") +
            (S.sellerTax ? (S.vat ? "、" : "") + "个税 " + fmt(S.sellerTax) + " 万" : "");
          blocks.push(
            {
              t: "banner",
              cls: "warm",
              title: "房东补一句：这价是「到手价」",
              desc: "「我也不看挂牌价了，" + fmt(S.deal) + " 万到手，税你那边包一下。」听起来就是随口一句对吧？要不要应？",
            },
            {
              t: "opts",
              items: [
                {
                  action: "n3NetYes",
                  title: "行，就按到手价来",
                  desc: "看着省事。但卖方税费（" + taxParts + "）也会转嫁到你头上。",
                  marker: "成交",
                },
                { action: "n3NetAsk", title: "等下，到手价是啥意思？", desc: "把话说透再决定——你不知道这笔钱给谁。", marker: "先问清" },
                { action: "n3NetNo", title: "我不同意到手价，按含税价", desc: "卖方税费让房东自担，替自己省下十几万。", marker: "含税" },
              ],
            },
          );
        } else {
          blocks.push({ t: "cta", items: [{ action: "negoOk", title: "确认成交，进入算账", cls: "btn-ink" }] });
        }
      }
      return blocks;
    }

    case "feeNego": {
      const deal = S.deal;
      return [
        { t: "title", text: "中介费 · 再谈一档" },
        {
          t: "chat",
          items: [bubble("中介 小王", "房子谈妥了。中介费按行业惯例 2%：带看、谈判、网签、过户、放款一条龙，全包。")],
        },
        {
          t: "rows",
          items: [
            { k: "成交价", v: fmtY(deal) },
            { k: "中介费 2%", v: fmtY(deal * 0.02) },
          ],
        },
        {
          t: "opts",
          items: [
            { action: "fee2", title: "按 2% 给，省心", desc: "服务全包，图个顺当。", marker: "-" + fmt(deal * 0.02) + "万" },
            { action: "fee1", title: "聊聊，压到 1%", desc: "“都是老朋友了”——小王松口。", marker: "-" + fmt(deal * 0.01) + "万" },
          ],
        },
        {
          t: "note",
          bold: "行情：",
          text: "上海中介费 1%–2% 都有，1% 足够覆盖主流服务。多问几家、敢于开口，省下的就是软装钱。中介费是服务费，与税费分开算。",
        },
      ];
    }

    case "loanType": {
      const h = S.house!;
      const isInv = S.role!.k === "invest";
      const ringTag = h.ring === "内" ? "外环内" : "外环外（特殊区域口径）";
      const dr = (lt: "comm" | "combo" | "gjj") => (downRateFor(S.role!.k, h.ring, lt) * 100).toFixed(0) + "%";
      const downEst = (lt: "comm" | "combo" | "gjj") =>
        fmt(S.deal * downRateFor(S.role!.k, h.ring, lt)) + " 万";
      /* 首付档位：最低（联动贷款方式）+ 可在最低之上多付，100% = 全款不贷款 */
      const minRate = downRateFor(S.role!.k, h.ring, S.loanType);
      const steps: { action: string; label: string; amount: string; active: boolean }[] = [
        { action: "ds:0", label: "最低 " + (minRate * 100).toFixed(0) + "%", amount: fmt(S.deal * minRate) + " 万", active: S.downSel === 0 },
        { action: "ds:0.3", label: "30%", amount: fmt(S.deal * 0.3) + " 万", active: S.downSel === 0.3 },
        { action: "ds:0.5", label: "50%", amount: fmt(S.deal * 0.5) + " 万", active: S.downSel === 0.5 },
        { action: "ds:1", label: "全款 100%", amount: fmt(S.deal) + " 万", active: S.downSel === 1 },
      ];
      return [
        { t: "title", text: "贷款方式 · 先定门槛" },
        {
          t: "chat",
          items: [
            bubble("信贷经理 高经理", "房子定了，先选贷款方式——首付比例、利率都不一样。" + ringTag + (isInv ? "、二套" : "、首套") + "，多数家庭用组合贷。首付也可以在最底线之上多付，手头宽裕甚至可以不贷款。"),
          ],
        },
        {
          t: "rows",
          items: [
            { k: "成交价", v: fmtY(S.deal) },
            { k: "当前首付（" + (S.downRate >= 1 ? "全款" : LOAN_TYPES[S.loanType].name) + "）", v: fmtY(S.down) + "（含定金 " + fmt(S.deposit) + " 万）" },
          ],
        },
        {
          t: "opts",
          items: [
            { action: "lt:comm", title: "纯商贷", desc: "最低首付 " + dr("comm") + " · 商贷 " + pct(S.role!.commRate) + "（" + (isInv ? "二套" : "首套") + "利率）", marker: "最低 " + downEst("comm") },
            { action: "lt:combo", title: "组合贷（默认）", desc: "最低首付 " + dr("combo") + " · 公积金 " + pct(S.role!.gjjRate) + " + 商贷 " + pct(S.role!.commRate), marker: "最低 " + downEst("combo") },
            { action: "lt:gjj", title: "纯公积金", desc: "最低首付 " + dr("gjj") + " · 公积金 " + pct(S.role!.gjjRate) + " · 额度上限 80 万（演示）", marker: "最低 " + downEst("gjj") },
          ],
        },
        {
          t: "downSteps",
          min: "最低 " + (minRate * 100).toFixed(0) + "%",
          items: steps,
        },
        {
          t: "note",
          bold: "首付怎么定：",
          text: "比例可在最低之上多加（首付越高贷款越少）；选「全款 100%」则无需向银行申请贷款，流程直接跳过贷款审批。贷款利率按套数口径：首套商贷 " + pct(S.role!.commRate) + " / 公积金 " + pct(S.role!.gjjRate) + "；二套上浮（公积金 3.075% / 商贷 3.06%）。",
        },
        { t: "cta", items: [{ action: "ltOk", title: "选好了，去算账", cls: "btn-ink" }] },
      ];
    }

    case "funds": {
      const gap = Math.max(0, S.need - S.cash);
      const isInv = S.role!.k === "invest";
      const deedTag = "契税（" + (S.areaNum <= 140 ? (isInv ? "二套 1%" : "首套 1%") : isInv ? "二套 2%" : "首套 1.5%") + "）";
      const rows: RowItem[] = [
        { k: "成交价", v: fmtY(S.deal) },
        {
          k: S.downRate >= 1
            ? "首付（房款 100% · 全款现金支付，含定金 " + fmt(S.deposit) + " 万）"
            : "首付（房款 " + (S.downRate * 100).toFixed(0) + "% · " + LOAN_TYPES[S.loanType].name + "，含定金 " + fmt(S.deposit) + " 万）",
          v: fmtY(S.down),
        },
        { k: deedTag, v: fmtY(S.deedTax) },
        { k: "登记费（不动产登记费）", v: "¥80.00" },
        { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
      ];
      if (S.netTax) {
        rows.push({ k: "卖方税费转嫁（你已答应「到手价」）", v: fmtY(S.netTax) });
      }
      if (S.gjjTopUp) {
        rows.push({ k: "公积金额度补足（已并入首付）", v: fmtY(S.gjjTopUp) });
      }
      if (S.estateTax) {
        rows.push({ k: "房产税（投资二套 · 按年，不计入一次性）", v: fmt(S.estateTax) + " 万/年" });
      }
      rows.push({ k: "首付需现金（含全部交易税费）", v: fmtY(S.need), total: true });

      const status: SceneBlock =
        gap > 0
          ? {
              t: "banner",
              cls: "warm",
              title: "还差 " + fmt(gap) + " 万",
              desc: "你手头有 " + fmt(S.cash) + " 万存款，不够覆盖「房款首付 + 交易税费" + (S.netTax ? " + 到手价转嫁" : "") + "」。",
            }
          : {
              t: "banner",
              cls: "sky",
              title: "✓ 资金充足",
              desc: "手头 " + fmt(S.cash) + " 万，扣除首付税费后结余 " + fmt(S.cash - S.need) + " 万，可继续签约。",
            };
      const blocks: SceneBlock[] = [
        { t: "title", text: "这笔账，先算清楚" },
        { t: "sub", text: S.house!.name + " · 以 " + fmt(S.deal) + " 万成交价估算 · " + LOAN_TYPES[S.loanType].name + "。首付口径已含买方全部交易税费，中介费与税费分开单列。" },
        { t: "rows", items: rows },
        status,
      ];
      if (S.netTax) {
        blocks.push({
          t: "banner",
          cls: "warm",
          title: "⚠️ 你现在才看到这笔钱",
          desc: "砍价成交时你随口应了「" + fmt(S.deal) + " 万到手」——卖方增值税/个税约 " + fmt(S.netTax) + " 万由此转嫁给你，已经算进上面「需现金」里了。当时要是按含税价谈，这一行根本不会出现。",
        });
      }
      if (S.vat) {
        blocks.push({
          t: "note",
          bold: "卖方税费提示：",
          text:
            "本房卖方另需缴增值税约 " + fmt(S.vat) + " 万 + 附加约 " + fmt(S.vatAdd) + " 万" +
            (S.sellerTax ? "、个税约 " + fmt(S.sellerTax) + " 万" : "") +
            "。按上海惯例由卖方承担，不在你现金中列支——" +
            (S.netTax ? "除非你刚才答应了「到手价」（见上方警示行）。" : "除非你在砍价时答应他「到手价」。这一行，别让它在合同里复活。"),
        });
      }
      const footNote: SceneBlock =
        S.downRate >= 1
          ? { t: "note", text: "已选全款：全部房款以现金结清，无银行贷款环节，后续直接进入签约 → 资金监管 → 过户领证。" }
          : { t: "note", text: "定金含在首付内，签约时先付、过户时冲抵；贷款部分由银行后端解决，不算入“需要现金”。" };
      blocks.push(
        { t: "cta", items: [{ action: gap > 0 ? "borrow" : "sign", title: gap > 0 ? "先筹钱，再签约" : "资金充足，去签约", cls: "btn-ink" }] },
        footNote,
      );
      return blocks;
    }

    case "borrow": {
      const gap = Math.max(0, S.need - S.cash);
      const cap = 300000 + 200000 + 200000; /* 亲友 + 公积金提取 + 信用贷 合计上限（演示） */
      const room = cap - S.borrowed;
      const opts: OptItem[] = [];
      if ("family" in S.usedBorrow) {
        opts.push({ action: "bor:family", title: "已向亲友借入，缺口 " + (gap > 0 ? "仍差 " + fmt(gap) + " 万" : "已补齐"), disabled: true });
      } else {
        opts.push({ action: "bor:family", title: "向亲友借款（最多 30 万）", desc: "视缺口借入，无利息压力，人情慢慢还。", marker: "+30万内" });
      }
      if ("gjj" in S.usedBorrow) {
        opts.push({ action: "bor:gjj", title: "已按演示提取公积金", disabled: true });
      } else {
        opts.push({ action: "bor:gjj", title: "提取公积金（演示，最多 20 万）", desc: "二手房通常不能直接提取付首付，需先自筹；此处仅作额度演示。", marker: "压力 +15" });
      }
      if ("credit" in S.usedBorrow) {
        opts.push({ action: "bor:credit", title: "已申请信用贷", disabled: true });
      } else {
        opts.push({ action: "bor:credit", title: "信用贷 / 消费贷（最多 20 万）", desc: "门槛低、放款快，但资金用途属于监管红线。", marker: "⚠️ 红线" });
      }
      opts.push({ action: "select", title: "换套便宜点的", desc: "回到选房，重新挑一套总价更低的。" });

      const still: SceneBlock =
        gap > 0
          ? {
              t: "banner",
              cls: "warm",
              title: "仍有缺口 " + fmt(gap) + " 万",
              desc:
                gap > room
                  ? "三条借款渠道合计最多约 " + fmt(cap) + " 万，缺口已超出可借上限。继续硬撑不现实，建议换一套总价更低的房源。"
                  : "还可通过下方渠道再借约 " + fmt(room) + " 万。",
            }
          : { t: "banner", cls: "sky", title: "✓ 缺口已补齐" };

      const blocks: SceneBlock[] = [
        { t: "title", text: "怎么补上这笔钱？" },
        { t: "sub", text: "手头 " + fmt(S.cash) + " 万，缺口 " + fmt(gap) + " 万。不同来路的钱，代价完全不同。" },
        { t: "opts", items: opts },
        still,
      ];
      if (gap <= 0) {
        blocks.push({ t: "cta", items: [{ action: "sign", title: "签约 · 付定金", cls: "btn-ink" }] });
      } else if (gap > room) {
        blocks.push({ t: "cta", items: [{ action: "select", title: "缺口过大 · 换套便宜点的", cls: "btn-ink" }] });
      } else {
        blocks.push({ t: "note", text: "还需 " + fmt(gap) + " 万 · 用上方渠道补足后再签约" });
      }
      blocks.push({
        t: "note",
        bold: "红线提示：",
        text: "上海银保监局严禁信贷资金流入房地产。信用贷购房可能被银行拒贷、影响征信，本模拟仅用于风险教育，绝不构成建议。",
      });
      return blocks;
    }

    case "sign": {
      /* ① 居间协议（中介/买方/卖方三方）→ 签后即付定金；此时违约定金罚则锁定 */
      const h = S.house!;
      const blocks: SceneBlock[] = [
        { t: "title", text: "签约 · 居间协议" },
        { t: "sub", text: h.name + " · 卖方 " + h.seller + " · 成交价 " + fmt(S.deal) + " 万" + (S.netTax ? "（到手价）" : "") },
        {
          t: "banner",
          cls: "sky",
          title: "📄 房地产买卖居间协议",
          desc: "三方签署：中介公司（居间方）/ 你（买方）/ " + h.seller + "（卖方）· 中介费 " + pct(S.agentRate) + "（" + fmtY(S.agentFee) + "）已言明 · 协议签定即付定金",
        },
      ];
      const rows: RowItem[] = [
        { k: "成交价", v: fmtY(S.deal) },
        { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
        { k: "定金（5%）", v: fmtY(S.deposit) },
        { k: "买方现金（现有）", v: fmtY(S.cash) },
        { k: "签约后余额", v: fmtY(S.cash - S.deposit) },
      ];
      blocks.push(
        { t: "rows", items: rows },
        {
          t: "banner",
          cls: "warm",
          title: "⚠️ 定金罚则 · 此刻已锁定",
          desc: "定金 " + fmtY(S.deposit) + "（成交价 5%，不超合同价 20%）。一旦签字付定：买方违约，定金不予退还；卖方违约，双倍返还（" + fmtY(S.deposit * 2) + "）。这笔钱不是押金，是合同约束。",
        },
        { t: "cta", items: [{ action: "signOk", title: "确认签署居间协议 · 付定金 " + fmt(S.deposit) + " 万", cls: "btn-ink" }] },
      );
      return blocks;
    }

    case "signNet": {
      /* ② 网签合同（上海市房地产买卖合同）→ 签约后违约赔付房价 20%，不再是定金的事 */
      const h = S.house!;
      const liquidated = S.deal * 0.2;
      const blocks: SceneBlock[] = [
        { t: "title", text: "网签 · 上海市房地产买卖合同" },
        { t: "sub", text: h.name + " · 卖方 " + h.seller + " · 合同价 " + fmt(S.deal) + " 万" + (S.netTax ? "（到手价）" : "") },
        {
          t: "banner",
          cls: "warm",
          title: "⚠️ 违约责任：房价 20%",
          desc: "网签备案后合同生效：买方违约，按房价 20%（" + fmtY(liquidated) + "）赔付违约金——已经不再是「定金没了」那么简单，悔约代价由此放大。",
        },
        {
          t: "banner",
          cls: "sky",
          title: "📄 上海市房地产买卖合同 · 网签备案",
          desc: "合同价锁定（" + fmtY(S.deal) + "），经「一网通办」完成 · 反悔属违约",
        },
      ];
      if (S.netTax) {
        blocks.push({
          t: "banner",
          cls: "warm",
          title: "⚠️ 合同第 1 条：成交价 = 卖方到手价",
          desc: "合同价格条款写明「" + fmt(S.deal) + " 万为卖方到手价，相关税费由买方承担」——卖方增值税/个税约 " + fmt(S.netTax) + " 万已锁定给你。现在反悔就是违约。网签前这是最后一次看清它。",
        });
      }
      const rows: RowItem[] = [
        { k: "成交价（合同价）", v: fmtY(S.deal) },
        { k: "违约责任（房价 20%）", v: fmtY(liquidated) },
        { k: "定金（已付）", v: fmtY(S.deposit) },
      ];
      const okRows: RowItem[] = [];
      if (S.netTax) {
        okRows.push({ k: "卖方税费（到手价转嫁）", v: fmtY(S.netTax) });
      }
      blocks.push(
        { t: "rows", items: okRows.concat(rows) },
        { t: "cta", items: [{ action: "signNetOk", title: "确认网签 · 完成备案", cls: "btn-ink" }] },
      );
      return blocks;
    }

    case "loan": {
      /* 全款（首付 100%）：无贷款、无银行审批，直接进资金监管 */
      if (S.downRate >= 1) {
        const h = S.house!;
        return [
          { t: "title", text: "已全款支付" },
          { t: "sub", text: h.name + " · " + fmt(S.deal) + " 万 全额现金支付 · 无需向银行申请贷款" },
          {
            t: "rows",
            items: [
              { k: "成交价", v: fmtY(S.deal) },
              { k: "定金（已付）", v: fmtY(S.deposit) },
              { k: "首付 + 尾款（全款）", v: fmtY(S.down), total: true },
            ],
          },
          { t: "banner", cls: "sky", large: true, title: "💰 全款 · 无贷款", desc: "全部房款以现金结清，跳过贷款申请与银行审批；直接进入资金监管环节。" },
          {
            t: "note",
            bold: "全款优势：",
            text: "无月供、无利息、无征信审批；只要现金充足，这一步就结束了贷款的烦恼。",
          },
          { t: "cta", items: [{ action: "loanOkAllCash", title: "确认全款 · 走资金监管", cls: "btn-ink" }] },
        ];
      }
      const L = S.loan;
      const y = S.loanYears;
      const gjjPct = pct(S.gjjRate);
      const commPct = pct(S.commRate);
      const rateLine =
        S.loanType === "comm"
          ? "商贷 " + commPct
          : S.loanType === "gjj"
            ? "公积金 " + gjjPct
            : "公积金 " + gjjPct + " + 商贷 " + commPct;
      const rows: RowItem[] = [];
      if (S.loanType === "comm") {
        rows.push({ k: "商贷（" + fmt(L.comm) + " 万 · " + commPct + "）", v: pmtY(L.comm, S.commRate, y) });
      } else if (S.loanType === "gjj") {
        rows.push({ k: "公积金（" + fmt(L.gjj) + " 万 · " + gjjPct + "）", v: pmtY(L.gjj, S.gjjRate, y) });
      } else {
        rows.push(
          { k: "公积金（" + fmt(L.gjj) + " 万 · " + gjjPct + "）", v: pmtY(L.gjj, S.gjjRate, y) },
          { k: "商贷（" + fmt(L.comm) + " 万 · " + commPct + "）", v: pmtY(L.comm, S.commRate, y) },
        );
      }
      rows.push(
        { k: "月供合计", v: fmtYuan(L.monthly) + " 元/月" },
        { k: "月供 / 家庭月收入", v: Math.round((L.monthly / INCOME) * 100) + "%（风控线 50%）" },
        { k: "总利息（" + y + " 年）", v: "¥" + fmt(L.totalInt) + "万" },
      );
      const blocks: SceneBlock[] = [
        { t: "title", text: "贷款方案" },
        {
          t: "sub",
          text: "贷款额 = 成交价 − 房款首付（" + fmt(S.deal - S.down) + " 万）· " + LOAN_TYPES[S.loanType].name + " · " + (S.role!.k === "invest" ? "二套利率" : "首套利率") + "（" + rateLine + "）· 等额本息。",
        },
        {
          t: "chat",
          items: [
            bubble("信贷经理 高经理", "材料收到。按你" + (S.role!.k === "invest" ? "（二套）" : "（" + S.role!.name + "）") + "的资质，" + rateLine + " 送审——月供别超过你们家庭月收入一半，不然风控过不了。"),
          ],
        },
        { t: "rows", items: rows },
      ];
      if (S.gjjTopUp) {
        blocks.push({ t: "note", bold: "公积金额度：", text: "本演示额度上限 80 万，不足部分 " + fmt(S.gjjTopUp) + " 万已并入首付（见算账页）。" });
      }
      blocks.push({
        t: "banner",
        cls: "warm",
        title: "🏦 贷款合同 · 向银行申请",
        desc: "且慢：贷款要由银行审批。需提供身份证 / 收入流水 / 征信授权 / 网签合同；月供超过家庭月收入一半会被拒批，利率可能上浮。审批通过、正式签约贷款合同前，一切只是申请，银行有权拒贷。",
      });
      blocks.push({
        t: "banner",
        cls: "sky",
        large: true,
        title: fmtYuan(L.monthly) + " 元 / 月",
        desc: "月供不宜超过家庭月收入一半（2026 参考口径）。贷款 ≥500 万且成数 ≥5 成或属风险类客户，利率可能上浮；送审后银行会复核。",
      });
      blocks.push(
        {
          t: "form-years",
          items: [10, 20, 30].map((v) => ({ action: "ly:" + v, label: v + "年", active: v === y })),
        },
        { t: "cta", items: [{ action: "loanOk", title: "方案 OK，送银行审批", cls: "btn-ink" }] },
      );
      return blocks;
    }

    case "loanChk": {
      const L = S.loan;
      const compLine =
        S.loanType === "comm"
          ? "商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate)
          : S.loanType === "gjj"
            ? "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate)
            : "公积金 " + fmt(L.gjj) + " 万 @" + pct(S.gjjRate) + " + 商贷 " + fmt(L.comm) + " 万 @" + pct(S.commRate);
      const ok = L.monthly <= INCOME * 0.5;
      if (ok) {
        return [
          { t: "title", text: "贷款审批 · 通过" },
          {
            t: "chat",
            items: [
              bubble("信贷经理 高经理", "流水和征信都核过了：月供 " + fmtYuan(L.monthly) + " 元，约占家庭月收入 " + Math.round((L.monthly / INCOME) * 100) + "%，在风控线（50%）以内。批贷函这就出。"),
            ],
          },
          {
            t: "banner",
            cls: "sky",
            title: "🏦 批贷函 · " + LOAN_TYPES[S.loanType].name + " · " + S.loanYears + " 年",
            desc: compLine + " · 等额本息 · 月供 " + fmtYuan(L.monthly) + " 元 / 月",
          },
          { t: "note", bold: "贷款材料：", text: "身份证 · 收入流水 · 征信授权 · 网签合同。真实审批需 7–15 个工作日，本演示已加速；审批通过后再签正式贷款合同，银行按约放款。" },
          { t: "cta", items: [{ action: "lcOk", title: "批贷通过，走资金监管", cls: "btn-ink" }] },
        ];
      }
      /* 超线：风控拦截 */
      const f = L.monthly / (S.deal - S.down);
      const needPay = Math.max(10000, Math.ceil((L.monthly - INCOME * 0.5) / f / 10000) * 10000);
      // 风控要求补充的首付按整万元向上计（银行惯例），非金额精度损失
      const yW = fmt(needPay);
      const avail = S.cash - (S.down - S.deposit) - S.taxes;
      const opts: OptItem[] = [];
      if (S.loanYears < 30) {
        opts.push({ action: "lcLong", title: "拉长还款到 30 年", desc: "月供立刻降档，但总利息更多。", marker: "→ 30年" });
      }
      const blocks: SceneBlock[] = [
        { t: "title", text: "贷款审批 · 风控拦截" },
        {
          t: "chat",
          items: [
            bubble("信贷经理 高经理", "月供 " + fmtYuan(L.monthly) + " 元，超过你们家庭月收入的一半（" + fmtYuan(INCOME * 0.5) + " 元）。按银行风控，要么降月供、要么加首付，否则批不了。"),
          ],
        },
        {
          t: "banner",
          cls: "warm",
          title: "⚠️ 月供占收入 " + Math.round((L.monthly / INCOME) * 100) + "%（风控线 50%）",
          desc: "当前方案 " + S.loanYears + " 年 · 月供 " + fmtYuan(L.monthly) + " 元。需调整后重新送审。",
        },
      ];
      if (avail >= needPay) {
        opts.push({ action: "lcPay", title: "追加首付 " + yW + " 万", desc: "把月供压回收入一半以内，现金够付。", marker: "-" + yW + "万" });
      } else {
        blocks.push({ t: "note", text: "追加首付需约 " + yW + " 万，当前现金不足——只能拉长年限或换房。" });
      }
      opts.push(
        { action: "lcStick", title: "坚持原方案硬上", desc: "银行直接拒批，徒增压力。", marker: "❌ 拒批" },
        { action: "lcChange", title: "换套便宜点的", desc: "回到选房，总价低、月供自然低。" },
      );
      blocks.push({ t: "opts", items: opts });
      return blocks;
    }

    case "escrow":
      return [
        { t: "title", text: "资金监管" },
        { t: "sub", text: "首付不直接打给卖家，先存入监管账户，领证后 1 个工作日划转。" },
        {
          t: "rows",
          items: [
            { k: "已付定金（签约时）", v: fmtY(S.deposit) },
            { k: "本次存入监管（冲抵定金后）", v: fmtY(S.down - S.deposit) },
            { k: "监管后现金余额", v: fmtY(S.cash - (S.down - S.deposit)) },
            { k: "监管状态", v: "「带押过户」已适用" },
          ],
        },
        { t: "banner", cls: "sky", title: "为什么放心？", desc: "上海已全面推行存量房交易资金监管；过户遇阻，监管资金原路退回，双方都踏实。" },
        { t: "cta", items: [{ action: "escrowOk", title: "首付已入监管，去过户", cls: "btn-ink" }] },
      ];

    case "transfer": {
      const isInv = S.role!.k === "invest";
      const h = S.house!;
      const deedTag = "契税（" + (S.areaNum <= 140 ? (isInv ? "二套 1%" : "首套 1%") : isInv ? "二套 2%" : "首套 1.5%") + "）";
      const taxTitle = h.hold === "new" ? "新房一手" : h.holdYears >= 5 ? (h.unique ? "满五唯一" : "满五不唯一") : h.holdYears >= 2 ? "满二不唯一" : "未满 2 年";
      let taxNote: string;
      if (h.hold === "new") {
        taxNote = "一手新房：增值税由开发商缴纳，买方仅承担契税、登记费；无卖方个税。";
      } else if (h.holdYears >= 5 && h.unique) {
        taxNote = "满五唯一：免增值税（满 2 年即免）、免卖方个税。";
      } else if (h.holdYears >= 2) {
        taxNote = (h.holdYears >= 5 ? "满五不唯一" : "满二不唯一") + "：满 2 年免增值税；卖方个税按核定 1% 计（不唯一）。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
      } else {
        taxNote = "未满 2 年：全额 5% 增值税 + 附加税费（城建/教育费附加/地方教育附加，约增值税 12% ≈ 0.6%）+ 卖方个税核定 1%。卖方税费若按「到手价」约定则已转嫁，签约时谈妥。";
      }
      const rows: RowItem[] = [
        { k: deedTag, v: fmtY(S.deedTax) },
        { k: "登记费（不动产登记费）", v: "¥80.00" },
      ];
      if (S.vat) {
        rows.push({ k: "增值税（卖方 · 未满 2 年全额 5%）", v: fmtY(S.vat) });
      }
      if (S.vatAdd) {
        rows.push({ k: "增值税附加（卖方）", v: fmtY(S.vatAdd) });
      }
      if (S.sellerTax) {
        rows.push({ k: "卖方个税（核定 1%）", v: fmtY(S.sellerTax) });
      }
      if (S.netTax) {
        rows.push({ k: "卖方税费实付（到手价转嫁 · 你承担）", v: fmtY(S.netTax) });
      }
      rows.push(
        { k: "中介费（" + pct(S.agentRate) + "）", v: fmtY(S.agentFee) },
        { k: "买方一次性税费（契税+登记+中介" + (S.netTax ? "+到手价转嫁" : "") + "）", v: fmtY(S.taxes + S.netTax), total: true },
        { k: "本次扣除后现金余额", v: fmtY(S.cash - S.taxes - S.netTax), total: true },
      );
      const blocks: SceneBlock[] = [
        { t: "title", text: "过户 · 缴税" },
        { t: "sub", text: "随申办 / 一网通办在线办结，最快当天出证。买方税费与卖方税费口径逐项单列。" },
        { t: "rows", items: rows },
      ];
      if (S.estateTax) {
        blocks.push({
          t: "banner",
          cls: "warm",
          title: "房产税（投资二套 · 上海试点）",
          desc: "按年约 " + fmt(S.estateTax) + " 万/年（成交价×70%×0.4%；单价高于上年度新建商品住房均价 2 倍按 0.6%），自持有年度起按年申报，不在此一次性扣除。",
        });
      }
      blocks.push(
        { t: "banner", cls: "warm", title: taxTitle, desc: taxNote },
        { t: "cta", items: [{ action: "trOk", title: "完成过户缴税", cls: "btn-ink" }] },
      );
      return blocks;
    }

    case "deed": {
      const allCash = S.downRate >= 1;
      const rows: RowItem[] = [
        /* 银行放款 = 贷款额（成交价 − 首付），定金已含在首付中，不再重复扣减；全款无此行 */
        ...(allCash ? [] : [{ k: "银行放款（尾款）" as const, v: fmtY(S.deal - S.down) }]),
        { k: "卖方累计收款", v: fmtY(S.deal) },
        { k: "你本次掏出的钱（含借款）", v: fmtY(S.down + S.taxes + S.netTax) },
      ];
      return [
        { t: "title", text: allCash ? "领证 · 全款结清" : "领证 · 放款" },
        { t: "sub", text: allCash ? "不动产登记办结，电子证照即时可查；房款已现金结清，无需银行放款。" : "不动产登记办结，电子证照即时可查；银行同步放款。" },
        {
          t: "chat",
          items: [
            bubble(
              "信贷经理 高经理",
              allCash
                ? "产证已出。你这单是全款，银行没有参与，尾款自然不用放——钥匙归你，手续清爽。"
                : "产证已出，我这边同步放款——尾款直接打到卖方，你不用再掏一分钱。",
            ),
          ],
        },
        { t: "deed", name: S.house!.name, area: S.house!.area },
        { t: "rows", items: rows },
        {
          t: "note",
          bold: allCash ? "全款说明：" : "别误会：",
          text: allCash
            ? "全款购房无银行贷款环节，卖方全程收到现金房款；税费交割后直接进入交房。"
            : "贷款买房的“尾款”是银行放款直接付给卖方，不需要你再掏一分钱。",
        },
        { t: "cta", items: [{ action: "deedOk", title: "交房，做交割检查", cls: "btn-ink" }] },
      ];
    }

    case "handover": {
      const hold = Math.round(S.deal * 0.01 * 100) / 100; /* 尾款扣押演示 1%，精确到分 */
      return [
        { t: "title", text: "交房 · 交割检查" },
        { t: "sub", text: "钥匙到手前还有三件事：户口迁出、物业交割、水电煤过户。" },
        {
          t: "chat",
          items: [bubble("中介 小王", "产证、放款都齐了。交房前我把交割清单过一遍，别让前任留坑。")],
        },
        {
          t: "rows",
          items: [
            { k: "水电煤 / 宽带 / 物业费", v: "待核验" },
            { k: "户口迁出（学区、落户）", v: S.holdback ? "未迁出 ⚠️" : "待核验" },
            { k: "钥匙 / 门禁 / 家具清单", v: "待移交" },
            { k: "专项维修资金", v: "随房移交" },
          ],
        },
        {
          t: "opts",
          items: [
            { action: "hoOk", title: "逐项核对，全部结清", desc: "水电煤物业当场过户，痛快收房。", marker: "🔑 交房" },
            { action: "hoHold", title: "发现物业欠费 / 户口未迁", desc: "与卖家协商：尾款扣押 " + fmt(hold) + " 万，迁出结清后再付。", marker: "尾款扣押" },
          ],
        },
        {
          t: "note",
          bold: "上海惯例：",
          text: "户口未迁出是交房高频纠纷（影响学区/落户）。买卖双方常约定「尾款（户口保证金）」扣押，迁出后结清，一般不超过合同价 5%。",
        },
      ];
    }

    case "final": {
      const h = S.house!;
      const L = S.loan;
      const pay = S.down + S.taxes + S.netTax; /* 首付口径 = 房款首付 + 全部交易税费（含中介）+ 到手价转嫁 */
      const tip =
        S.role!.k === "first"
          ? "在上海，你有了自己的家。首付付得清爽，月供在计划内——这第一套，稳了。"
          : S.role!.k === "trade"
            ? "卖一买一升级完成。记住：一年内卖房再买房的个税可以退，收好契税票去办。"
            : "资产落袋。投资二套按年缴房产税约 " + fmt(S.estateTax) + " 万，先算清租金与增值，再谈收益。";
      const borrowText =
        S.borrowed > 0
          ? "你向" + (S.usedBorrow.family ? "亲友" : "") + (S.usedBorrow.gjj ? "公积金" : "") + (S.usedBorrow.credit ? "信用贷" : "") +
            "周转了 " + fmt(S.borrowed) + " 万，已计入首付——这笔钱记得还。" + tip
          : tip;
      const blocks: SceneBlock[] = [
        { t: "title", text: "交房了", hero: "🎉" },
        { t: "sub", text: h.name + " · " + h.area + " · " + fmt(S.deal) + " 万 成交 · 钥匙到手" },
        { t: "banner", cls: "warm", title: "首付落地 · 月供从容" },
        {
          t: "kpis",
          items: [
            { label: "首付（含全部交易税费）", value: fmt(pay), unit: "万" },
            { label: "月供（" + S.loanYears + " 年等额本息）", value: fmtYuan(L.monthly), unit: "元/月" },
          ],
        },
        {
          t: "rows",
          items: [
            { k: "成交价（参考）", v: fmtY(S.deal) },
            { k: "房款首付（" + (S.downRate * 100).toFixed(0) + "% · " + LOAN_TYPES[S.loanType].name + "）", v: fmtY(S.down) },
            { k: "交易税费（契税 + 登记费 + 中介费" + (S.netTax ? " + 到手价转嫁" : "") + "）", v: fmtY(S.taxes + S.netTax) },
            { k: "贷款月供（" + loanRowLabel(S) + "）", v: fmtYuan(L.monthly) + "元/月" },
            { k: "手头余额", v: fmtY(S.cash), total: true },
          ],
        },
      ];
      if (S.netTax) {
        blocks.push({
          t: "banner",
          cls: "warm",
          title: "学费：" + fmt(S.netTax) + " 万的「到手价」",
          desc: "那一刻的「行，就按到手价来」，最后落地成实打实的 " + fmt(S.netTax) + " 万。下次谈价，先问一句「含税还是到手」。",
        });
      }
      blocks.push(
        { t: "banner", cls: "sky", desc: borrowText },
        ...(S.holdback
          ? [
              {
                t: "banner" as const,
                cls: "warm" as const,
                title: "尾款扣押 ¥" + fmt(S.holdback) + " 万",
                desc: "等卖方户口迁出 / 物业结清后支付，记得跟进，别拖成烂账。",
              },
            ]
          : []),
        { t: "check", items: NODES.map((n) => "✓ " + n.t) },
        { t: "note", text: "模拟结果仅供参考 · 以官方口径为准" },
        { t: "cta", items: [{ action: "start", title: "重新模拟", cls: "btn-ink" }] },
      );
      return blocks;
    }

    default:
      return [];
  }
}

/** 对话气泡构造. */
function bubble(who: string, text: string): ChatItem {
  return { who, whoChar: who.charAt(0), text };
}

/** 贷款月供标签（最终账单行）. */
function loanRowLabel(S: SimState): string {
  if (S.loanType === "comm") {
    return "商贷 " + fmt(S.loan.comm) + " 万";
  }
  if (S.loanType === "gjj") {
    return "公积金 " + fmt(S.loan.gjj) + " 万";
  }
  return "公积金 " + fmt(S.loan.gjj) + " + 商贷 " + fmt(S.loan.comm);
}

/** 月供展示（元/月）. */
function pmtY(P: number, annual: number, years: number): string {
  return "¥" + fmtYuan(pmt(P, annual, years)) + "/月";
}