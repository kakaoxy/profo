# ProFo 部署快速参考

## 一键部署命令

```bash
# 1. 本地构建
cd d:\profo\frontend
rmdir /s /q .next && pnpm install && pnpm build

# 2. 上传到服务器
ssh root@fangmengchina.com "rm -rf /root/profo/frontend/.next"
scp -r .next root@fangmengchina.com:/root/profo/frontend/

# 3. 重启服务
ssh root@fangmengchina.com "pm2 restart profo-frontend"
```

## 关键配置检查清单

### .env.local
```bash
NEXT_PUBLIC_API_URL=https://fangmengchina.com
SERVER_SIDE_API_URL=http://127.0.0.1:8000
NODE_ENV=production
```

### Nginx 核心配置
```nginx
# /api/v1/* → 后端（直接代理，避免证书问题）
location /api/v1/ {
    proxy_pass http://127.0.0.1:8000/api/v1/;
}

# /api/auth/* → 前端（Next.js API Route）
location /api/auth/ {
    proxy_pass http://127.0.0.1:3000/api/auth/;
}
```

## 常见问题速查

| 问题 | 原因 | 解决 |
|------|------|------|
| 登录无响应 | SSL 证书过期 | 服务器端走 `http://127.0.0.1:8000` |
| 上传提示登录 | localStorage 无 token | 调用 `/api/auth/refresh` 获取 |
| `/api/auth/refresh` 404 | Nginx 代理错误 | `/api/v1/` 和 `/api/auth/` 分开代理 |
| 上传证书错误 | Next.js rewrite 到 https | Nginx 直接代理 `/api/v1/*` 到后端 |

## 验证命令

```bash
# 测试刷新接口
curl -X POST https://fangmengchina.com/api/auth/refresh

# 测试后端健康
curl https://fangmengchina.com/health

# 查看 Nginx 错误
ssh root@fangmengchina.com "tail -f /var/log/nginx/profo.error.log"
```

## 证书续期

```bash
ssh root@fangmengchina.com "certbot renew && systemctl reload nginx"
```
