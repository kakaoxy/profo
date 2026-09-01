@echo off
REM ====================================================================
REM Profo .env 密钥初始化（Windows 包装器）
REM 双击运行入口，自动绕过 PowerShell 执行策略调用 init-env.ps1
REM
REM 用法（在项目根目录执行）:
REM   scripts\init-env.bat            智能初始化（仅替换占位符）
REM   scripts\init-env.bat -Show      显示完整密钥（默认打码）
REM   scripts\init-env.bat -Force     强制覆盖所有密钥
REM   scripts\init-env.bat -Help      查看帮助
REM ====================================================================

chcp 65001 > nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0init-env.ps1" %*
exit /b %ERRORLEVEL%
