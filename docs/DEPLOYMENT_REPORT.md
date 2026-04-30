# ProFo 生产环境部署报告

## 问题背景

本次部署解决了以下问题：
1. 前端登录请求后端无响应（SSL 证书过期导致服务器无法访问自身公网域名）
2. 图片/文件上传提示"请重新登录"（上传组件仍从 localStorage 读取 token）
3. `/api/auth/refresh` 返回 404（Nginx 配置导致 API 路由被错误代理）

## 核心架构调整

### 请求流向（修复后）

```
┌─────────────────────────────────────────────────────────────────┐
│                          浏览器客户端                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │  https://fangmeng...    │  Nginx 443端口
         └───────────┬─────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌─────────┐   ┌──────────┐   ┌──────────────┐
│/api/v1/*│   │/api/auth/*│   │   其他路径    │
│  上传等  │   │ token刷新 │   │  页面路由等   │
└────┬────┘   └────┬─────┘   └──────┬───────┘
     │             │                │
     ▼             ▼                ▼
┌──────────┐  ┌──────────┐   ┌──────────────┐
│后端:8000  │  │前端:3000 │   │  前端:3000    │
│FastAPI   │  │Next.js   │   │   Next.js     │
└──────────┘  └──────────┘   └──────────────┘
```

## 修改的文件清单

### 1. 前端配置

#### `.env.local`
```bash
# 生产环境 API 域名
NEXT_PUBLIC_API_URL=https://fangmengchina.com

# [新增] 服务器端直接访问后端的 URL
# 用于 Server Actions 直接连接本地后端，避免 SSL 证书问题
SERVER_SIDE_API_URL=http://127.0.0.1:8000

NODE_ENV=production
```

#### `next.config.ts`
```typescript
// [修复] 只 rewrite /api/v1/* 到后端，/api/auth/* 留给 Next.js 自己处理
async rewrites() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  return [
    {
      source: "/api/v1/:path*",
      destination: `${apiUrl}/api/v1/:path*`,
    },
  ];
}
```

#### `src/lib/config.ts`
```typescript
// [新增] 服务器端直接访问后端的 URL
const SERVER_SIDE_API_URL = process.env.SERVER_SIDE_API_URL || "http://127.0.0.1:8000";

// [修复] getApiUrl - Server Actions 直接访问本地后端
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  // 服务器端（Server Actions）：直接访问本地后端
  if (typeof window === "undefined") {
    return `${SERVER_SIDE_API_URL}${normalizedPath}`;
  }
  
  // 客户端：使用公网域名
  return `${API_BASE_URL}${normalizedPath}`;
}

// [修复] getClientApiUrl - 同样支持服务器端本地访问
export function getClientApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  // 服务器端（SSR/Server Action）：直接访问本地后端
  if (typeof window === "undefined") {
    return `${SERVER_SIDE_API_URL}${normalizedPath}`;
  }

  // 开发环境：使用相对路径
  if (!isProduction) {
    return normalizedPath;
  }

  // 客户端生产环境：使用公网域名
  return `${API_BASE_URL}${normalizedPath}`;
}
```

#### `src/components/common/upload/utils.ts`
```typescript
// [修复] 获取有效的 access token
// 项目已改用 httpOnly Cookie，不再从 localStorage 读取
export async function getValidToken(): Promise<string | null> {
  // 直接尝试刷新获取 token
  // 因为 token 存储在 httpOnly Cookie 中，JavaScript 无法直接读取
  const token = await tryRefreshToken();
  return token;
}
```

### 2. Nginx 配置

#### `.trae/nginx`
```nginx
server {
    listen 443 ssl http2;
    server_name fangmengchina.com www.fangmengchina.com;

    # ... SSL 配置 ...

    # [修复] /api/v1/* 直接代理到后端，绕过前端（避免 SSL 证书问题）
    location /api/v1/ {
        proxy_pass http://127.0.0.1:8000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 支持大文件上传
        client_max_body_size 100M;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # /api/auth/* 走前端 Next.js（用于 token 刷新等）
    location /api/auth/ {
        proxy_pass http://127.0.0.1:3000/api/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 其他请求代理到前端
    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... 其他配置
    }
}
```

## 部署步骤

### 1. 更新 Nginx 配置
```bash
# 在服务器上执行
sudo cp /root/profo/.trae/nginx /etc/nginx/sites-available/profo
sudo nginx -t
sudo systemctl reload nginx
```

### 2. 本地构建前端
```bash
cd d:\profo\frontend

# 清理旧构建（必须！）
rmdir /s /q .next
rmdir /s /q node_modules\.cache

# 重新安装依赖（确保配置更新）
pnpm install

# 构建生产版本
pnpm build
```

### 3. 上传到服务器
```bash
# 删除服务器上的旧构建
ssh root@fangmengchina.com "rm -rf /root/profo/frontend/.next"

# 上传新的构建
scp -r .next root@fangmengchina.com:/root/profo/frontend/

# 同时确保这些文件存在：
# - package.json
# - public/ 目录
# - next.config.ts
```

### 4. 重启服务
```bash
# 重启前端服务
ssh root@fangmengchina.com "pm2 restart profo-frontend"

# 或手动启动
ssh root@fangmengchina.com "cd /root/profo/frontend && pnpm start"
```

### 5. 验证部署
```bash
# 检查 API 路由是否正常
curl -X POST https://fangmengchina.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -v

# 检查后端健康
curl https://fangmengchina.com/health
```

## 关键注意事项

### 1. 环境变量
| 变量名 | 本地开发 | 生产环境 |
|--------|---------|---------|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | `https://fangmengchina.com` |
| `SERVER_SIDE_API_URL` | `http://127.0.0.1:8000` | `http://127.0.0.1:8000` |
| `NODE_ENV` | `development` | `production` |

### 2. 认证方式
- **登录/刷新**: 使用 httpOnly Cookie
- **上传组件**: 调用 `/api/auth/refresh` 获取 token，然后设置 `Authorization: Bearer <token>`
- **其他 API**: 通过 Cookie 自动携带（浏览器）或手动设置 Header（上传）

### 3. 路由代理规则
| 路径 | 代理目标 | 说明 |
|------|---------|------|
| `/api/v1/*` | 后端:8000 | Nginx 直接代理，不经过前端 |
| `/api/auth/*` | 前端:3000 | Next.js API Route |
| `/_next/static/*` | 前端:3000 | Next.js 静态资源 |
| `/static/*` | 后端:8000 | 后端静态文件 |
| `/health` | 后端:8000 | 健康检查 |
| 其他 | 前端:3000 | Next.js 页面路由 |

### 4. SSL 证书问题
如果证书过期，服务器端代码（Server Actions）通过 `SERVER_SIDE_API_URL=http://127.0.0.1:8000` 直接访问本地后端，绕过证书验证。

**建议**: 定期更新证书
```bash
certbot renew
```

## 故障排查

### 问题 1: 登录无响应
**原因**: 服务器无法访问自身公网域名（SSL 证书过期）
**解决**: 确保 `getApiUrl()` 在服务器端返回 `http://127.0.0.1:8000`

### 问题 2: 上传提示重新登录
**原因**: 上传组件从 localStorage 读取 token，但项目已改用 httpOnly Cookie
**解决**: 确保 `getValidToken()` 调用 `/api/auth/refresh` 获取 token

### 问题 3: `/api/auth/refresh` 404
**原因**: Nginx 配置把 `/api/*` 都代理到后端
**解决**: Nginx 配置中 `/api/v1/` 和 `/api/auth/` 分开处理

### 问题 4: 上传证书错误
**原因**: Next.js rewrite 尝试代理到 `https://fangmengchina.com`
**解决**: Nginx 直接代理 `/api/v1/*` 到后端，绕过前端 rewrite

## 后续维护

1. **SSL 证书续期**: 
   ```bash
   certbot renew
   ```

2. **更新部署**: 
   - 修改代码后必须重新构建
   - 删除 `.next` 目录确保无缓存
   - 上传整个 `.next` 目录

3. **日志查看**:
   ```bash
   # Nginx 日志
   tail -f /var/log/nginx/profo.error.log
   
   # 前端日志
   pm2 logs profo-frontend
   
   # 后端日志
   pm2 logs profo-backend
   ```

---

**报告生成时间**: 2026-04-30  
**部署版本**: ProFo Frontend + Backend  
**部署环境**: fangmengchina.com
