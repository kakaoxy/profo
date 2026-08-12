/**
 * 手机号绑定引导弹窗组件.
 *
 * 三态视图：
 * - guide：引导用户绑定手机号（含「立即绑定」按钮触发微信 getPhoneNumber 授权，
 *   「暂不绑定」关闭弹窗并通知父页面置 c_phone_prompted=true）；
 * - merge_confirm：手机号已被主账号占用（后端返回业务码 40901）时切换至该视图，
 *   引导用户前往「绑定已有账号」页用账号密码合并（⚠️ SMS 短信合并分支后端未实现，
 *   暂不直接调 /public/users/merge 的 phone 分支）；
 * - success：绑定成功提示，2 秒后自动关闭.
 *
 * 对外事件（triggerEvent）：
 * - skip：用户选「暂不绑定」；
 * - bound：手机号绑定成功（已切到 success 视图，父页面可刷新用户信息）；
 * - gobindaccount：用户从合并确认视图选「前往绑定已有账号」.
 *
 * 注意：getPhoneNumber 必须由用户主动点击 button[open-type=getPhoneNumber] 触发，
 * 不能用代码自动调用。
 */
import { request } from "../../utils/request";

/** 手机号已被主账号占用时，后端在 target_user_hint 中返回的提示信息. */
interface TargetHint {
  nickname: string;
  phone_masked: string;
}

/** /public/users/phone/wechat 返回体：成功 { success: true }，冲突 { code: 40901, target_user_hint }. */
interface PhoneWechatResponse {
  success?: boolean;
  code?: number;
  message?: string;
  target_user_hint?: TargetHint;
}

/** 组件渲染态. */
interface ComponentData {
  visible: boolean;
  mode: "guide" | "merge_confirm" | "success";
  targetHint?: TargetHint;
  loading: boolean;
}

/** 组件方法签名（用于 Component 泛型，使 this 含自定义方法）.
 *
 * 注意：WeChat miniapp 的 MethodOption 类型定义为 `Record<string, Function>`，
 * 必须保留 `[key: string]: Function` 索引签名才能满足 Component 泛型约束。
 */
interface ComponentMethods {
  [key: string]: Function;
  show(): void;
  hide(): void;
  onSkip(): void;
  onPhoneAuth(e: WechatMiniprogram.CustomEvent): void;
  bindPhone(code: string): void;
  onGoBindAccount(): void;
  onCancelMerge(): void;
}

const data: ComponentData = {
  visible: false,
  mode: "guide",
  targetHint: undefined,
  loading: false,
};

Component<ComponentData, Record<string, never>, ComponentMethods, Record<string, never>>({
  options: { multipleSlots: false },
  data,
  methods: {
    show() {
      this.setData({ visible: true, mode: "guide", targetHint: undefined });
    },
    hide() {
      this.setData({ visible: false, loading: false });
    },
    /** 暂不绑定：触发 skip 事件后关闭弹窗（父页面据此设 phone_prompted=true）. */
    onSkip() {
      this.triggerEvent("skip");
      this.hide();
    },
    /**
     * 微信手机号授权回调（由 button[open-type=getPhoneNumber] 触发）.
     * detail.errMsg 包含 "ok" 表示授权成功；detail.code 为微信侧换取手机号的凭证.
     */
    onPhoneAuth(e: WechatMiniprogram.CustomEvent) {
      const detail = e.detail as { code?: string; errMsg?: string };
      if (detail.errMsg && !detail.errMsg.includes("ok")) {
        wx.showToast({ title: "已取消授权", icon: "none" });
        return;
      }
      if (!detail.code) {
        wx.showToast({ title: "获取手机号失败", icon: "none" });
        return;
      }
      this.bindPhone(detail.code);
    },
    /**
     * 调 /public/users/phone/wechat 用微信 code 换手机号并绑定.
     * - HTTP 200 + body.code=40901：手机号已被主账号占用，切合并确认视图；
     * - HTTP 200 + body.success=true：绑定成功，切 success 视图并 triggerEvent("bound")，2s 后自动关闭；
     * - 其他：toast 提示失败.
     *
     * 注意：request 在 HTTP 2xx 时 resolve，body.code 非 0 不 reject，需在此处自行检查.
     */
    bindPhone(code: string) {
      this.setData({ loading: true });
      request<PhoneWechatResponse>({
        url: "/public/users/phone/wechat",
        method: "POST",
        data: { code },
      })
        .then((res) => {
          this.setData({ loading: false });
          if (res.code === 40901) {
            // 手机号已被主账号占用 → 切换合并确认视图
            this.setData({ mode: "merge_confirm", targetHint: res.target_user_hint });
          } else if (res.success) {
            // 绑定成功
            this.setData({ mode: "success" });
            this.triggerEvent("bound");
            // 2 秒后自动关闭
            setTimeout(() => this.hide(), 2000);
          } else {
            wx.showToast({ title: res.message || "绑定失败", icon: "none" });
          }
        })
        .catch(() => {
          this.setData({ loading: false });
          wx.showToast({ title: "网络错误", icon: "none" });
        });
    },
    /** 合并确认视图：跳转绑定已有账号页（因 SMS 分支未实现，暂不直接调 merge）. */
    onGoBindAccount() {
      this.triggerEvent("gobindaccount");
      this.hide();
    },
    /** 取消合并：直接关闭弹窗. */
    onCancelMerge() {
      this.hide();
    },
  },
});
