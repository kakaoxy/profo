/**
 * 分享给经纪人 · 第三步 · 生成成功（设计稿 C9）.
 *
 * 展示成功态与分享卡预览 + 本次分享的房源详细地址（GET /keys/shares/{id}，
 * 刚生成分享登录态必然有效；加载失败静默降级仅不展示地址列表）；
 * onShareAppMessage 返回固定路径 /pages/key-share/index?token=xxx；
 * 「转发给经纪人」用 button open-type=share 触发原生转发；
 * 「稍后」redirect 到分享记录页。
 */
import { request } from "../../../../utils/request";
import { formatDay } from "../../utils/keys";
import type { KeyShareDetailResponse } from "../../utils/keys";

interface PageData {
  token: string;
  shareId: string;
  count: number;
  expiresText: string;
  /** 本次分享的房源详细地址（加载失败为空，不阻塞成功页）. */
  props: string[];
}

interface PageCustom {
  loadProps(): Promise<void>;
  onLater(): void;
}

Page<PageData, PageCustom>({
  data: {
    token: "",
    shareId: "",
    count: 0,
    expiresText: "",
    props: [],
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      token: query.token ?? "",
      shareId: query.id ?? "",
      count: Number(query.count ?? "0") || 0,
      expiresText: query.expires_at ? formatDay(decodeURIComponent(query.expires_at)) : "",
    });
    void this.loadProps();
  },

  /** 拉取分享详情渲染房源详细地址；失败静默（成功页不被阻塞）. */
  async loadProps() {
    const { shareId } = this.data;
    if (!shareId) {
      return;
    }
    try {
      const data = await request<KeyShareDetailResponse>({
        url: `/keys/shares/${shareId}`,
      });
      this.setData({
        props: (data.items ?? []).map((i) => i.address || i.project_name),
      });
    } catch {
      // 静默降级：不展示地址列表
    }
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const { count, token } = this.data;
    return {
      title: `${count} 套房源带看密码 · 请查收`,
      // key-share 经纪人分享落地页由他人实现，path 固定按此格式
      path: `/pages/key-share/index?token=${token}`,
    };
  },

  onLater() {
    wx.redirectTo({ url: "/pages/keys/share-records/index" });
  },
});
