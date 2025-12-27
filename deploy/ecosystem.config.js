// PM2 ecosystem 配置文件
// 使用方式: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'profo-backend',
      cwd: '/root/profo/backend',
      script: 'main.py',
      interpreter: '/root/.local/bin/uv',
      interpreter_args: 'run python',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/profo/logs/backend-error.log',
      out_file: '/root/profo/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'profo-frontend',
      cwd: '/root/profo/frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/root/profo/logs/frontend-error.log',
      out_file: '/root/profo/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
