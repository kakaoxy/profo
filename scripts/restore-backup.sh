#!/bin/bash
# ============================================================================
# restore-backup.sh — 将服务器数据库备份导入本地测试环境
#
# 功能：
#   1. 从服务器拉取数据库备份（deploy-server.sh 部署前生成的 .sql.gz）
#   2. 同步服务器 .env 常量 + ENCRYPTION_KEY（本地重新生成 JWT_SECRET_KEY）
#   3. 覆盖重建本地测试库（DROP + CREATE）并导入备份
#
# 用法（在项目根目录执行）：
#   ./scripts/restore-backup.sh                 # 使用服务器最新备份
#   ./scripts/restore-backup.sh backup_xxx.sql.gz   # 指定备份文件
#
# 注意：
#   - 会【覆盖重建】本地 profo 库，本地现有测试数据将被清空
#   - 仅同步数据库，不同步服务器 uploads 上传文件（图片可能缺失）
#   - 需要本机已配置到服务器的 SSH 免密登录
# ============================================================================
set -euo pipefail

# ==================== 配置区（按需修改） ====================
SERVER_USER="root"
SERVER_IP="139.224.162.134"
SERVER_PATH="/root/profo"
BACKUP_DIR="$SERVER_PATH/backups"     # 服务器备份目录
LOCAL_BACKUP_DIR="./backups"          # 本地备份下载目录
SERVER_ENV_TMP="/tmp/profo_server.env"
DEV_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# ==========================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 从 .env 文件精准提取变量（不 source 整个文件，避免特殊字符报错）
read_env_var() {
  local key="$1"
  local file="${2:-.env}"
  grep -E "^${key}=" "$file" | head -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//; s/^'//; s/'$//"
}

# 脚本位于 scripts/，项目根为其父目录
cd "$(dirname "$0")/.."

# ---- 检查必要命令 ----
for cmd in ssh scp gunzip docker python3; do
  if ! command -v "$cmd" &>/dev/null; then
    log_error "命令 $cmd 未找到，请先安装。"
    exit 1
  fi
done

# ---- 检查本地 .env ----
if [ ! -f .env ]; then
  log_error "未检测到根目录 .env"
  log_error "请先执行: cp .env.docker.example .env 并填入 POSTGRES_* 等凭据"
  exit 1
fi

POSTGRES_USER="$(read_env_var POSTGRES_USER)"
POSTGRES_PASSWORD="$(read_env_var POSTGRES_PASSWORD)"
POSTGRES_DB="$(read_env_var POSTGRES_DB)"
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
  log_error ".env 中未找到 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB"
  exit 1
fi

SSH_CMD="ssh -o BatchMode=yes $SERVER_USER@$SERVER_IP"

# ---- 1. 拉取服务器 .env（解析后用，随即删除临时文件） ----
log_info "拉取服务器 .env（${SERVER_IP}:${SERVER_PATH}）..."
if ! $SSH_CMD "cat $SERVER_PATH/.env" > "$SERVER_ENV_TMP" 2>/dev/null; then
  log_error "无法连接服务器，请确认 SSH 免密已配置: $SERVER_USER@$SERVER_IP"
  exit 1
fi
if [ ! -s "$SERVER_ENV_TMP" ]; then
  log_error "服务器 $SERVER_PATH/.env 不存在或为空"
  rm -f "$SERVER_ENV_TMP"
  exit 1
fi

server_env_value() { read_env_var "$1" "$SERVER_ENV_TMP"; }
SERVER_DB_USER="$(server_env_value POSTGRES_USER)"
[ -n "$SERVER_DB_USER" ] || SERVER_DB_USER="$POSTGRES_USER"

# ---- 2. 同步/更新本地 .env ----
log_info "更新本地 .env（同步服务器常量 + ENCRYPTION_KEY，重新生成 JWT_SECRET_KEY）..."
ENV_BAK=".env.bak.$(date +%Y%m%d_%H%M%S)"
cp .env "$ENV_BAK"
log_info "已备份原 .env → $ENV_BAK"

python3 - "$SERVER_ENV_TMP" ".env" <<'PY'
import sys, re, secrets

server_file, local_file = sys.argv[1], sys.argv[2]

def parse(path):
    kv = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            kv[k.strip()] = v.strip().strip('"').strip("'")
    return kv

server = parse(server_file)
local = parse(local_file)

# 同步服务器常量（覆盖本地）
SYNC_KEYS = [
    "WECHAT_APPID", "WECHAT_SECRET", "WECHAT_VALUATION_PRICE_TEMPLATE_ID",
    "WECHAT_REDIRECT_URI", "FRONTEND_URL", "STORAGE_BACKEND",
    "OSS_BUCKET_NAME", "OSS_ENDPOINT", "OSS_PUBLIC_BASE_URL",
    "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET",
    "CORS_ORIGINS", "TRUSTED_PROXIES", "API_PREFIX",
    "UPLOAD_DIR", "MAX_UPLOAD_SIZE", "DEBUG",
    "ENCRYPTION_KEY",  # 同步密钥（用户确认）：保证导入的加密字段本地可解密
]

changed = []
for k in SYNC_KEYS:
    if k in server:
        local[k] = server[k]
        changed.append(k)

# 本地重新生成 JWT_SECRET_KEY（只影响旧 token，重新登录即可）
local["JWT_SECRET_KEY"] = secrets.token_hex(32)
changed.append("JWT_SECRET_KEY(regenerated)")

# 保留本地现值（不生成、不同步，避免破坏已运行的本地 db 容器）：
# POSTGRES_PASSWORD / REDIS_PASSWORD / POSTGRES_USER / POSTGRES_DB

# 逐行写回：替换已有键的值，保留注释与顺序；缺失键追加到末尾
with open(local_file, encoding="utf-8") as f:
    lines = f.readlines()

seen = set()
out = []
for line in lines:
    stripped = line.strip()
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=", stripped)
    if m and m.group(1) in local:
        key = m.group(1)
        out.append(f"{key}={local[key]}\n")
        seen.add(key)
    else:
        out.append(line)

for key, val in local.items():
    if key not in seen:
        out.append(f"{key}={val}\n")

with open(local_file, "w", encoding="utf-8") as f:
    f.writelines(out)

print("  已更新: " + ", ".join(changed))
PY

rm -f "$SERVER_ENV_TMP"

# ---- 3. 选择并下载备份 ----
log_info "服务器上的可用备份："
if ! $SSH_CMD "ls -lht $BACKUP_DIR/backup_*.sql.gz"; then
  log_error "服务器上未找到备份文件（$BACKUP_DIR/backup_*.sql.gz）"
  exit 1
fi

FILE="${1:-}"
if [ -z "$FILE" ]; then
  REMOTE_PATH="$($SSH_CMD "ls -t $BACKUP_DIR/backup_*.sql.gz | head -1")"
  [ -n "$REMOTE_PATH" ] || { log_error "无法确定最新备份"; exit 1; }
  FILE="$(basename "$REMOTE_PATH")"
  log_info "默认使用最新备份: $FILE"
fi

mkdir -p "$LOCAL_BACKUP_DIR"
log_info "下载 $FILE ..."
scp -C "$SERVER_USER@$SERVER_IP:$BACKUP_DIR/$FILE" "$LOCAL_BACKUP_DIR/"
LOCAL_FILE="$LOCAL_BACKUP_DIR/$FILE"
if [ ! -f "$LOCAL_FILE" ]; then
  log_error "备份下载失败"
  exit 1
fi
log_info "✅ 已下载: $LOCAL_FILE ($(du -h "$LOCAL_FILE" | cut -f1))"

# ---- 4. 确保本地 db/redis 就绪 ----
log_info "启动本地 PostgreSQL 与 Redis（Docker）..."
$DEV_COMPOSE up -d db redis

log_info "等待 PostgreSQL 就绪..."
READY=0
for _ in $(seq 1 30); do
  if $DEV_COMPOSE exec -T db pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  log_error "PostgreSQL 未在 30s 内就绪"
  exit 1
fi
log_info "✅ PostgreSQL 已就绪"

# ---- 5. 覆盖重建本地库 ----
# 若服务器 DB 用户与本地不同，本地补建同名角色以匹配 dump 的 OWNER TO 语句
if [ "$SERVER_DB_USER" != "$POSTGRES_USER" ]; then
  log_info "服务器 DB 用户 $SERVER_DB_USER 与本地 $POSTGRES_USER 不同，补建角色..."
  $DEV_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$SERVER_DB_USER') THEN CREATE ROLE \"$SERVER_DB_USER\" LOGIN PASSWORD '$POSTGRES_PASSWORD'; END IF; END \$\$;"
fi

log_warn "即将覆盖重建本地数据库 ${POSTGRES_DB}（本地现有测试数据将被清空）..."
$DEV_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $POSTGRES_DB WITH (FORCE);" \
  -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"
log_info "✅ 已重建空库 $POSTGRES_DB"

# ---- 6. 导入备份 ----
log_info "导入备份 $FILE ..."
gunzip -c "$LOCAL_FILE" | $DEV_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
log_info "✅ 导入完成"

# ---- 7. 验证 ----
log_info "验证导入结果..."
log_info "users 表行数："
$DEV_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM users;"
log_info "pg_trgm 扩展："
$DEV_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT extname FROM pg_extension WHERE extname='pg_trgm';"

log_info "🎉 恢复完成！备份: ${LOCAL_FILE}，.env 已备份: ${ENV_BAK}"
log_info "重启本地环境: ./dev-start.sh up"
log_warn "仅同步了数据库；若需查看上传图片，请另行同步服务器 uploads 目录。"
