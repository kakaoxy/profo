<#
.SYNOPSIS
  Profo 一键生成密钥并初始化 .env（Windows / PowerShell 版）

.DESCRIPTION
  与 init-env.sh 功能对等的 Windows 实现：
    1. .env 不存在时自动从 .env.docker.example 复制模板
    2. 仅替换占位符/空值；已设置的真实密钥默认保留（避免覆盖 ENCRYPTION_KEY 导致已加密数据无法解密）
    3. DATABASE_URL 仍含 CHANGE_ME 时自动用新密码同步
    4. REDIS_URL 仍含占位符时自动用新密码同步（redis://:PASS@redis:6379/0）
    5. 纯 .NET 生成密钥，不依赖 openssl
    6. 默认打码输出，-Show 显示完整密钥
    7. -Force 强制覆盖所有密钥（危险，需显式确认）

  运行方式（任选其一，在项目根目录执行）：
    1. 双击 scripts\init-env.bat（推荐，自动绕过执行策略）
    2. PowerShell 中：powershell -ExecutionPolicy Bypass -File .\scripts\init-env.ps1
    3. 已放行执行策略时：.\scripts\init-env.ps1

.EXAMPLE
  .\scripts\init-env.ps1            智能初始化（仅替换占位符）
  .\scripts\init-env.ps1 -Show      显示完整密钥（默认打码）
  .\scripts\init-env.ps1 -Force     强制覆盖所有密钥
  .\scripts\init-env.ps1 -Help      查看帮助
#>

[CmdletBinding()]
param(
  [switch] $Show,
  [switch] $Force,
  [switch] $Help
)

$ErrorActionPreference = 'Stop'

# 控制台 UTF-8 输出，避免中文/emoji 乱码（PS 5.1 默认 GBK）
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8

# ---------- 路径定位（脚本位于 scripts\，项目根为其父目录；兼容从任意目录调用） ----------
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

$EnvFile = '.env'
$TemplateFile = '.env.docker.example'

if ($Help) {
  Get-Help $MyInvocation.MyCommand.Path -Detailed
  exit 0
}

# ---------- 颜色输出 ----------
function Write-Info([string]$msg)    { Write-Host "i  $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-WarnMsg([string]$msg) { Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Die([string]$msg)     { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

# ---------- 1. 确保 .env 存在 ----------
$JustCreated = $false
if (-not (Test-Path $EnvFile)) {
  if (Test-Path $TemplateFile) {
    Copy-Item $TemplateFile $EnvFile
    $JustCreated = $true
    Write-Ok "未检测到 .env，已从 $TemplateFile 复制创建"
  } else {
    Write-Die "未找到 .env 与 $TemplateFile，无法初始化"
  }
}

# ---------- 2. 备份（仅当 .env 不是刚从模板创建） ----------
$BackupFile = ''
if (-not $JustCreated) {
  $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
  $BackupFile = "$EnvFile.backup.$ts"
  Copy-Item $EnvFile $BackupFile
  Write-Info "已备份原 .env -> $BackupFile"
}

# ---------- 3. .env 读写与占位符判定 ----------
# 读 .env 中某个 key 的值（去掉行首尾空白与首尾引号）
function Read-EnvVar {
  param([string]$Key)
  if (-not (Test-Path $EnvFile)) { return '' }
  $path = (Resolve-Path $EnvFile).Path
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  $m = [regex]::Match($text, "(?m)^" + [regex]::Escape($Key) + "=(.*)$")
  if (-not $m.Success) { return '' }
  $val = $m.Groups[1].Value.TrimEnd("`r")
  # 去掉首尾引号
  if ($val.Length -ge 2 -and $val[0] -eq '"' -and $val[-1] -eq '"') {
    $val = $val.Substring(1, $val.Length - 2)
  } elseif ($val.Length -ge 2 -and $val[0] -eq "'" -and $val[-1] -eq "'") {
    $val = $val.Substring(1, $val.Length - 2)
  }
  return $val
}

# 判定是否为"未设置"的占位符（中文占位、CHANGE_ME、YOUR_*_PLACEHOLDER、空）
function Test-Placeholder {
  param([string]$Val)
  if ([string]::IsNullOrEmpty($Val)) { return $true }
  if ($Val -match '请替换') { return $true }
  if ($Val -eq 'CHANGE_ME') { return $true }
  if ($Val -match 'YOUR_[A-Z_]+_PLACEHOLDER') { return $true }
  if ($Val -match 'PLACEHOLDER') { return $true }
  return $false
}

# 原地更新某 key 的值（保留行内位置；若 key 不存在则追加到文件末尾）
# 自动保留原文件换行符（CRLF / LF）
function Update-EnvFile {
  param([string]$Key, [string]$Val)
  $path = (Resolve-Path $EnvFile).Path
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)

  # 检测原文件换行符
  $newline = "`r`n"
  if ($text.Length -gt 0 -and -not $text.Contains("`r`n") -and $text.Contains("`n")) {
    $newline = "`n"
  }

  $lines = $text -split "`r?`n"
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^" + [regex]::Escape($Key) + "=") {
      $lines[$i] = "$Key=$Val"
      $found = $true
      break
    }
  }

  if (-not $found) {
    # key 不存在，追加到文件末尾（确保前面有换行）
    if ($lines.Count -gt 0 -and $lines[-1] -ne '') {
      $lines += "$Key=$Val"
    } else {
      if ($lines.Count -eq 0) { $lines = @() }
      if ($lines.Count -gt 0) { $lines[-1] = "$Key=$Val" } else { $lines += "$Key=$Val" }
    }
  }

  $newText = $lines -join $newline
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($path, $newText, $utf8NoBom)
}

# ---------- 4. 密钥生成（纯 .NET，不依赖 openssl） ----------
function New-RandomBytes {
  param([int]$Length)
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return $bytes
}

function New-PostgresPass {
  # 24 位，仅字母数字（避免 URL 保留字符）
  $bytes = New-RandomBytes 32
  $b64 = [Convert]::ToBase64String($bytes)
  $clean = $b64 -replace '[/+=]', ''
  return $clean.Substring(0, [Math]::Min(24, $clean.Length))
}

function New-JwtSecret {
  # 64 位 hex
  $bytes = New-RandomBytes 32
  $sb = New-Object Text.StringBuilder
  foreach ($b in $bytes) { [void]$sb.Append($b.ToString('x2')) }
  return $sb.ToString()
}

function New-FernetKey {
  # 优先用 Python cryptography 生成合法 Fernet 密钥
  foreach ($pyName in @('python', 'python3', 'py')) {
    $py = Get-Command $pyName -ErrorAction SilentlyContinue
    if (-not $py) { continue }
    try {
      $key = & $pyName -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>$null
      if ($LASTEXITCODE -eq 0 -and $key) { return $key.Trim() }
    } catch {}
    try {
      $key = & $pyName -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())" 2>$null
      if ($LASTEXITCODE -eq 0 -and $key) { return $key.Trim() }
    } catch {}
  }
  # 备用：.NET 生成 32 字节 url-safe base64（Fernet 要求格式，44 字符带 padding）
  $bytes = New-RandomBytes 32
  $b64 = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
  return $b64
}

# ---------- 5. 打码 / 完整输出 ----------
function Get-Masked {
  param([string]$Val)
  if ($Show) { return $Val }
  $len = $Val.Length
  if ($len -le 8) { return '****' }
  elseif ($len -le 16) { return $Val.Substring(0, 4) + '****' + $Val.Substring($len - 2, 2) }
  else { return $Val.Substring(0, 8) + '...' + $Val.Substring($len - 4, 4) }
}

# ---------- 6. 逐个处理密钥 ----------
function Invoke-ProcessKey {
  param(
    [string]$Key,
    [scriptblock]$GenFn,
    [string]$Label
  )
  $current = Read-EnvVar -Key $Key

  if ($Force) {
    $newVal = & $GenFn
    Update-EnvFile -Key $Key -Val $newVal
    Write-Host "  " -NoNewline
    Write-Host ("{0,-20}" -f $Label) -ForegroundColor DarkGray -NoNewline
    Write-Host " " -NoNewline
    Write-Host (Get-Masked $newVal)
    return
  }

  if (Test-Placeholder $current) {
    $newVal = & $GenFn
    Update-EnvFile -Key $Key -Val $newVal
    Write-Host "  " -NoNewline
    Write-Host ("{0,-20}" -f $Label) -ForegroundColor DarkGray -NoNewline
    Write-Host " " -NoNewline
    Write-Host (Get-Masked $newVal)
  } else {
    # 已设置且非占位 -> 保留
    Write-Host "  " -NoNewline
    Write-Host ("{0,-20}" -f $Label) -ForegroundColor DarkGray -NoNewline
    Write-Host " " -NoNewline
    Write-Host (Get-Masked $current) -NoNewline
    Write-Host " (已保留)" -ForegroundColor Yellow
  }
}

# ---------- 主流程 ----------
Write-Host ""
Write-Host "=== Profo .env 密钥初始化 ==="
if ($Force) {
  Write-WarnMsg "--force 模式：将覆盖所有密钥（包括已设置的 ENCRYPTION_KEY）"
  Write-WarnMsg "    如果数据库已有加密数据，覆盖 ENCRYPTION_KEY 会导致无法解密！"
  $confirm = Read-Host "确认继续？[y/N]"
  if ($confirm -notmatch '^[Yy]$') { Write-Info "已取消"; exit 0 }
}

Invoke-ProcessKey -Key "POSTGRES_PASSWORD" -GenFn { New-PostgresPass } -Label "POSTGRES_PASSWORD"
Invoke-ProcessKey -Key "JWT_SECRET_KEY"    -GenFn { New-JwtSecret }    -Label "JWT_SECRET_KEY"
Invoke-ProcessKey -Key "ENCRYPTION_KEY"    -GenFn { New-FernetKey }    -Label "ENCRYPTION_KEY"
Invoke-ProcessKey -Key "REDIS_PASSWORD"    -GenFn { New-PostgresPass } -Label "REDIS_PASSWORD"

# ---------- 7. 同步 DATABASE_URL（占位符或密码不一致时） ----------
$dbUrl = Read-EnvVar -Key "DATABASE_URL"
$pgPass = Read-EnvVar -Key "POSTGRES_PASSWORD"
$pgUser = Read-EnvVar -Key "POSTGRES_USER"
$pgDb = Read-EnvVar -Key "POSTGRES_DB"

# 从 DATABASE_URL 中提取密码部分：postgresql+psycopg://USER:PASS@HOST:PORT/DB
function Get-DbUrlPassword {
  param([string]$Url)
  if ($Url -match '^postgresql\+psycopg://[^:]+:([^@]+)@.*$') {
    return $matches[1]
  }
  return ''
}

$needUrlSync = $false
if ($dbUrl -match 'CHANGE_ME' -or $dbUrl -match '请替换') {
  $needUrlSync = $true
} elseif ($pgPass -and $dbUrl) {
  # 密码已设置但 URL 中密码与 POSTGRES_PASSWORD 不一致（--force 改密码后）
  $urlPass = Get-DbUrlPassword $dbUrl
  if ($urlPass -and $urlPass -ne $pgPass) {
    $needUrlSync = $true
  }
}

if ($needUrlSync -and $pgPass -and $pgUser -and $pgDb) {
  $newUrl = "postgresql+psycopg://${pgUser}:${pgPass}@db:5432/${pgDb}"
  Update-EnvFile -Key "DATABASE_URL" -Val $newUrl
  Write-Info "DATABASE_URL 已同步当前 POSTGRES_PASSWORD"
}

# ---------- 7.5 同步 REDIS_URL（占位符或密码不一致时） ----------
# docker-compose.yml 会用 ${REDIS_PASSWORD} 重新拼装 REDIS_URL 覆盖此值，
# 此处同步仅为保持 .env 自洽（本地直连 backend 时也能读到带密码的 URL）。
$redisUrl = Read-EnvVar -Key "REDIS_URL"
$redisPass = Read-EnvVar -Key "REDIS_PASSWORD"

# 从 REDIS_URL 中提取密码部分：redis://:PASS@HOST:PORT/DB
# 无密码 URL（redis://host:port/db）或空密码 URL（redis://:@host:port/db）返回空串
function Get-RedisUrlPassword {
  param([string]$Url)
  if ($Url -match '^redis://(:([^@]+)@)?.*$') {
    return $matches[2]
  }
  return ''
}

$needRedisSync = $false
if ($redisUrl -match '请替换' -or -not $redisUrl) {
  # 占位符或字段缺失（旧 .env 在 REDIS_URL 加入模板前创建）
  $needRedisSync = $true
} elseif ($redisPass -and $redisUrl) {
  # REDIS_URL 中密码与 REDIS_PASSWORD 不一致（含无密码占位的情况）
  $urlRedisPass = Get-RedisUrlPassword $redisUrl
  if ($urlRedisPass -ne $redisPass) {
    $needRedisSync = $true
  }
}

if ($needRedisSync -and $redisPass) {
  $newRedisUrl = "redis://:${redisPass}@redis:6379/0"
  Update-EnvFile -Key "REDIS_URL" -Val $newRedisUrl
  Write-Info "REDIS_URL 已同步当前 REDIS_PASSWORD"
}

# ---------- 8. 完整性校验 ----------
# 检查 .env 是否包含后端 Settings 所有必填字段（无默认值的字段）
# 缺失会导致后端启动时 Settings() 失败 -> sys.exit(1)
Write-Host ""
$missingFields = @()
foreach ($field in @('DATABASE_URL', 'JWT_SECRET_KEY', 'ENCRYPTION_KEY', 'WECHAT_APPID', 'WECHAT_SECRET',
                     'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
                     'REDIS_PASSWORD', 'REDIS_URL')) {
  $val = Read-EnvVar -Key $field
  if (-not $val) { $missingFields += $field }
}

if ($missingFields.Count -gt 0) {
  Write-WarnMsg "以下必填字段缺失（后端将无法启动）："
  foreach ($f in $missingFields) {
    Write-Host "  - $f" -ForegroundColor Red
  }
  Write-WarnMsg "请手动编辑 .env 补充，或检查 .env.docker.example 模板"
}

# ---------- 9. 摘要 ----------
Write-Host ""
if (-not $Show) {
  Write-Info "默认打码显示，查看完整密钥: .\scripts\init-env.ps1 -Show"
}
if ($BackupFile) {
  Write-Info "原 .env 已备份: $BackupFile"
} else {
  Write-Info ".env 为本次新建，未做备份"
}
Write-Ok "完成"
