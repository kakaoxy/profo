#!/bin/bash
# Profo 一键生成密钥并初始化 .env
#
# 适配点：
#   1. .env 不存在时自动从 .env.docker.example 复制模板
#   2. 仅替换占位符/空值；已设置的真实密钥默认保留（避免覆盖 ENCRYPTION_KEY 导致已加密数据无法解密）
#   3. DATABASE_URL 仍含 CHANGE_ME 时自动用新密码同步
#   4. macOS / Linux 便携 sed
#   5. 默认打码输出，--show 显示完整密钥
#   6. --force 强制覆盖所有密钥（危险，需显式确认）
#
# 用法:
#   ./init-env.sh            智能初始化（仅替换占位符）
#   ./init-env.sh --show     显示完整密钥（默认打码）
#   ./init-env.sh --force    强制覆盖所有密钥
#   ./init-env.sh --help     查看帮助

set -euo pipefail

# ---------- 路径定位（兼容从任意目录调用） ----------
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
TEMPLATE_FILE=".env.docker.example"

# ---------- 参数解析 ----------
SHOW_SECRETS=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --show)  SHOW_SECRETS=true ;;
    --force) FORCE=true ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "❌ 未知参数: ${arg}（查看 --help）"
      exit 1
      ;;
  esac
done

# ---------- 工具检测 ----------
command -v openssl >/dev/null || { echo "❌ 未找到 openssl，请先安装"; exit 1; }

# 便携 sed：macOS 的 sed -i 需要空串参数
if [[ "$(uname)" == "Darwin" ]]; then
  SED_INPLACE=(sed -i '')
else
  SED_INPLACE=(sed -i)
fi

# ---------- 颜色 ----------
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_DIM=""; C_RESET=""
fi

info()  { printf "%sℹ%s  %s\n" "$C_CYAN" "$C_RESET" "$1"; }
ok()    { printf "%s✅%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn()  { printf "%s⚠️%s  %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
die()   { printf "%s❌%s %s\n" "$C_RED" "$C_RESET" "$1" >&2; exit 1; }

# ---------- 1. 确保 .env 存在 ----------
JUST_CREATED=false
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$TEMPLATE_FILE" ]; then
    cp "$TEMPLATE_FILE" "$ENV_FILE"
    JUST_CREATED=true
    ok "未检测到 .env，已从 $TEMPLATE_FILE 复制创建"
  else
    die "未找到 .env 与 $TEMPLATE_FILE，无法初始化"
  fi
fi

# ---------- 2. 备份（仅当 .env 不是刚从模板创建） ----------
BACKUP_FILE=""
if [ "$JUST_CREATED" = false ]; then
  BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "$BACKUP_FILE"
  info "已备份原 .env → $BACKUP_FILE"
fi

# ---------- 3. 读取当前值与占位符判定 ----------
# 读 .env 中某个 key 的值（去掉行首尾空白与首尾引号）
read_env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | \
    sed -E "s/^${key}=//; s/^\"//; s/\"$//; s/^'//; s/'$//" || true
}

# 判定是否为“未设置”的占位符（中文占位、CHANGE_ME、YOUR_*_PLACEHOLDER、空）
is_placeholder() {
  local val="$1"
  [ -z "$val" ] && return 0
  [[ "$val" == *"请替换"* ]] && return 0
  [[ "$val" == "CHANGE_ME" ]] && return 0
  [[ "$val" == *"YOUR_"*"_PLACEHOLDER"* ]] && return 0
  [[ "$val" == *"PLACEHOLDER"* ]] && return 0
  return 1
}

# 原地更新某 key 的值（保留行内位置；若 key 不存在则追加到文件末尾）
upsert_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    "${SED_INPLACE[@]}" "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# ---------- 4. 生成密钥 ----------
gen_postgres_pass() {
  # 24 位，仅字母数字（避免 URL 保留字符）
  openssl rand -base64 24 | tr -d '/+=' | head -c 24
}

gen_jwt_secret() {
  # 64 位 hex
  openssl rand -hex 32
}

gen_fernet_key() {
  # 优先用 cryptography 生成合法 Fernet 密钥
  if command -v python3 >/dev/null; then
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null && return
  fi
  # 备用：32 字节随机 → url-safe base64（Fernet 要求的格式）
  python3 -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())" 2>/dev/null && return
  # 再备用：openssl 拼接（可能少一个 padding，补 =）
  openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n' | head -c 43
  printf '='
}

# ---------- 5. 逐个处理密钥 ----------
# 返回值: 0=跳过(已设置且非占位), 1=需要更新
process_key() {
  local key="$1" gen_fn="$2" label="$3"
  local current
  current="$(read_env_var "$key")"

  if [ "$FORCE" = true ]; then
    local new_val
    new_val="$("$gen_fn")"
    upsert_env "$key" "$new_val"
    printf "  %s%-20s%s %s\n" "$C_DIM" "$label" "$C_RESET" "$(mask "$new_val")"
    return
  fi

  if is_placeholder "$current"; then
    local new_val
    new_val="$("$gen_fn")"
    upsert_env "$key" "$new_val"
    printf "  %s%-20s%s %s\n" "$C_DIM" "$label" "$C_RESET" "$(mask "$new_val")"
  else
    # 已设置且非占位 → 保留
    printf "  %s%-20s%s %s %s(已保留)%s\n" "$C_DIM" "$label" "$C_RESET" "$(mask "$current")" "$C_YELLOW" "$C_RESET"
  fi
}

# ---------- 6. 打码 / 完整输出 ----------
mask() {
  local val="$1"
  if [ "$SHOW_SECRETS" = true ]; then
    printf '%s' "$val"
    return
  fi
  local len=${#val}
  if [ "$len" -le 8 ]; then
    printf '****'
  elif [ "$len" -le 16 ]; then
    printf '%s****%s' "${val:0:4}" "${val: -2}"
  else
    printf '%s...%s' "${val:0:8}" "${val: -4}"
  fi
}

echo ""
echo "=== Profo .env 密钥初始化 ==="
if [ "$FORCE" = true ]; then
  warn "⚠️  --force 模式：将覆盖所有密钥（包括已设置的 ENCRYPTION_KEY）"
  warn "    如果数据库已有加密数据，覆盖 ENCRYPTION_KEY 会导致无法解密！"
  printf "确认继续？[y/N] "
  read -r confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "已取消"; exit 0; }
fi

process_key "POSTGRES_PASSWORD" gen_postgres_pass "POSTGRES_PASSWORD"
process_key "JWT_SECRET_KEY"    gen_jwt_secret    "JWT_SECRET_KEY"
process_key "ENCRYPTION_KEY"    gen_fernet_key    "ENCRYPTION_KEY"

# ---------- 7. 同步 DATABASE_URL 中的占位密码 ----------
DB_URL="$(read_env_var DATABASE_URL)"
if [[ "$DB_URL" == *"CHANGE_ME"* ]]; then
  PG_PASS="$(read_env_var POSTGRES_PASSWORD)"
  PG_USER="$(read_env_var POSTGRES_USER)"
  PG_DB="$(read_env_var POSTGRES_DB)"
  if [ -n "$PG_PASS" ] && [ -n "$PG_USER" ] && [ -n "$PG_DB" ]; then
    NEW_URL="postgresql+psycopg://${PG_USER}:${PG_PASS}@db:5432/${PG_DB}"
    upsert_env "DATABASE_URL" "$NEW_URL"
    info "DATABASE_URL 仍含 CHANGE_ME，已用新密码同步"
  fi
fi

# ---------- 8. 摘要 ----------
echo ""
if [ "$SHOW_SECRETS" = false ]; then
  info "默认打码显示，查看完整密钥: ./init-env.sh --show"
fi
if [ -n "$BACKUP_FILE" ]; then
  info "原 .env 已备份: $BACKUP_FILE"
else
  info ".env 为本次新建，未做备份"
fi
ok "完成"
