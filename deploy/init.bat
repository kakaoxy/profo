@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ProFo 房地产翻新与销售管理系统 - 一键初始化脚本 (Windows)
:: ============================================================

set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "FRONTEND_DIR=%PROJECT_ROOT%\frontend"

:: 设置颜色代码
set "RED=[31m"
set "GREEN=[32m"
set "YELLOW=[33m"
set "BLUE=[34m"
set "CYAN=[36m"
set "NC=[0m"

goto :main

:: 打印信息函数
:print_info
    echo [%BLUE%INFO%NC%] %~1
    goto :eof

:print_success
    echo [%GREEN%SUCCESS%NC%] %~1
    goto :eof

:print_warning
    echo [%YELLOW%WARNING%NC%] %~1
    goto :eof

:print_error
    echo [%RED%ERROR%NC%] %~1
    goto :eof

:print_step
    echo.
    echo [%CYAN%========================================%NC%]
    echo [%CYAN%  %~1%NC%]
    echo [%CYAN%========================================%NC%]
    echo.
    goto :eof

:: 检查命令是否存在
:command_exists
    where /q "%~1"
    if errorlevel 1 (
        exit /b 1
    ) else (
        exit /b 0
    )
    goto :eof

:: 检查 Python 版本
:check_python_version
    call :print_step "前置检查: Python 版本"

    :: 尝试查找 Python
    set "PYTHON_CMD="

    python --version >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=python"
    ) else (
        python3 --version >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_CMD=python3"
        ) else (
            py --version >nul 2>&1
            if !errorlevel! equ 0 (
                set "PYTHON_CMD=py"
            )
        )
    )

    if "!PYTHON_CMD!"=="" (
        call :print_error "未找到 Python，请安装 Python 3.10 或更高版本"
        call :print_info "下载地址: https://www.python.org/downloads/"
        exit /b 1
    )

    :: 获取 Python 版本
    for /f "tokens=2 delims= " %%a in ('!PYTHON_CMD! --version 2^>^&1') do (
        set "PYTHON_VERSION=%%a"
    )

    :: 解析版本号
    for /f "tokens=1,2 delims=." %%a in ("!PYTHON_VERSION!") do (
        set "MAJOR=%%a"
        set "MINOR=%%b"
    )

    :: 检查版本
    if !MAJOR! lss 3 (
        call :print_error "Python 版本需要 ^>= 3.10，当前版本: !PYTHON_VERSION!"
        exit /b 1
    )
    if !MAJOR! equ 3 (
        if !MINOR! lss 10 (
            call :print_error "Python 版本需要 ^>= 3.10，当前版本: !PYTHON_VERSION!"
            exit /b 1
        )
    )

    call :print_success "Python 版本检查通过: !PYTHON_VERSION!"
    set "GLOBAL_PYTHON_CMD=!PYTHON_CMD!"
    goto :eof

:: 检查并安装 uv
:setup_uv
    call :print_step "步骤 1/7: 检查 uv 包管理器"

    call :command_exists uv
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%a in ('uv --version') do (
            call :print_success "uv 已安装: %%a"
        )
    ) else (
        call :print_info "正在安装 uv..."
        powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"

        :: 刷新环境变量
        call :refresh_env

        call :command_exists uv
        if !errorlevel! equ 0 (
            for /f "tokens=*" %%a in ('uv --version') do (
                call :print_success "uv 安装成功: %%a"
            )
        ) else (
            call :print_error "uv 安装失败，请手动安装: https://docs.astral.sh/uv/getting-started/installation/"
            exit /b 1
        )
    )
    goto :eof

:: 检查并安装 pnpm
:setup_pnpm
    call :print_step "步骤 2/7: 检查 pnpm 包管理器"

    call :command_exists pnpm
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%a in ('pnpm --version') do (
            call :print_success "pnpm 已安装: %%a"
        )
    ) else (
        call :print_info "正在安装 pnpm..."
        powershell -ExecutionPolicy Bypass -Command "irm https://get.pnpm.io/install.ps1 | iex"

        :: 刷新环境变量
        call :refresh_env

        :: 添加 pnpm 到 PATH
        if exist "%LOCALAPPDATA%\pnpm\pnpm.exe" (
            set "PATH=%LOCALAPPDATA%\pnpm;%PATH%"
        )

        call :command_exists pnpm
        if !errorlevel! equ 0 (
            for /f "tokens=*" %%a in ('pnpm --version') do (
                call :print_success "pnpm 安装成功: %%a"
            )
        ) else (
            call :print_error "pnpm 安装失败，请手动安装: https://pnpm.io/installation"
            exit /b 1
        )
    )
    goto :eof

:: 刷新环境变量
:refresh_env
    for /f "tokens=*" %%a in ('path') do (
        set "PATH=%%a"
    )
    goto :eof

:: 生成随机字符串
:generate_random
    set "RESULT="
    for /l %%i in (1,1,32) do (
        set /a "R=!random! %% 62"
        for %%j in (!R!) do (
            if %%j lss 10 (
                set "C=%%j"
            ) else if %%j lss 36 (
                set /a "N=%%j + 55"
                for /f %%k in ('cmd /c exit /b !N!') do set "C=%%k"
            ) else (
                set /a "N=%%j + 61"
                for /f %%k in ('cmd /c exit /b !N!') do set "C=%%k"
            )
        )
        set "RESULT=!RESULT!!C!"
    )
    set "%1=!RESULT!"
    goto :eof

:: 创建环境变量文件
:setup_env_files
    call :print_step "步骤 3/7: 配置环境变量"

    :: 后端环境变量
    if not exist "%BACKEND_DIR%\.env" (
        call :print_info "创建后端 .env 文件..."

        :: 生成随机 JWT 密钥
        call :generate_random JWT_SECRET

        (
            echo # JWT配置（⚠️ 安全警告）
            echo # 生产环境必须设置强密钥
            echo JWT_SECRET_KEY=!JWT_SECRET!
            echo jwt_secret_key=!JWT_SECRET!
            echo.
            echo # 数据库配置
            echo DATABASE_URL=sqlite:///./data.db
            echo.
            echo # 微信配置（可选，如需微信登录请填写）
            echo WECHAT_APPID=your-wechat-appid
            echo WECHAT_SECRET=your-wechat-secret
            echo.
            echo # API配置
            echo API_PREFIX=/api
            echo CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
            echo.
            echo # 文件上传配置
            echo MAX_UPLOAD_SIZE=104857600
            echo ALLOWED_EXTENSIONS=[".csv", ".xls", ".xlsx", ".pdf", ".png", ".jpg", ".jpeg"]
            echo.
            echo # 分页配置
            echo DEFAULT_PAGE_SIZE=50
            echo MAX_PAGE_SIZE=1000
            echo.
            echo # JWT过期时间
            echo JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
            echo JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
            echo.
            echo # 调试模式（开发环境）
            echo DEBUG=true
        ) > "%BACKEND_DIR%\.env"

        call :print_success "后端 .env 文件已创建"
    ) else (
        call :print_warning "后端 .env 文件已存在，跳过创建"
    )

    :: 前端环境变量
    if not exist "%FRONTEND_DIR%\.env.local" (
        call :print_info "创建前端 .env.local 文件..."

        (
            echo # 后端 API 基础 URL
            echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
        ) > "%FRONTEND_DIR%\.env.local"

        call :print_success "前端 .env.local 文件已创建"
    ) else (
        call :print_warning "前端 .env.local 文件已存在，跳过创建"
    )
    goto :eof

:: 安装后端依赖
:install_backend_deps
    call :print_step "步骤 4/7: 安装后端依赖"

    cd /d "%BACKEND_DIR%"

    call :print_info "正在使用 uv 安装 Python 依赖..."
    uv sync

    if errorlevel 1 (
        call :print_error "后端依赖安装失败"
        exit /b 1
    )

    call :print_success "后端依赖安装完成"
    goto :eof

:: 安装前端依赖
:install_frontend_deps
    call :print_step "步骤 5/7: 安装前端依赖"

    cd /d "%FRONTEND_DIR%"

    call :print_info "正在使用 pnpm 安装 Node.js 依赖..."
    pnpm install

    if errorlevel 1 (
        call :print_error "前端依赖安装失败"
        exit /b 1
    )

    call :print_success "前端依赖安装完成"
    goto :eof

:: 初始化数据库
:init_database
    call :print_step "步骤 6/7: 初始化数据库"

    cd /d "%BACKEND_DIR%"

    call :print_info "正在创建数据库表..."
    uv run python init_db.py

    if errorlevel 1 (
        call :print_error "数据库初始化失败"
        exit /b 1
    )

    call :print_success "数据库初始化完成"
    goto :eof

:: 初始化管理员账号
:init_admin
    call :print_step "步骤 7/7: 初始化管理员账号"

    cd /d "%BACKEND_DIR%"

    call :print_info "正在创建默认角色和管理员用户..."
    uv run python init_admin.py

    if errorlevel 1 (
        call :print_error "管理员账号初始化失败"
        exit /b 1
    )

    call :print_success "管理员账号初始化完成"
    goto :eof

:: 显示完成信息
:show_completion_info
    echo.
    echo [%GREEN%╔══════════════════════════════════════════════════════════════╗%NC%]
    echo [%GREEN%║              🎉 ProFo 系统初始化完成！                        ║%NC%]
    echo [%GREEN%╚══════════════════════════════════════════════════════════════╝%NC%]
    echo.

    echo [%CYAN%📋 项目信息:%NC%]
    echo    项目名称: ProFo 房地产翻新与销售管理系统
    echo    项目路径: %PROJECT_ROOT%
    echo.

    echo [%CYAN%🔧 默认管理员账号:%NC%]
    echo    用户名: [%GREEN%admin%NC%]
    echo    密码: [%GREEN%admin123%NC%]
    echo    角色: 管理员
    echo.

    echo [%CYAN%🚀 启动命令:%NC%]
    echo    1. 启动后端服务:
    echo       [%YELLOW%cd backend ^&^& uv run uvicorn main:app --reload%NC%]
    echo.
    echo    2. 启动前端服务:
    echo       [%YELLOW%cd frontend ^&^& pnpm dev%NC%]
    echo.

    echo [%CYAN%🌐 访问地址:%NC%]
    echo    前端: [%GREEN%http://localhost:3000%NC%]
    echo    后端 API: [%GREEN%http://127.0.0.1:8000%NC%]
    echo    API 文档: [%GREEN%http://127.0.0.1:8000/docs%NC%]
    echo.

    echo [%CYAN%📁 重要文件:%NC%]
    echo    后端配置: %BACKEND_DIR%\.env
    echo    前端配置: %FRONTEND_DIR%\.env.local
    echo    数据库: %BACKEND_DIR%\data.db
    echo.

    echo [%YELLOW%💡 提示:%NC%]
    echo    - 首次启动后请使用管理员账号登录
    echo    - 生产环境请修改 JWT_SECRET_KEY 和默认密码
    echo    - 微信登录功能需要配置 WECHAT_APPID 和 WECHAT_SECRET
    echo.
    goto :eof

:: 主函数
:main
    echo.
    echo [%CYAN%╔══════════════════════════════════════════════════════════════╗%NC%]
    echo [%CYAN%║     ProFo 房地产翻新与销售管理系统 - 初始化脚本              ║%NC%]
    echo [%CYAN%║                    版本: 1.0.0                               ║%NC%]
    echo [%CYAN%╚══════════════════════════════════════════════════════════════╝%NC%]
    echo.

    :: 检查 Python 版本
    call :check_python_version
    if errorlevel 1 exit /b 1

    :: 步骤执行
    call :setup_uv
    if errorlevel 1 exit /b 1

    call :setup_pnpm
    if errorlevel 1 exit /b 1

    call :setup_env_files
    if errorlevel 1 exit /b 1

    call :install_backend_deps
    if errorlevel 1 exit /b 1

    call :install_frontend_deps
    if errorlevel 1 exit /b 1

    call :init_database
    if errorlevel 1 exit /b 1

    call :init_admin
    if errorlevel 1 exit /b 1

    :: 显示完成信息
    call :show_completion_info

    endlocal
    goto :eof
