@echo off
REM Recursion guard: start cmd /k creates a new process that inherits DEV_START_GUARD.
REM When serial calls go wrong, the new process detects this var and exits immediately.
if defined DEV_START_GUARD (
  echo [ERROR] dev-start.bat detected recursive call, aborted.
  echo    Possible cause: start cmd /k triggered a second dispatch in serial calls.
  exit /b 1
)
setlocal enabledelayedexpansion
set "DEV_START_GUARD=1"

REM ====================================================================
REM Profo local dev start/stop script (Windows)
REM
REM Architecture: Docker PostgreSQL + backend uvicorn --reload + frontend next dev
REM Frontend/backend auto-reload on code changes, no docker rebuild needed.
REM
REM Difference from start.bat:
REM   start.bat         production deploy, full rebuild, code changes need rebuild
REM   dev-start.bat     dev mode, only starts db container, backend/frontend run locally.
REM
REM Usage:
REM   dev-start.bat            start all (db + backend + frontend)
REM   dev-start.bat up         same as above
REM   dev-start.bat db         start database only (run backend/frontend in your own terminals)
REM   dev-start.bat stop       stop database container
REM   dev-start.bat status     show container and port status
REM   dev-start.bat logs       show database logs
REM   dev-start.bat down       stop and remove containers (keep data volumes)
REM ====================================================================

cd /d "%~dp0"

set "DEV_COMPOSE=docker compose -f docker-compose.yml -f docker-compose.dev.yml"

REM Bypass HTTP proxy (Clash/V2Ray etc.) intercepting local requests
REM Proxy software sets HTTP_PROXY, causing fetch 127.0.0.1:8000 to go through proxy -> 502
set "NO_PROXY=127.0.0.1,localhost,0.0.0.0"
set "no_proxy=127.0.0.1,localhost,0.0.0.0"

REM Check root .env
if not exist ".env" (
  echo [ERROR] Root .env not found
  echo    Run first: copy .env.docker.example .env and fill in POSTGRES_* credentials
  exit /b 1
)

REM Read POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB from .env
REM Disable delayed expansion to avoid corrupting special chars (!/&/^) in passwords
setlocal disabledelayedexpansion
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="
set "POSTGRES_DB="
set "REDIS_PASSWORD="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="POSTGRES_USER" set "POSTGRES_USER=%%b"
  if /i "%%a"=="POSTGRES_PASSWORD" set "POSTGRES_PASSWORD=%%b"
  if /i "%%a"=="POSTGRES_DB" set "POSTGRES_DB=%%b"
  if /i "%%a"=="REDIS_PASSWORD" set "REDIS_PASSWORD=%%b"
)

if not defined POSTGRES_USER (
  echo [ERROR] POSTGRES_USER not found in .env
  exit /b 1
)
if not defined POSTGRES_PASSWORD (
  echo [ERROR] POSTGRES_PASSWORD not found in .env
  exit /b 1
)
if not defined POSTGRES_DB (
  echo [ERROR] POSTGRES_DB not found in .env
  exit /b 1
)
if not defined REDIS_PASSWORD (
  echo [ERROR] REDIS_PASSWORD not found in .env
  echo    Run init-env.ps1 or init-env.bat to generate credentials
  exit /b 1
)

REM Local mode: backend connects directly to the Docker-exposed db
set "DATABASE_URL=postgresql+psycopg://%POSTGRES_USER%:%POSTGRES_PASSWORD%@127.0.0.1:5432/%POSTGRES_DB%"
set "REDIS_URL=redis://:%REDIS_PASSWORD%@127.0.0.1:6379/0"
set "DEBUG=true"
REM Override UPLOAD_DIR=/app/static/uploads (Docker in-container path) from .env
REM On Windows, Python Path("/app/...") resolves to current drive root (e.g. D:\app\static\uploads),
REM which mismatches the FastAPI static mount root backend/static, causing upload ok but preview 404.
REM Local dev explicitly points to the absolute path of backend/static/uploads,
REM matching main.py static mount root.
set "UPLOAD_DIR=%~dp0backend\static\uploads"
REM Export assembled results to outer scope (endlocal clears inner-scope vars)
endlocal & set "DATABASE_URL=%DATABASE_URL%" & set "REDIS_URL=%REDIS_URL%" & set "DEBUG=%DEBUG%" & set "UPLOAD_DIR=%UPLOAD_DIR%" & set "POSTGRES_USER=%POSTGRES_USER%" & set "POSTGRES_DB=%POSTGRES_DB%" & set "NO_PROXY=%NO_PROXY%" & set "no_proxy=%no_proxy%"

REM Check backend\.venv
if not exist "backend\.venv\Scripts\uvicorn.exe" (
  if not exist "backend\.venv\Scripts\uvicorn" (
    echo [ERROR] backend\.venv missing or uvicorn not found
    echo    Run: cd backend ^&^& uv sync
    exit /b 1
  )
)

REM Check frontend\node_modules
if not exist "frontend\node_modules" (
  echo [ERROR] frontend\node_modules not found, running pnpm install...
  pushd frontend
  call pnpm install
  popd
)

REM Create backend\static\uploads link -> ..\..\uploads
REM Local dev mode shares the same upload files with Docker
REM Windows requires admin or developer mode to create junction links
if not exist "backend\static" mkdir "backend\static"
if exist "backend\static\uploads" (
  REM Check if it is already a junction/symlink
  dir /al "backend\static\uploads" 2>nul | findstr "JUNCTION\|SYMLINK" > nul
  if errorlevel 1 (
    echo [WARN] backend\static\uploads is a real directory, not a junction
    echo    To share Docker uploads, delete it: rmdir /s /q backend\static\uploads
    echo    Current dev mode uses a separate local uploads dir, not shared with Docker
  )
) else (
  mklink /J "backend\static\uploads" "%~dp0uploads" > nul 2>&1
  if errorlevel 1 (
    echo [WARN] Failed to create junction, backend\static\uploads uses a standalone dir
    echo    To share, run manually: mklink /J backend\static\uploads ..\..\uploads
  ) else (
    echo [OK] Junction created backend\static\uploads -^> ..\..\uploads (shared uploads dir)
  )
)

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

if /i "%CMD%"=="up" goto :up
if /i "%CMD%"=="start" goto :up
if /i "%CMD%"=="db" goto :db
if /i "%CMD%"=="stop" goto :stop
if /i "%CMD%"=="status" goto :status
if /i "%CMD%"=="ps" goto :status
if /i "%CMD%"=="logs" goto :logs
if /i "%CMD%"=="down" goto :down
goto :usage

REM ====================================================================
REM Check if Docker daemon is running
REM ====================================================================
:check_docker
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker daemon is not running
  echo    Please start Docker Desktop and retry
  echo    Or check if Docker is installed correctly
  exit /b 1
)
goto :eof

REM ====================================================================
REM Port precheck: check if a given port is in use
REM Args: %1=port number %2=service name
REM ====================================================================
:check_port
set "PORT_NUM=%~1"
set "PORT_NAME=%~2"
netstat -ano | findstr "LISTENING" | findstr ":%PORT_NUM% " >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] Port %PORT_NUM% ^(%PORT_NAME%^) is already in use
  echo    Please terminate the process occupying this port, or check if a service is running
  netstat -ano | findstr "LISTENING" | findstr ":%PORT_NUM% "
  exit /b 1
)
exit /b 0

:start_db
call :check_docker
if errorlevel 1 exit /b 1
echo Starting PostgreSQL ^& Redis (Docker)...
%DEV_COMPOSE% up -d db redis
if errorlevel 1 (
  echo [ERROR] Failed to start database
  exit /b 1
)
echo [OK] Database started: postgresql+psycopg://%POSTGRES_USER%:***@127.0.0.1:5432/%POSTGRES_DB%
goto :eof

:up
REM Port precheck (db ports 5432/6379 managed by Docker, no need to check)
call :check_port 8000 "backend"
if errorlevel 1 exit /b 1
call :check_port 3000 "frontend"
if errorlevel 1 exit /b 1
call :start_db
if errorlevel 1 (
  echo [ERROR] Database start failed, backend/frontend not started
  exit /b 1
)
echo.
echo Starting backend (uvicorn --reload) and frontend (next dev)...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo   (Close this window to stop backend/frontend, database keeps running)
echo.

REM Start backend in a new window for log viewing; close window to stop.
REM DATABASE_URL / DEBUG go through setlocal scope; start creates a new process that inherits them,
REM avoiding re-setting on the command line, which would break cmd /k parsing when
REM passwords contain special chars like &/!/^.
pushd backend
start "Profo Backend" cmd /k ".venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"
popd

REM Start frontend in a new window
pushd frontend
start "Profo Frontend" cmd /k "pnpm dev"
popd

echo [OK] Backend and frontend started in new windows
echo.
echo Stop database: dev-start.bat stop
goto :end

:db
call :start_db
if errorlevel 1 exit /b 1
echo.
echo Database started, run in separate terminals:
echo   cd backend ^&^& .venv\Scripts\uvicorn.exe main:app --reload --port 8000
echo   cd frontend ^&^& pnpm dev
echo.
echo Or run: dev-start.bat  (start all at once)
goto :end

:stop
echo Stopping database container...
%DEV_COMPOSE% stop db
if errorlevel 1 goto :docker_error
echo [OK] Stopped. Close the corresponding windows for backend/frontend.
goto :end

:status
%DEV_COMPOSE% ps
echo.
echo Local port usage:
netstat -ano | findstr ":8000 :3000" | findstr "LISTENING" 2>nul
if errorlevel 1 echo   Ports 8000/3000 are free
goto :end

:logs
%DEV_COMPOSE% logs -f db
goto :end

:down
echo Stopping and removing containers (keeping data volumes)...
%DEV_COMPOSE% down
if errorlevel 1 goto :docker_error
echo [OK] Containers removed (pgdata volume kept)
goto :end

:usage
echo Usage: %0 {up^|db^|stop^|status^|logs^|down}
echo.
echo   up       start all (db + backend + frontend), default
echo   db       start database only
echo   stop     stop database container
echo   status   show container and port status
echo   logs     show database logs
echo   down     stop and remove containers (keep data volumes)
exit /b 1

:docker_error
echo [ERROR] docker compose command failed
exit /b 1

:end
endlocal
exit /b 0
