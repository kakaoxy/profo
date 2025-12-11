import createClient from "openapi-fetch";
import type { paths } from "./api-types"; // 这就是刚才生成的类型文件
import { cookies } from "next/headers";

// 获取环境变量中的后端地址
const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 场景 A: 客户端组件 (Client Components) 使用
 * 用于：浏览器端的交互，比如点击按钮后发请求
 */
export const client = createClient<paths>({ 
  baseUrl 
});

/**
 * 场景 B: 服务端组件 (Server Components) & Server Actions 使用
 * 用于：页面加载时获取数据、处理表单提交
 * 特点：会自动从 Cookie 中读取 Token 并带给后端
 */
export async function fetchClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}