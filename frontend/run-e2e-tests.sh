#!/bin/bash

# 房源管理系统 E2E 测试运行脚本
# 此脚本会启动后端和前端服务，然后运行 Playwright 测试

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 清理函数
cleanup() {
    log_info "正在清理进程..."
    
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        log_info "后端服务已停止"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        log_info "前端服务已停止"
    fi
    
    # 清理端口
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}

# 设置退出时清理
trap cleanup EXIT

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    # 检查 Python
    if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
        log_error "Python 未安装"
        exit 1
    fi
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    
    log_success "依赖检查通过"
}

# 安装依赖
install_dependencies() {
    log_info "安装依赖..."
    
    # 安装前端依赖
    log_info "安装前端依赖..."
    npm ci
    
    # 安装 Playwright 浏览器
    log_info "安装 Playwright 浏览器..."
    npx playwright install
    
    # 安装后端依赖
    log_info "安装后端依赖..."
    cd ../backend
    pip install -e .
    cd ../frontend
    
    log_success "依赖安装完成"
}

# 启动后端服务
start_backend() {
    log_info "启动后端服务..."
    
    cd ../backend
    python start_server.py &
    BACKEND_PID=$!
    cd ../frontend
    
    # 等待后端服务启动
    log_info "等待后端服务启动..."
    timeout 60 bash -c 'until curl -f http://localhost:8000/health 2>/dev/null; do sleep 2; done'
    
    if [ $? -eq 0 ]; then
        log_success "后端服务启动成功 (PID: $BACKEND_PID)"
    else
        log_error "后端服务启动失败"
        exit 1
    fi
}

# 启动前端服务
start_frontend() {
    log_info "启动前端服务..."
    
    npm run dev &
    FRONTEND_PID=$!
    
    # 等待前端服务启动
    log_info "等待前端服务启动..."
    timeout 60 bash -c 'until curl -f http://localhost:3000 2>/dev/null; do sleep 2; done'
    
    if [ $? -eq 0 ]; then
        log_success "前端服务启动成功 (PID: $FRONTEND_PID)"
    else
        log_error "前端服务启动失败"
        exit 1
    fi
}

# 运行测试
run_tests() {
    log_info "运行 E2E 测试..."
    
    # 解析命令行参数
    TEST_ARGS=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --headed)
                TEST_ARGS="$TEST_ARGS --headed"
                shift
                ;;
            --debug)
                TEST_ARGS="$TEST_ARGS --debug"
                shift
                ;;
            --ui)
                TEST_ARGS="$TEST_ARGS --ui"
                shift
                ;;
            --browser=*)
                BROWSER="${1#*=}"
                TEST_ARGS="$TEST_ARGS --project=$BROWSER"
                shift
                ;;
            --spec=*)
                SPEC="${1#*=}"
                TEST_ARGS="$TEST_ARGS $SPEC"
                shift
                ;;
            *)
                TEST_ARGS="$TEST_ARGS $1"
                shift
                ;;
        esac
    done
    
    # 运行测试
    if npx playwright test $TEST_ARGS; then
        log_success "所有测试通过！"
        
        # 生成测试报告
        log_info "生成测试报告..."
        npx playwright show-report --host 0.0.0.0 &
        REPORT_PID=$!
        
        log_success "测试报告已生成，访问 http://localhost:9323 查看"
        log_info "按 Ctrl+C 退出"
        
        # 等待用户中断
        wait $REPORT_PID
    else
        log_error "测试失败"
        
        # 显示失败的测试报告
        log_info "生成失败测试报告..."
        npx playwright show-report --host 0.0.0.0 &
        REPORT_PID=$!
        
        log_warning "测试报告已生成，访问 http://localhost:9323 查看失败详情"
        
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo "房源管理系统 E2E 测试运行脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --headed              在有头模式下运行测试（显示浏览器窗口）"
    echo "  --debug               在调试模式下运行测试"
    echo "  --ui                  在 UI 模式下运行测试"
    echo "  --browser=BROWSER     指定浏览器 (chromium, firefox, webkit)"
    echo "  --spec=SPEC           运行特定的测试文件"
    echo "  --install             只安装依赖，不运行测试"
    echo "  --help                显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    运行所有测试"
    echo "  $0 --headed           在有头模式下运行测试"
    echo "  $0 --browser=firefox  只在 Firefox 中运行测试"
    echo "  $0 --spec=auth.spec.js 只运行认证测试"
}

# 主函数
main() {
    log_info "房源管理系统 E2E 测试启动"
    
    # 检查帮助参数
    if [[ "$1" == "--help" ]]; then
        show_help
        exit 0
    fi
    
    # 检查安装参数
    if [[ "$1" == "--install" ]]; then
        check_dependencies
        install_dependencies
        log_success "依赖安装完成"
        exit 0
    fi
    
    # 检查依赖
    check_dependencies
    
    # 安装依赖
    install_dependencies
    
    # 启动服务
    start_backend
    start_frontend
    
    # 运行测试
    run_tests "$@"
}

# 运行主函数
main "$@"
