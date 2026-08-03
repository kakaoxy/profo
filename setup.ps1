<#
.SYNOPSIS
  Profo 项目初始化脚本（Windows / PowerShell 版）

.DESCRIPTION
  与 setup.sh 功能对等的 Windows 实现：
    1. 检查 .env 配置（缺失时引导运行 init-env.ps1）
    2. 启动 PostgreSQL（Docker）并等待就绪
    3. 创建数据库表（backend/init_db.py）
    4. 初始化角色 + 管理员账户（backend/init_admin.py）
    5. 支持自定义管理员密码（-AdminPassword）或重置密码（-ResetAdmin）

  模式:
    本地开发（默认）  使用 backend\.venv\Scripts\python.exe 直连 127.0.0.1:5432
    Docker 生产       使用 docker compose exec backend，容器内直连 db:5432

  运行方式（任选其一）：
    1. 双击 setup.bat（推荐，自动绕过执行策略）
    2. PowerShell 中：powershell -ExecutionPolicy Bypass -File .\setup.ps1
    3. 已放行执行策略时：.\setup.ps1

  关键适配点（与 setup.sh 一致）：
    - settings.py 用 env_file=".env"（相对 CWD），BaseSettings 默认 extra="forbid"
    - .env 中的 POSTGRES_USER/PASSWORD/DB 不是 Settings 字段，直接读 .env 会报 extra_forbidden
    - 解法：从 backend/ 目录运行 Python（无 .env 文件），所有配置通过 env vars 注入
    - 本地开发还需覆盖 DATABASE_URL：.env 中写的是容器主机名 db，宿主机解析不了

  与 setup.sh 的差异：
    - 临时密码生成与强度校验改用 .NET RNG / PowerShell 正则，不依赖系统 python3
    - Docker 模式下宿主机 env vars 不会自动透传到容器（与 setup.sh 同样的限制）；
      本地模式（默认）无此问题，python 是 PowerShell 子进程，继承 env

.EXAMPLE
  .\setup.ps1                              全量初始化（自动生成管理员临时密码）
  .\setup.ps1 -AdminPassword 'P@ssw0rd'    使用指定密码创建/重置管理员
  .\setup.ps1 -ResetAdmin                  仅重置管理员密码（自动生成新临时密码）
  .\setup.ps1 -Docker                      在 Docker 容器内执行（生产环境）
  .\setup.ps1 -SkipDb                      跳过 DB 启动（已在别处启动时使用）
  .\setup.ps1 -Help                        查看帮助
#>

[CmdletBinding()]
param(
  [string]$AdminPassword = '',
  [switch]$ResetAdmin,
  [switch]$Docker,
  [switch]$SkipDb,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

# 控制台 UTF-8 输出，避免中文乱码（PS 5.1 默认 GBK）
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8

# ---------- 路径定位（兼容从任意目录调用） ----------
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$EnvFile = '.env'
$BackendDir = 'backend'
$DevCompose = 'docker compose -f docker-compose.yml -f docker-compose.dev.yml'
$ProdCompose = 'docker compose'

if ($Help) {
  Get-Help $MyInvocation.MyCommand.Path -Detailed
  exit 0
}

# -AdminPassword 隐含 -ResetAdmin 语义（如果 admin 已存在则重置）
if ($AdminPassword) { $ResetAdmin = $true }

# ---------- 颜色输出 ----------
function Write-Info([string]$msg)    { Write-Host "i  $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-WarnMsg([string]$msg) { Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Die([string]$msg)     { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }
function Write-Step([string]$msg)    { Write-Host "`n=== $msg ===" -ForegroundColor White }

# ---------- 从 .env 读取变量 ----------
function Read-EnvVar {
  param([string]$Key)
  if (-not (Test-Path $EnvFile)) { return '' }
  $path = (Resolve-Path $EnvFile).Path
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  $m = [regex]::Match($text, "(?m)^" + [regex]::Escape($Key) + "=(.*)$")
  if (-not $m.Success) { return '' }
  $val = $m.Groups[1].Value.TrimEnd("`r")
  if ($val.Length -ge 2 -and $val[0] -eq '"' -and $val[-1] -eq '"') {
    $val = $val.Substring(1, $val.Length - 2)
  } elseif ($val.Length -ge 2 -and $val[0] -eq "'" -and $val[-1] -eq "'") {
    $val = $val.Substring(1, $val.Length - 2)
  }
  return $val
}

function Test-Placeholder {
  param([string]$Val)
  if ([string]::IsNullOrEmpty($Val)) { return $true }
  if ($Val -match '请替换') { return $true }
  if ($Val -eq 'CHANGE_ME') { return $true }
  return $false
}

# ========== 1. 检查 .env ==========
Write-Step "1/4 检查环境配置"

if (-not (Test-Path $EnvFile)) {
  Write-Die "未找到 $EnvFile，请先运行: .\init-env.ps1"
}

$PostgresUser = Read-EnvVar 'POSTGRES_USER'
$PostgresPassword = Read-EnvVar 'POSTGRES_PASSWORD'
$PostgresDb = Read-EnvVar 'POSTGRES_DB'

if (Test-Placeholder $PostgresPassword) {
  Write-Die "POSTGRES_PASSWORD 仍为占位符，请先运行: .\init-env.ps1"
}

Write-Ok ".env 配置正常 (POSTGRES_USER=$PostgresUser, POSTGRES_DB=$PostgresDb)"

# ========== 2. 启动并等待数据库 ==========
Write-Step "2/4 启动数据库"

if ($SkipDb) {
  Write-Info "已跳过 DB 启动（-SkipDb）"
} elseif ($Docker) {
  Write-Info "Docker 模式：假定 db 容器已由 docker compose up 启动"
  $dbPs = (Invoke-Expression "$ProdCompose ps db 2>`$null" | Out-String)
  if ($dbPs -notmatch '\bdb\b') {
    Write-WarnMsg "未检测到 db 容器，请确认已启动: docker compose up -d db"
  }
} else {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Die "未找到 docker，请先安装 Docker Desktop"
  }
  Write-Info "启动 PostgreSQL (Docker dev)..."
  Invoke-Expression "$DevCompose up -d db"
  if ($LASTEXITCODE -ne 0) {
    Write-Die "启动 db 失败"
  }
}

# 等待数据库就绪
function Wait-DbReady {
  param([int]$MaxWait = 30)
  $waited = 0
  while ($waited -lt $MaxWait) {
    if ($Docker) {
      $null = Invoke-Expression "$ProdCompose exec -T db pg_isready -U `"$PostgresUser`" -d `"$PostgresDb`" 2>`$null"
      if ($LASTEXITCODE -eq 0) { return $true }
    } else {
      # 本地：优先用 pg_isready，不可用则用 docker exec
      $pgIsReady = Get-Command pg_isready -ErrorAction SilentlyContinue
      if ($pgIsReady) {
        & pg_isready -h 127.0.0.1 -p 5432 -U $PostgresUser -d $PostgresDb 2>$null
        if ($LASTEXITCODE -eq 0) { return $true }
      }
      $null = Invoke-Expression "$DevCompose exec -T db pg_isready -U `"$PostgresUser`" -d `"$PostgresDb`" 2>`$null"
      if ($LASTEXITCODE -eq 0) { return $true }
    }
    Start-Sleep -Seconds 1
    $waited++
  }
  return $false
}

Write-Info "等待数据库就绪..."
if (-not (Wait-DbReady)) {
  Write-Die "数据库 30s 内未就绪，请检查: docker compose logs db"
}
Write-Ok "数据库已就绪"

# ========== 3. 构造 Python 执行环境 ==========
$pyExePath = $null
if ($Docker) {
  # 容器内 CWD=/app，.env 由 docker-compose env_file 加载，DATABASE_URL 由 environment 覆盖
} else {
  $pyExePath = Join-Path $RootDir "$BackendDir\.venv\Scripts\python.exe"
  if (-not (Test-Path $pyExePath)) {
    Write-Die "未找到 $BackendDir\.venv，请先安装: cd backend; uv sync"
  }

  # 从 .env 读取 Settings 必需的字段并导出（pydantic-settings 优先读 env vars）
  $env:DATABASE_URL = "postgresql+psycopg://${PostgresUser}:${PostgresPassword}@127.0.0.1:5432/${PostgresDb}"
  $env:JWT_SECRET_KEY = Read-EnvVar 'JWT_SECRET_KEY'
  $env:ENCRYPTION_KEY = Read-EnvVar 'ENCRYPTION_KEY'
  $env:WECHAT_APPID = Read-EnvVar 'WECHAT_APPID'
  $env:WECHAT_SECRET = Read-EnvVar 'WECHAT_SECRET'
  $env:DEBUG = 'false'

  # 校验必需变量是否仍为占位符
  foreach ($v in @('JWT_SECRET_KEY', 'ENCRYPTION_KEY')) {
    if (Test-Placeholder (Read-EnvVar $v)) {
      Write-Die "$v 仍为占位符，请先运行: .\init-env.ps1"
    }
  }
}

# 便捷函数：在正确的环境下执行 backend 目录中的 Python 脚本
# 输出直通控制台；调用方可通过 $LASTEXITCODE 判断退出码
function Invoke-BackendScript {
  param([string]$Script)
  # 临时放宽 EAP：脚本写入 stderr 的告警不应触发终止
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Docker) {
      Invoke-Expression "$ProdCompose exec -T backend python $Script"
    } else {
      Push-Location $BackendDir
      try {
        & $pyExePath $Script
      } finally {
        Pop-Location
      }
    }
  } finally {
    $ErrorActionPreference = $prevEAP
  }
}

# 便捷函数：执行 Python 代码片段（用于密码重置等内联逻辑）
# 注意：PS 5.1 的 stdin 管道对 native exe 有编码/分块问题，
#       改用临时文件方案更可靠（与 setup.sh 的 stdin 方式不同但等价）
# 返回 hashtable: @{ Output = [string]; ExitCode = [int] }
function Invoke-BackendStdin {
  param([string]$Code)
  $tempName = "profo_setup_$([guid]::NewGuid().ToString('N').Substring(0,8)).py"
  $hostTemp = [IO.Path]::Combine([IO.Path]::GetTempPath(), $tempName)
  try {
    # 写入临时文件（UTF-8 无 BOM，Python 默认按 UTF-8 读取）
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($hostTemp, $Code, $utf8NoBom)

    if ($Docker) {
      # 容器内执行：先把临时文件复制到容器，再执行，最后清理
      $containerPath = "/tmp/$tempName"
      $composeParts = $ProdCompose.Split(' ')
      & $composeParts[0] $composeParts[1..($composeParts.Length-1)] cp "$hostTemp" "backend:$containerPath" 2>&1 | Out-Null
      $output = Invoke-Expression "$ProdCompose exec -T backend python $containerPath" 2>&1
      $exitCode = $LASTEXITCODE
      Invoke-Expression "$ProdCompose exec -T backend rm -f $containerPath" 2>&1 | Out-Null
      return @{ Output = ($output | Out-String); ExitCode = $exitCode }
    } else {
      # 临时放宽 EAP：Python 写入 stderr 的告警/traceback 不应触发终止
      $prevEAP = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      Push-Location $BackendDir
      try {
        $output = & $pyExePath $hostTemp 2>&1
        $exitCode = $LASTEXITCODE
      } finally {
        Pop-Location
        $ErrorActionPreference = $prevEAP
      }
      return @{ Output = ($output | Out-String); ExitCode = $exitCode }
    }
  } finally {
    Remove-Item $hostTemp -ErrorAction SilentlyContinue
  }
}

# ========== 4. 初始化数据库表 ==========
Write-Step "3/4 初始化数据库表"

Write-Info "执行 init_db.py（创建表）..."
Invoke-BackendScript 'init_db.py'
if ($LASTEXITCODE -ne 0) {
  Write-Die "init_db.py 执行失败"
}
Write-Ok "数据库表已创建"

# ========== 5. 初始化管理员 ==========
Write-Step "4/4 初始化管理员"

# 生成临时密码（符合密码策略：大小写+数字+特殊字符，≥8位）
# 使用 .NET RNG，不依赖系统 python3（与 setup.sh 不同）
function New-TempPassword {
  $alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#`$%^&*"
  $sb = New-Object Text.StringBuilder
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 1
  for ($i = 0; $i -lt 16; $i++) {
    $rng.GetBytes($bytes)
    $idx = $bytes[0] % $alpha.Length
    [void]$sb.Append($alpha[$idx])
  }
  $pw = $sb.ToString()
  # 确保包含各类字符
  $hasUpper = $pw -cmatch '[A-Z]'
  $hasLower = $pw -cmatch '[a-z]'
  $hasDigit = $pw -match '\d'
  $hasSpecial = $pw -match '[!@#$%^&*]'
  if (-not ($hasUpper -and $hasLower -and $hasDigit -and $hasSpecial)) {
    $pw = "Aa1!" + $pw
  }
  return $pw
}

# 校验密码强度（复用后端 validate_password_strength 的策略）
# 返回 $null 表示通过；返回字符串为错误消息
function Test-PasswordStrength {
  param([string]$Pw)
  if ($Pw.Length -lt 8) { return "密码长度必须至少为8个字符" }
  if ($Pw -cnotmatch '[A-Z]') { return "密码必须包含至少一个大写字母" }
  if ($Pw -cnotmatch '[a-z]') { return "密码必须包含至少一个小写字母" }
  if ($Pw -notmatch '\d') { return "密码必须包含至少一个数字" }
  if ($Pw -notmatch '[!@#$%^&*(),.?":{}|<>]') { return '密码必须包含至少一个特殊字符 (!@#$%^&*(),.?":{}|<>)' }
  return $null
}

# 检查 admin 是否已存在（用于判断是否为首次初始化）
$checkScript = @'
import sys; sys.path.insert(0, ".")
from db import SessionLocal
from models import User
db = SessionLocal()
admin = db.query(User).filter(User.username == "admin").first()
print("YES" if admin else "NO")
db.close()
'@

Write-Info "检查管理员账户状态..."
$checkResult = Invoke-BackendStdin $checkScript
$adminExistsBefore = (($checkResult.Output -split "`r?`n") -contains 'YES')

# 初始化角色 + 管理员（幂等：已存在则跳过）
Write-Info "执行 init_admin.py（创建角色 + 管理员）..."
Invoke-BackendScript 'init_admin.py'

# 判断是否需要设置密码
#   - 首次创建（admin 之前不存在）→ 必须设置密码（init_admin.py 生成的随机密码不对外暴露）
#   - -ResetAdmin / -AdminPassword → 强制重置
#   - admin 已存在且无重置请求 → 跳过
$needSetPassword = $false
if (-not $adminExistsBefore) { $needSetPassword = $true }
if ($ResetAdmin) { $needSetPassword = $true }

$tempPassword = ''
if ($needSetPassword) {
  # 确定目标密码
  if ($AdminPassword) {
    # 校验自定义密码强度
    $pwErr = Test-PasswordStrength $AdminPassword
    if ($pwErr) {
      Write-Host $pwErr -ForegroundColor Red
      Write-Die "自定义管理员密码不符合强度要求"
    }
    $targetPassword = $AdminPassword
    if ($adminExistsBefore) {
      Write-Info "使用自定义密码重置管理员..."
    } else {
      Write-Info "使用自定义密码设置管理员..."
    }
  } else {
    $targetPassword = New-TempPassword
    if ($adminExistsBefore) {
      Write-Info "生成新临时密码重置管理员..."
    } else {
      Write-Info "生成临时密码..."
    }
  }

  # 通过 stdin 执行密码设置脚本
  # 用环境变量传密码，避免在命令行或脚本中明文暴露
  $env:PROFO_RESET_PASSWORD = $targetPassword

  $resetScript = @'
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
'@

  $resetResult = Invoke-BackendStdin $resetScript
  Remove-Item Env:\PROFO_RESET_PASSWORD -ErrorAction SilentlyContinue

  if (($resetResult.Output -split "`r?`n") -contains 'OK') {
    Write-Ok "管理员密码已设置"
    $tempPassword = $targetPassword
  } else {
    Write-Host $resetResult.Output
    Write-Die "管理员密码设置失败"
  }
}

# ========== 6. 输出摘要 ==========
Write-Host ""
Write-Host "=========================================="
Write-Host "  Profo 初始化完成" -ForegroundColor Green
Write-Host "=========================================="
Write-Host "  数据库:      $PostgresUser@$PostgresDb"
if ($Docker) {
  Write-Host "  运行模式:      Docker 生产"
} else {
  Write-Host "  运行模式:      本地开发 (127.0.0.1:5432)"
}
Write-Host ""
if ($tempPassword) {
  Write-Host "  管理员凭据"
  Write-Host "  用户名:        admin"
  Write-Host "  密码:          $tempPassword" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  [!]  请立即保存此密码，首次登录后必须修改" -ForegroundColor Red
} else {
  if ($ResetAdmin) {
    Write-WarnMsg "未能获取管理员密码，请检查上方输出"
  } else {
    Write-Info "管理员账户已存在（密码未变更）"
  }
}
Write-Host "=========================================="
