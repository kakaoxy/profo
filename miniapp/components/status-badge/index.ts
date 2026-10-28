/**
 * 房源状态徽章（Design QA 2026-10-28 D-02 抽取的共享组件）.
 *
 * 输入后端原始 project_status 枚举值（在售/在途/已售），组件内映射为
 * 展示文案与三态配色（与全局 chip 词汇一致）：
 * - 在售 → 「在售」 apricot-wash 底 · rust 字
 * - 在途 → 「装修中」 sky-wash 底 · 深蓝字
 * - 已售 → 「过往案例」 fog 底 · graphite 字
 *
 * 未知状态不渲染（隐藏徽章，与列表页 badgeText 空串不渲染口径一致）。
 * 使用方：<status-badge status="{{detail.project_status}}" />；
 * 定位/外边距由使用方的宿主节点控制。
 */
Component({
  properties: {
    /** 后端 MarketingProjectStatus 原始值：在售 / 在途 / 已售. */
    status: {
      type: String,
      value: "",
    },
  },

  data: {
    label: "",
    variant: "",
  },

  observers: {
    status(value: string) {
      const map: Record<string, { label: string; variant: string }> = {
        在售: { label: "在售", variant: "apricot" },
        在途: { label: "装修中", variant: "sky" },
        已售: { label: "过往案例", variant: "fog" },
      };
      const hit = map[value];
      this.setData(hit ? { label: hit.label, variant: hit.variant } : { label: "", variant: "" });
    },
  },
});
