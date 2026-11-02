/**
 * 商户模块请求错误文案（审查报告 T11：改造前所有页面都报「网络异常，请重试」，
 * 用户和客服都无法判断是没网、没权限、还是记录被删了）。
 *
 * 优先级：后端 body.message（最具体）→ 状态码文案 → 网络层 errMsg → 页面兜底文案。
 * 副作用：改造前 10 个页面各写一份 errMessage，且都只取 body.message，兜底不可诊断。
 */

/** 常见状态码的可执行文案（只说人能怎么办，不暴露实现）. */
const STATUS_HINTS: Record<number, string> = {
  401: "登录状态已过期，请重新登录后再试",
  403: "当前账号没有商户拓展权限，请联系管理员开通",
  404: "记录不存在或已被删除",
  409: "数据已被其他人修改，请刷新后重试",
  429: "操作太频繁，请稍后再试",
  500: "服务端暂时不可用，稍后再试",
  502: "服务端暂时不可用，稍后再试",
  503: "服务端暂时不可用，稍后再试",
};

/**
 * 把请求失败对象翻译成一句可行动的中文。
 *
 * @param err request() reject 出来的错误（HttpResponseError / NetworkError / 任意值）
 * @param fallback 页面自己的兜底文案，例如「门店加载失败」
 */
export function describeRequestError(err: unknown, fallback: string): string {
  const message = (err as { body?: { message?: string } })?.body?.message;
  if (message) {
    return message;
  }
  const statusCode = (err as { statusCode?: number })?.statusCode;
  if (statusCode) {
    return STATUS_HINTS[statusCode] ?? `${fallback}（HTTP ${statusCode}）`;
  }
  const errMsg = (err as { errMsg?: string })?.errMsg;
  if (errMsg) {
    // wx.request 的 errMsg 形如 "request:fail timeout" / "request:fail ssl hand shake error"
    return `网络连接失败（${errMsg}），请检查网络后重试`;
  }
  return fallback;
}
