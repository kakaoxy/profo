/**
 * 小程序后端 base URL，按运行环境自动切换.
 *
 * - develop（开发者工具/真机调试）：默认线上域名 fangmengchina.com；
 *   本地联调时取消注释下方 http://192.168.110.169:8000/api/v1 并注释线上行
 * - trial（体验版）/ release（正式版）：生产域名 fangmengchina.com
 *   - nginx 已配 HTTPS + /api/v1/ 反代（见 profo.backup）
 *   - 需在 mp.weixin.qq.com 后台「服务器域名」白名单加 https://fangmengchina.com
 */
type EnvVersion = "develop" | "trial" | "release";

const ENV_BASE_URL: Record<EnvVersion, string> = {
  // develop: "https://fangmengchina.com/api/v1",
  develop: "http://192.168.110.169:8000/api/v1",
  trial: "https://fangmengchina.com/api/v1",
  release: "https://fangmengchina.com/api/v1",
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

/**
 * 后端 origin（无 /api/v1 前缀），用于拼接静态资源 URL.
 *
 * 后端 StaticFiles 挂载在根路径 /static，不挂载在 API_V1_PREFIX 下，
 * 因此 /static/uploads/xxx.jpg 必须用 origin 而非 BASE_URL 拼接，
 * 否则会得到错误的 /api/v1/static/... 路径.
 */
export const BASE_ORIGIN = BASE_URL.replace(/\/api\/v1$/, "");