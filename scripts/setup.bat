@echo off
REM ====================================================================
REM Profo 项目初始化（Windows 包装器）
REM 双击运行入口，自动绕过 PowerShell 执行策略调用 setup.ps1
REM
REM 用法（在项目根目录执行）:
REM   scripts\setup.bat                              全量初始化（自动生成管理员临时密码）
REM   scripts\setup.bat -AdminPassword "P@ssw0rd"    使用指定密码创建/重置管理员
REM   scripts\setup.bat -ResetAdmin                  仅重置管理员密码（自动生成新临时密码）
REM   scripts\setup.bat -Docker                      在 Docker 容器内执行（生产环境）
REM   scripts\setup.bat -SkipDb                      跳过 DB 启动（已在别处启动时使用）
REM   scripts\setup.bat -Help                        查看帮助
REM ====================================================================

chcp 65001 > nul
cd /d "%~dp0"

powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%
