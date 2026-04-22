#!/bin/bash
# ProFo 房地产翻新与销售管理系统 - 一键初始化脚本 (Linux/macOS)
# ============================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 打印带颜色的信息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查 Python 版本 (需要 >= 3.10)
check_python_version() {
    if command_exists python3; then
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_CMD="python"
    else
        print_error "未找到 Python，请安装 Python 3.10 或更高版本"
        exit 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
    MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

    if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 10 ]); then
        print_error "Python 版本需要 >= 3.10，当前版本: $PYTHON_VERSION"
        exit 1
    fi

    print_success "Python 版本检查通过: $PYTHON_VERSION"
}

# 检查并安装 uv
setup_uv() {
    print_step "步骤 1/7: 检查 uv 包管理器"

    if command_exists uv; then
        print_success "uv 已安装: $(uv --version)"
    else
        print_info "正在安装 uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh

        # 重新加载 shell 配置
        if [ -f "$HOME/.cargo/env" ]; then
            source "$HOME/.cargo/env"
        fi

        # 检查 uv 是否可用
        if command_exists uv; then
            print_success "uv 安装成功: $(uv --version)"
        else
            print_error "uv 安装失败，请手动安装: https://docs.astral.sh/uv/getting-started/installation/"
            exit 1
        fi
    fi
}

# 检查并安装 pnpm
setup_pnpm() {
    print_step "步骤 2/7: 检查 pnpm 包管理器"

    if command_exists pnpm; then
        print_success "pnpm 已安装: $(pnpm --version)"
    else
        print_info "正在安装 pnpm..."
        curl -fsSL https://get.pnpm.io/install.sh | sh -

        # 重新加载 shell 配置
        if [ -f "$HOME/.bashrc" ]; then
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"
        fi

        if command_exists pnpm; then
            print_success "pnpm 安装成功: $(pnpm --version)"
        else
            print_error "pnpm 安装失败，请手动安装: https://pnpm.io/installation"
            exit 1
        fi
    fi
}

# 创建环境变量文件
setup_env_files() {
    print_step "步骤 3/7: 配置环境变量"

    # 后端环境变量
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        print_info "创建后端 .env 文件..."

        # 生成随机 JWT 密钥
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)

        cat > "$BACKEND_DIR/.env" << EOF
# JWT配置（⚠️ 安全警告）
# 生产环境必须设置强密钥
JWT_SECRET_KEY=${JWT_SECRET}
jwt_secret_key=${JWT_SECRET}

# 数据库配置
DATABASE_URL=sqlite:///./data.db

# 微信配置（可选，如需微信登录请填写）
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret

# API配置
API_PREFIX=/api
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]

# 文件上传配置
MAX_UPLOAD_SIZE=104857600
ALLOWED_EXTENSIONS=[".csv", ".xls", ".xlsx", ".pdf", ".png", ".jpg", ".jpeg"]

# 分页配置
DEFAULT_PAGE_SIZE=50
MAX_PAGE_SIZE=1000

# JWT过期时间
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# 调试模式（开发环境）
DEBUG=true
EOF
        print_success "后端 .env 文件已创建"
    else
        print_warning "后端 .env 文件已存在，跳过创建"
    fi

    # 前端环境变量
    if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
        print_info "创建前端 .env.local 文件..."

        cat > "$FRONTEND_DIR/.env.local" << EOF
# 后端 API 基础 URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
EOF
        print_success "前端 .env.local 文件已创建"
    else
        print_warning "前端 .env.local 文件已存在，跳过创建"
    fi
}

# 安装后端依赖
install_backend_deps() {
    print_step "步骤 4/7: 安装后端依赖"

    cd "$BACKEND_DIR"

    print_info "正在使用 uv 安装 Python 依赖..."
    uv sync

    print_success "后端依赖安装完成"
}

# 安装前端依赖
install_frontend_deps() {
    print_step "步骤 5/7: 安装前端依赖"

    cd "$FRONTEND_DIR"

    print_info "正在使用 pnpm 安装 Node.js 依赖..."
    pnpm install

    print_success "前端依赖安装完成"
}

# 初始化数据库
init_database() {
    print_step "步骤 6/7: 初始化数据库"

    cd "$BACKEND_DIR"

    print_info "正在创建数据库表..."
    uv run python init_db.py

    print_success "数据库初始化完成"
}

# 初始化管理员账号
init_admin() {
    print_step "步骤 7/7: 初始化管理员账号"

    cd "$BACKEND_DIR"

    print_info "正在创建默认角色和管理员用户..."
    uv run python init_admin.py

    print_success "管理员账号初始化完成"
}

# 显示完成信息
show_completion_info() {
    echo -e "\n"
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              🎉 ProFo 系统初始化完成！                        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo -e "\n"

    echo -e "${CYAN}📋 项目信息:${NC}"
    echo -e "   项目名称: ProFo 房地产翻新与销售管理系统"
    echo -e "   项目路径: $PROJECT_ROOT"
    echo -e ""

    echo -e "${CYAN}🔧 默认管理员账号:${NC}"
    echo -e "   用户名: ${GREEN}admin${NC}"
    echo -e "   密码: ${GREEN}admin123${NC}"
    echo -e "   角色: 管理员"
    echo -e ""

    echo -e "${CYAN}🚀 启动命令:${NC}"
    echo -e "   1. 启动后端服务:"
    echo -e "      ${YELLOW}cd backend && uv run uvicorn main:app --reload${NC}"
    echo -e ""
    echo -e "   2. 启动前端服务:"
    echo -e "      ${YELLOW}cd frontend && pnpm dev${NC}"
    echo -e ""

    echo -e "${CYAN}🌐 访问地址:${NC}"
    echo -e "   前端: ${GREEN}http://localhost:3000${NC}"
    echo -e "   后端 API: ${GREEN}http://127.0.0.1:8000${NC}"
    echo -e "   API 文档: ${GREEN}http://127.0.0.1:8000/docs${NC}"
    echo -e ""

    echo -e "${CYAN}📁 重要文件:${NC}"
    echo -e "   后端配置: $BACKEND_DIR/.env"
    echo -e "   前端配置: $FRONTEND_DIR/.env.local"
    echo -e "   数据库: $BACKEND_DIR/data.db"
    echo -e ""

    echo -e "${YELLOW}💡 提示:${NC}"
    echo -e "   - 首次启动后请使用管理员账号登录"
    echo -e "   - 生产环境请修改 JWT_SECRET_KEY 和默认密码"
    echo -e "   - 微信登录功能需要配置 WECHAT_APPID 和 WECHAT_SECRET"
    echo -e ""
}

# 主函数
main() {
    echo -e "\n"
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     ProFo 房地产翻新与销售管理系统 - 初始化脚本              ║${NC}"
    echo -e "${CYAN}║                    版本: 1.0.0                               ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo -e "\n"

    # 检查 Python 版本
    check_python_version

    # 步骤执行
    setup_uv
    setup_pnpm
    setup_env_files
    install_backend_deps
    install_frontend_deps
    init_database
    init_admin

    # 显示完成信息
    show_completion_info
}

# 捕获错误
trap 'print_error "初始化过程中发生错误，请检查上述输出信息"' ERR

# 执行主函数
main
