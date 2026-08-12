/**
 * 微信登录基础设施.
 *
 * 封装 wx.login → POST /auth/wechat/login 流程，登录成功后写入 4 个令牌 storage key
 * （access_token / refresh_token / c_access_token / c_refresh_token）与临时账号标识
 * （c_user_temporary），供 profile 页等后续页面判断是否需要引导绑定手机号.
 *
 * 微信登录签发的令牌为 C 端令牌（aud=c），主令牌与 C 端令牌相同，同时写入
 * access_token 与 c_access_token，与 test-login 页 C 端用户的写入逻辑保持一致
 * （见 pages/test-login/index/index.ts）.
 *
 * 失败处理：wx.login 失败、网络异常、HTTP 非 2xx 均不抛异常，统一返回
 * { success: false, error }，由调用方页面决定如何提示用户.
 */

import type { components } from "../types/api-types";
import { request } from "./request";
import { setCTemporary } from "./token";

/**
 * 微信登录响应.
 *
 * 后端 /auth/wechat/login 返回结构与 TokenResponse 一致，Task 2 起新增 is_temporary
 * 字段标识临时账号；Task 4 gen-api 后该字段进入类型定义。当前 is_temporary 尚未进入
 * 生成类型，以可选字段扩展，未返回时按 false 处理.
 */
type WechatLoginResponse = components["schemas"]["TokenResponse"] & {
  is_temporary?: boolean;
};

/** 微信登录结果：成功带 isTemporary，失败带 error. */
export interface WechatLoginResult {
  success: boolean;
  isTemporary?: boolean;
  error?: string;
}

/**
 * 调起微信登录并写入令牌与临时账号标识.
 *
 * 流程：
 * 1. wx.login 获取临时登录 code；
 * 2. POST /auth/wechat/login 换取令牌（skipAuth=true，登录前无需鉴权）；
 * 3. 写入 4 个令牌 storage key（C 端令牌，主备两端一致）；
 * 4. 写入 c_user_temporary 标识（后端 is_temporary，缺省按 false）；
 * 5. 返回 { success: true, isTemporary }.
 */
export async function wechatLogin(): Promise<WechatLoginResult> {
  try {
    const code = await new Promise<string>((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res.code);
          } else {
            reject(new Error("微信登录未返回授权码"));
          }
        },
        fail: (err) => reject(new Error(err.errMsg)),
      });
    });

    const res = await request<WechatLoginResponse>({
      url: "/auth/wechat/login",
      method: "POST",
      data: { code },
      skipAuth: true,
    });

    wx.setStorageSync("access_token", res.access_token);
    wx.setStorageSync("refresh_token", res.refresh_token);
    // C 端令牌（aud=c）：主令牌即 C 端令牌，同时写入 c_access_token
    wx.setStorageSync("c_access_token", res.access_token);
    wx.setStorageSync("c_refresh_token", res.refresh_token);

    const isTemporary = res.is_temporary === true;
    setCTemporary(isTemporary);
    return { success: true, isTemporary };
  } catch (err) {
    // wx.login 失败 → Error.message；request HTTP 非 2xx → { body: { message } }；
    // request 网络异常 → { errMsg }
    const error = err as { message?: string; errMsg?: string; body?: { message?: string } };
    const msg = error?.body?.message || error?.message || error?.errMsg || "微信登录失败";
    return { success: false, error: msg };
  }
}
