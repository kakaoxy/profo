/**
 * 地图选点（wx.chooseLocation）统一封装：授权预检 + 失败原因分流 + 用户引导.
 *
 * 背景：wx.chooseLocation 在隐私未同意、位置授权被拒、后台接口未开通、开发者工具不支持
 * 等情况下都走同一个 fail 回调，只给 errMsg。此前页面统一吞成「地图选点失败，请重试」，
 * 无法定位原因。本模块把 errMsg 分流为可操作提示，并把原始 errMsg 打印/复制出来便于反馈。
 *
 * 调用点：门店建档页、经纪人注册建店页（两处语义一致，故抽取）。
 */

/** 选点结果：address 为「地址 + 兴趣点名」组合文本，可直接写入门店地址字段. */
export interface ChosenLocation {
  address: string;
  latitude: number;
  longitude: number;
  name: string;
}

const SCOPE_LOCATION = "scope.userLocation";

/** 当前是否在微信开发者工具中（工具不支持或模拟选点失败，需真机验证）. */
function isDevtools(): boolean {
  try {
    return wx.getDeviceInfo().platform === "devtools";
  } catch {
    return false;
  }
}

/** 隐私保护指引是否尚未同意（未声明「位置信息」时也会长期为未同意）. */
function needPrivacyAuthorization(): Promise<boolean> {
  if (typeof wx.getPrivacySetting !== "function") {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    wx.getPrivacySetting({
      success: (res) => resolve(Boolean(res.needAuthorization)),
      fail: () => resolve(false),
    });
  });
}

/** 用户是否已明确拒绝位置授权（authSetting 为 undefined 表示尚未询问，交给回调弹窗）. */
function isLocationScopeDenied(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    wx.getSetting({
      success: (res) => resolve(res.authSetting[SCOPE_LOCATION] === false),
      fail: () => resolve(false),
    });
  });
}

function showModal(title: string, content: string, confirmText: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
}

/** 打开授权设置页（必须由用户点击触发，故仅在 showModal 确认回调内调用）. */
function openAuthSetting(): Promise<void> {
  return new Promise<void>((resolve) => {
    wx.openSetting({ complete: () => resolve() });
  });
}

/** 打开小程序隐私保护指引页. */
function openPrivacyContract(): void {
  if (typeof wx.openPrivacyContract !== "function") {
    wx.showToast({ title: "请在小程序内同意隐私保护指引后重试", icon: "none" });
    return;
  }
  wx.openPrivacyContract({ fail: () => undefined });
}

function copyToClipboard(text: string): void {
  wx.setClipboardData({ data: text, fail: () => undefined });
}

/**
 * 处理选点失败：按 errMsg 分流提示，并保留原始信息便于排查.
 * 用户主动取消不提示（属正常操作）。
 */
async function handleChooseFail(errMsg: string, raw: unknown): Promise<void> {
  // 原始 errMsg 必须留痕，否则线上无法判断是授权、隐私还是配置问题.
  console.error("[chooseLocation] 失败", errMsg || "(无 errMsg)", raw);
  const message = errMsg || "";
  const lower = message.toLowerCase();
  const devtoolsHint = isDevtools() ? "（当前为微信开发者工具，模拟器可能不支持地图选点，请用真机复测）" : "";

  if (lower.includes("cancel")) {
    return;
  }
  if (lower.includes("privacy")) {
    const confirmed = await showModal(
      "需先同意隐私保护指引",
      `地图选点属于隐私接口，当前隐私授权未通过。请确认小程序后台「设置-服务内容声明-用户隐私保护指引」已声明「位置信息」，并在小程序内同意隐私保护指引后重试。${devtoolsHint}`,
      "查看协议",
    );
    if (confirmed) {
      openPrivacyContract();
    }
    return;
  }
  if (lower.includes("auth deny") || lower.includes("auth denied") || lower.includes("authorize")) {
    const confirmed = await showModal(
      "位置权限未开启",
      "地图选点需要获取你的位置信息，请在设置中允许「位置信息」后重试。",
      "去设置",
    );
    if (confirmed) {
      await openAuthSetting();
    }
    return;
  }
  if (
    lower.includes("requiredprivateinfos") ||
    lower.includes("not declared") ||
    lower.includes("not support") ||
    lower.includes("system permission") ||
    lower.includes("invalid scope")
  ) {
    await showModal(
      "地图选点不可用",
      `当前无法调用地图选点。请检查：1) app.json 的 requiredPrivateInfos 已声明 chooseLocation；2) 小程序后台「开发管理-接口设置」已开通地理位置接口；3) app.json 已声明 scope.userLocation 用途。${devtoolsHint}\n错误信息：${message}`,
      "知道了",
    );
    return;
  }
  copyToClipboard(message || "chooseLocation fail");
  await showModal("地图选点失败", `错误信息已复制，可反馈给技术同事：\n${message || "(无 errMsg)"}${devtoolsHint}`, "知道了");
}

/**
 * 定位结果（GCJ-02），用于门店列表按距离排序（REQ-IT4-02）.
 */
export interface CurrentLocation {
  latitude: number;
  longitude: number;
}

/**
 * 获取当前定位（GCJ-02）.
 *
 * 定位不是门店列表的硬依赖：未同意隐私、拒绝授权、工具不支持等情况下直接返回 null，
 * 由调用方回退默认排序，不做打断式弹窗。
 */
export function getCurrentLocation(): Promise<CurrentLocation | null> {
  return new Promise<CurrentLocation | null>((resolve) => {
    void needPrivacyAuthorization().then((need) => {
      if (need) {
        resolve(null);
        return;
      }
      void isLocationScopeDenied().then((denied) => {
        if (denied) {
          resolve(null);
          return;
        }
        wx.getLocation({
          type: "gcj02",
          success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
          fail: (err) => {
            console.warn("[getLocation] 失败", (err as { errMsg?: string }).errMsg || err);
            resolve(null);
          },
          complete: () => undefined,
        });
      });
    });
  });
}

/**
 * 选择地图位置：预检隐私与位置授权，失败时给出可操作引导.
 * @returns 选中位置；用户取消或失败（已提示）时返回 null
 */
export async function chooseMapLocation(): Promise<ChosenLocation | null> {
  if (await needPrivacyAuthorization()) {
    const confirmed = await showModal(
      "需先同意隐私保护指引",
      "地图选点属于隐私接口，需先同意小程序隐私保护指引。若已同意仍提示此信息，请检查小程序后台「用户隐私保护指引」是否声明了「位置信息」。",
      "查看协议",
    );
    if (confirmed) {
      openPrivacyContract();
    }
    return null;
  }

  if (await isLocationScopeDenied()) {
    const confirmed = await showModal(
      "位置权限未开启",
      "地图选点需要获取你的位置信息，请在设置中允许「位置信息」后重试。",
      "去设置",
    );
    if (!confirmed) {
      return null;
    }
    await openAuthSetting();
    if (await isLocationScopeDenied()) {
      wx.showToast({ title: "未获取位置权限，无法选点", icon: "none" });
      return null;
    }
  }

  return new Promise<ChosenLocation | null>((resolve) => {
    wx.chooseLocation({
      success: (res) => {
        const name = res.name || "";
        resolve({
          address: res.address ? `${res.address}${name ? ` ${name}` : ""}` : name,
          latitude: res.latitude,
          longitude: res.longitude,
          name,
        });
      },
      fail: (err) => {
        void handleChooseFail((err as { errMsg?: string }).errMsg || "", err);
        resolve(null);
      },
      complete: () => undefined,
    });
  });
}
