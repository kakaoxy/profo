/**
 * 小程序后端 base URL，按运行环境自动切换.
 *
 * - develop（开发者工具/真机调试）：本地后端
 * - trail（体验版）：预发布域名
 * - release（正式版）：生产域名（需 HTTPS，且在小程序后台「服务器域名」白名单内）
 *
 * 生产/预发布域名由 S7 切片配置，尚未落地前以占位符 + TODO 标注，落地后替换即可。
 */
type EnvVersion = "develop" | "trial" | "release";

const ENV_BASE_URL: Record<EnvVersion, string> = {
  develop: "http://127.0.0.1:8000/api/v1",
  // TODO: 待 S7 配置预发布域名后替换
  trial: "https://PROD-PLACEHOLDER/api/v1",
  // TODO: 待 S7 配置生产域名后替换
  release: "https://PROD-PLACEHOLDER/api/v1",
};

/** 读取当前运行环境；API 不可用或异常时回退 develop. */
function getEnvVersion(): EnvVersion {
  try {
    const info = wx.getAccountInfoSync();
    return info?.miniProgram?.envVersion ?? "develop";
  } catch {
    return "develop";
  }
}

export const BASE_URL = ENV_BASE_URL[getEnvVersion()];