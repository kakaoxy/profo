/**
 * 分享给经纪人 · 第三步 · 生成成功（设计稿 C9）.
 *
 * 展示成功态与分享卡预览 + 本次分享的房源详细地址（GET /keys/shares/{id}，
 * 刚生成分享登录态必然有效；加载失败静默降级仅不展示地址列表）；
 * onShareAppMessage 标题拼接详细地址与带看注意事项（全拼接不截断，由微信卡片
 * 自行截断显示；详情未加载完时秒点转发回退通用「N 套房源带看密码 · 请查收」），
 * 返回固定路径 /pages/key-share/index?token=xxx；
 * 「转发给经纪人」用 button open-type=share 触发原生转发；
 * 「稍后」redirect 到分享记录页。
 */
import { request } from "../../../../utils/request";
import { formatDay } from "../../utils/keys";
import type { KeyShareDetailResponse } from "../../utils/keys";

/** 分享条目展示结构（详细地址 + 带看注意事项）. */
interface SharePropItem {
  projectId: string;
  /** 详细地址（空回退房源名）. */
  address: string;
  /** 带看注意事项（trim 后，空串表示未设置）. */
  keyNote: string;
}

interface PageData {
  token: string;
  shareId: string;
  count: number;
  expiresText: string;
  /** 本次分享的房源条目（加载失败为空，不阻塞成功页）. */
  props: SharePropItem[];
  /** 预览卡标题行：地址段 · 带看密码；详情未加载/失败回退「钥匙分享 · N 套房源」. */
  cardTitle: string;
  /** 预览卡副行：注意事项段；无时为「邀请你查看带看密码」. */
  cardSub: string;
}

interface PageCustom {
  loadProps(): Promise<void>;
  onLater(): void;
}

/** 地址段：逐套地址（空回退房源名）以「、」连接. */
function addrSegOf(props: SharePropItem[]): string {
  return props
    .map((p) => p.address)
    .filter(Boolean)
    .join("、");
}

/** 注意事项段：逐套 trim 后非空去重，以「；」连接. */
function noteSegOf(props: SharePropItem[]): string {
  return [...new Set(props.map((p) => p.keyNote).filter(Boolean))].join("；");
}

Page<PageData, PageCustom>({
  data: {
    token: "",
    shareId: "",
    count: 0,
    expiresText: "",
    props: [],
    cardTitle: "",
    cardSub: "",
  },

  onLoad(query: Record<string, string | undefined>) {
    const count = Number(query.count ?? "0") || 0;
    this.setData({
      token: query.token ?? "",
      shareId: query.id ?? "",
      count,
      expiresText: query.expires_at ? formatDay(decodeURIComponent(query.expires_at)) : "",
      // 详情未加载完成时的回退内容（与转发卡回退标题口径一致）
      cardTitle: `钥匙分享 · ${count} 套房源`,
      cardSub: "邀请你查看带看密码",
    });
    void this.loadProps();
  },

  /** 拉取分享详情渲染房源明细与预览卡；失败静默（成功页不被阻塞）. */
  async loadProps() {
    const { shareId } = this.data;
    if (!shareId) {
      return;
    }
    try {
      const data = await request<KeyShareDetailResponse>({
        url: `/keys/shares/${shareId}`,
      });
      const props: SharePropItem[] = (data.items ?? []).map((i) => ({
        projectId: i.project_id,
        address: i.address || i.project_name,
        keyNote: (i.key_note ?? "").trim(),
      }));
      const addrSeg = addrSegOf(props);
      const noteSeg = noteSegOf(props);
      this.setData({
        props,
        cardTitle: addrSeg ? `${addrSeg} · 带看密码` : this.data.cardTitle,
        cardSub: noteSeg ? `注意：${noteSeg}` : "邀请你查看带看密码",
      });
    } catch {
      // 静默降级：不展示地址明细，预览卡保持回退内容
    }
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const { count, token, props } = this.data;
    // 详情未加载完（秒点转发）或加载失败 → 回退通用标题
    const addrSeg = addrSegOf(props);
    if (!addrSeg) {
      return {
        title: `${count} 套房源带看密码 · 请查收`,
        // key-share 经纪人分享落地页由他人实现，path 固定按此格式
        path: `/pages/key-share/index?token=${token}`,
      };
    }
    const noteSeg = noteSegOf(props);
    const title = noteSeg
      ? `${addrSeg} · 带看密码 · 注意：${noteSeg}`
      : `${addrSeg} · 带看密码 · 请查收`;
    return {
      title,
      path: `/pages/key-share/index?token=${token}`,
    };
  },

  onLater() {
    wx.redirectTo({ url: "/pages/keys/share-records/index" });
  },
});
