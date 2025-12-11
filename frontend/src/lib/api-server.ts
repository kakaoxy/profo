// src/lib/api-server.ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { cookies } from "next/headers";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 它可以直接读取 Cookie
 */
export async function fetchClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}