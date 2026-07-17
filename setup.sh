#!/bin/bash
# Profo 项目初始化脚本
#
# 功能:
#   1. 检查 .env 配置（缺失时引导运行 init-env.sh）
#   2. 启动 PostgreSQL（Docker）并等待就绪
#   3. 创建数据库表（backend/init_db.py）
#   4. 初始化角色 + 管理员账户（backend/init_admin.py）
#   5. 支持自定义管理员密码（--admin-password）或重置密码（--reset-admin）
#
# 模式:
#   本地开发（默认）  使用 backend/.venv/bin/python 直连 127.0.0.1:5432
#   Docker 生产       使用 docker compose exec backend，容器内直连 db:5432
#
# 用法:
#   ./setup.sh                              全量初始化（自动生成管理员临时密码）
#   ./setup.sh --admin-password 'P@ssw0rd'  使用指定密码创建/重置管理员
#   ./setup.sh --reset-admin                仅重置管理员密码（自动生成新临时密码）
#   ./setup.sh --docker                     在 Docker 容器内执行（生产环境）
#   ./setup.sh --skip-db                    跳过 DB 启动（已在别处启动时使用）
#   ./setup.sh --help                       查看帮助

set -euo pipefail

# ---------- 路径定位 ----------
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
BACKEND_DIR="backend"
DEV_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
PROD_COMPOSE="docker compose"

# ---------- 颜色 ----------
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_DIM=""; C_BOLD=""; C_RESET=""
fi

info()  { printf "%sℹ%s  %s\n" "$C_CYAN" "$C_RESET" "$1"; }
ok()    { printf "%s✅%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn()  { printf "%s⚠️%s  %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
die()   { printf "%s❌%s %s\n" "$C_RED" "$C_RESET" "$1" >&2; exit 1; }
step()  { printf "\n%s=== %s ===%s\n" "$C_BOLD" "$1" "$C_RESET"; }

# ---------- 参数解析 ----------
ADMIN_PASSWORD=""
RESET_ADMIN=false
DOCKER_MODE=false
SKIP_DB=false
while [ $# -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --admin-password)
      shift
      [ $# -eq 0 ] && die "--admin-password 需要一个参数"
      ADMIN_PASSWORD="$1"
      ;;
    --admin-password=*)
      ADMIN_PASSWORD="${arg#*=}"
      ;;
    --reset-admin) RESET_ADMIN=true ;;
    --docker)      DOCKER_MODE=true ;;
    --skip-db)     SKIP_DB=true ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      die "未知参数: ${arg}（查看 --help）"
      ;;
  esac
  shift
done

# --admin-password 隐含 --reset-admin 语义（如果 admin 已存在则重置）
if [ -n "$ADMIN_PASSWORD" ]; then
  RESET_ADMIN=true
fi

# ---------- 从 .env 读取变量 ----------
read_env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | \
    sed -E "s/^${key}=//; s/^\"//; s/\"$//; s/^'//; s/'$//" || true
}

# ========== 1. 检查 .env ==========
step "1/4 检查环境配置"

if [ ! -f "$ENV_FILE" ]; then
  die "未找到 ${ENV_FILE}，请先运行: ./init-env.sh"
fi

POSTGRES_USER="$(read_env_var POSTGRES_USER)"
POSTGRES_PASSWORD="$(read_env_var POSTGRES_PASSWORD)"
POSTGRES_DB="$(read_env_var POSTGRES_DB)"

# 简单校验：是否仍为占位符
is_placeholder() {
  local val="$1"
  [ -z "$val" ] && return 0
  [[ "$val" == *"请替换"* ]] && return 0
  [[ "$val" == "CHANGE_ME" ]] && return 0
  return 1
}

if is_placeholder "$POSTGRES_PASSWORD"; then
  die "POSTGRES_PASSWORD 仍为占位符，请先运行: ./init-env.sh"
fi

ok ".env 配置正常 (POSTGRES_USER=${POSTGRES_USER}, POSTGRES_DB=${POSTGRES_DB})"

# ========== 2. 启动并等待数据库 ==========
step "2/4 启动数据库"

if [ "$SKIP_DB" = true ]; then
  info "已跳过 DB 启动（--skip-db）"
elif [ "$DOCKER_MODE" = true ]; then
  info "Docker 模式：假定 db 容器已由 docker compose up 启动"
  $PROD_COMPOSE ps db 2>/dev/null | grep -q "db" || warn "未检测到 db 容器，请确认已启动: docker compose up -d db"
else
  # 本地开发：用 dev compose 启动 db（暴露 5432 到宿主）
  if ! command -v docker >/dev/null; then
    die "未找到 docker，请先安装 Docker Desktop"
  fi
  info "启动 PostgreSQL (Docker dev)..."
  $DEV_COMPOSE up -d db
fi

# 等待数据库就绪
wait_db_ready() {
  local max_wait=30
  local waited=0
  if [ "$DOCKER_MODE" = true ]; then
    # 生产：在 db 容器内执行 pg_isready
    while [ "$waited" -lt "$max_wait" ]; do
      if $PROD_COMPOSE exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        return 0
      fi
      sleep 1; waited=$((waited + 1))
    done
  else
    # 本地：优先用 pg_isready，不可用则用 docker exec
    while [ "$waited" -lt "$max_wait" ]; do
      if pg_isready -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        return 0
      fi
      if $DEV_COMPOSE exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        return 0
      fi
      sleep 1; waited=$((waited + 1))
    done
  fi
  return 1
}

info "等待数据库就绪..."
if ! wait_db_ready; then
  die "数据库 30s 内未就绪，请检查: docker compose logs db"
fi
ok "数据库已就绪"

# ========== 3. 构造 Python 执行环境 ==========
# 关键适配点：
#   - settings.py 用 env_file=".env"（相对 CWD），且 BaseSettings 默认 extra="forbid"
#   - .env 中的 POSTGRES_USER/PASSWORD/DB 不是 Settings 字段，直接读 .env 会报 extra_forbidden
#   - 解法：从 backend/ 目录运行 Python（无 .env 文件），所有配置通过 env vars 注入
#     （env vars 中的 extra 字段会被 pydantic-settings 忽略，不报错）
#   - 本地开发还需覆盖 DATABASE_URL：.env 中写的是容器主机名 db，宿主机解析不了
if [ "$DOCKER_MODE" = true ]; then
  # 容器内 CWD=/app，.env 由 docker-compose env_file 加载，DATABASE_URL 由 environment 覆盖
  PY_EXEC="$PROD_COMPOSE exec -T backend python"
else
  if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
    die "未找到 ${BACKEND_DIR}/.venv，请先安装: cd backend && uv sync"
  fi
  PY_BIN="$ROOT_DIR/$BACKEND_DIR/.venv/bin/python"

  # 从 .env 读取 Settings 必需的字段并导出（pydantic-settings 优先读 env vars）
  export DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
  export JWT_SECRET_KEY="$(read_env_var JWT_SECRET_KEY)"
  export ENCRYPTION_KEY="$(read_env_var ENCRYPTION_KEY)"
  export WECHAT_APPID="$(read_env_var WECHAT_APPID)"
  export WECHAT_SECRET="$(read_env_var WECHAT_SECRET)"
  export DEBUG=false

  # 校验必需变量是否仍为占位符
  for v in JWT_SECRET_KEY ENCRYPTION_KEY; do
    if is_placeholder "$(read_env_var "$v")"; then
      die "${v} 仍为占位符，请先运行: ./init-env.sh"
    fi
  done
fi

# 便捷函数：在正确的环境下执行 backend 目录中的 Python 脚本
run_backend_script() {
  local script="$1"
  if [ "$DOCKER_MODE" = true ]; then
    $PROD_COMPOSE exec -T backend python "$script"
  else
    (cd "$BACKEND_DIR" && "$PY_BIN" "$script")
  fi
}

# 便捷函数：通过 stdin 执行 Python 代码片段（用于密码重置等内联逻辑）
run_backend_stdin() {
  if [ "$DOCKER_MODE" = true ]; then
    $PROD_COMPOSE exec -T backend python -
  else
    (cd "$BACKEND_DIR" && "$PY_BIN" -)
  fi
}

# ========== 4. 初始化数据库表 ==========
step "3/4 初始化数据库表"

info "执行 init_db.py（创建表）..."
run_backend_script "init_db.py"
ok "数据库表已创建"

# ========== 5. 初始化管理员 ==========
step "4/4 初始化管理员"

# 生成临时密码（符合密码策略：大小写+数字+特殊字符，≥8位）
gen_temp_password() {
  python3 - <<'PYEOF'
import secrets, string
alpha = string.ascii_letters + string.digits + "!@#$%^&*"
pw = ''.join(secrets.choice(alpha) for _ in range(16))
# 确保包含各类字符
has_upper = any(c.isupper() for c in pw)
has_lower = any(c.islower() for c in pw)
has_digit = any(c.isdigit() for c in pw)
has_special = any(c in "!@#$%^&*" for c in pw)
if not (has_upper and has_lower and has_digit and has_special):
    pw = "Aa1!" + pw
print(pw)
PYEOF
}

# 校验密码强度（复用后端 validate_password_strength 的策略）
validate_password() {
  local pw="$1"
  python3 - "$pw" <<'PYEOF'
import sys, re
pw = sys.argv[1]
if len(pw) < 8:
    print("密码长度必须至少为8个字符"); sys.exit(1)
if not re.search(r"[A-Z]", pw):
    print("密码必须包含至少一个大写字母"); sys.exit(1)
if not re.search(r"[a-z]", pw):
    print("密码必须包含至少一个小写字母"); sys.exit(1)
if not re.search(r"\d", pw):
    print("密码必须包含至少一个数字"); sys.exit(1)
if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", pw):
    print('密码必须包含至少一个特殊字符 (!@#$%^&*(),.?":{}|<>)'); sys.exit(1)
sys.exit(0)
PYEOF
}

# 检查 admin 是否已存在（用于判断是否为首次初始化）
check_admin_exists() {
  local check_script='import sys; sys.path.insert(0, ".")
from db import SessionLocal
from models import User
db = SessionLocal()
admin = db.query(User).filter(User.username == "admin").first()
print("YES" if admin else "NO")
db.close()'
  echo "$check_script" | run_backend_stdin 2>&1 | grep -q "^YES$"
}

info "检查管理员账户状态..."
ADMIN_EXISTS_BEFORE=false
if check_admin_exists; then
  ADMIN_EXISTS_BEFORE=true
fi

# 初始化角色 + 管理员（幂等：已存在则跳过）
info "执行 init_admin.py（创建角色 + 管理员）..."
run_backend_script "init_admin.py" 2>&1 || true

# 判断是否需要设置密码
#   - 首次创建（admin 之前不存在）→ 必须设置密码（init_admin.py 生成的随机密码不对外暴露）
#   - --reset-admin / --admin-password → 强制重置
#   - admin 已存在且无重置请求 → 跳过
NEED_SET_PASSWORD=false
if [ "$ADMIN_EXISTS_BEFORE" = false ]; then
  NEED_SET_PASSWORD=true
fi
if [ "$RESET_ADMIN" = true ]; then
  NEED_SET_PASSWORD=true
fi

TEMP_PASSWORD=""
if [ "$NEED_SET_PASSWORD" = true ]; then
  # 确定目标密码
  if [ -n "$ADMIN_PASSWORD" ]; then
    # 校验自定义密码强度
    if ! validate_password "$ADMIN_PASSWORD"; then
      die "自定义管理员密码不符合强度要求"
    fi
    TARGET_PASSWORD="$ADMIN_PASSWORD"
    if [ "$ADMIN_EXISTS_BEFORE" = true ]; then
      info "使用自定义密码重置管理员..."
    else
      info "使用自定义密码设置管理员..."
    fi
  else
    TARGET_PASSWORD="$(gen_temp_password)"
    if [ "$ADMIN_EXISTS_BEFORE" = true ]; then
      info "生成新临时密码重置管理员..."
    else
      info "生成临时密码..."
    fi
  fi

  # 通过 stdin 执行密码设置脚本
  # 用环境变量传密码，避免在命令行或脚本中明文暴露
  export PROFO_RESET_PASSWORD="$TARGET_PASSWORD"
  RESET_SCRIPT=$(cat <<'PYEOF'
import os
import sys
from db import SessionLocal
from models import User
from utils.auth import get_password_hash

new_password = os.environ["PROFO_RESET_PASSWORD"]

db = SessionLocal()
try:
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        print("ERROR: admin 用户不存在")
        sys.exit(1)
    admin.password = get_password_hash(new_password)
    admin.must_change_password = True
    admin.token_version = admin.token_version + 1
    db.commit()
    print("OK")
finally:
    db.close()
PYEOF
)
  RESET_RESULT=$(echo "$RESET_SCRIPT" | run_backend_stdin 2>&1) || true
  unset PROFO_RESET_PASSWORD

  if echo "$RESET_RESULT" | grep -q "^OK$"; then
    ok "管理员密码已设置"
    TEMP_PASSWORD="$TARGET_PASSWORD"
  else
    echo "$RESET_RESULT"
    die "管理员密码设置失败"
  fi
fi

# ========== 6. 输出摘要 ==========
echo ""
echo "=========================================="
echo "  ${C_BOLD}${C_GREEN}Profo 初始化完成${C_RESET}"
echo "=========================================="
echo "  ${C_DIM}数据库:${C_RESET}      ${POSTGRES_USER}@${POSTGRES_DB}"
if [ "$DOCKER_MODE" = true ]; then
  echo "  ${C_DIM}运行模式:${C_RESET}      Docker 生产"
else
  echo "  ${C_DIM}运行模式:${C_RESET}      本地开发 (127.0.0.1:5432)"
fi
echo ""
if [ -n "$TEMP_PASSWORD" ]; then
  echo "  ${C_BOLD}管理员凭据${C_RESET}"
  echo "  ${C_DIM}用户名:${C_RESET}        admin"
  echo "  ${C_DIM}密码:${C_RESET}          ${C_YELLOW}${TEMP_PASSWORD}${C_RESET}"
  echo ""
  echo "  ${C_RED}⚠️  请立即保存此密码，首次登录后必须修改${C_RESET}"
else
  if [ "$RESET_ADMIN" = true ]; then
    warn "未能获取管理员密码，请检查上方输出"
  else
    info "管理员账户已存在（密码未变更）"
  fi
fi
echo "=========================================="
