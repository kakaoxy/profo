import createClient from "openapi-fetch";
import type { paths } from "./api-types"; // 这就是刚才生成的类型文件

// 获取环境变量中的后端地址
const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 场景 A: 客户端组件 (Client Components) 使用
 * 用于：浏览器端的交互，比如点击按钮后发请求
 */
export const client = createClient<paths>({ 
  baseUrl 
});

