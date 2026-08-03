@echo off
REM �ݹ������start cmd /k �������½��̻�̳� DEV_START_GUARD��
REM ������������쳣�������½��� dev-start.bat���������ز��˳���
if defined DEV_START_GUARD (
  echo [����] dev-start.bat ��⵽�ݹ���ã�����ֹ��
  echo    ����ԭ��start cmd /k ������������е������ַ��ƻ���
  exit /b 1
)
setlocal enabledelayedexpansion
set "DEV_START_GUARD=1"
chcp 936 > nul

REM ====================================================================
REM Profo ��������һ����ͣ�ű� (Windows ��)
REM
REM �ܹ���Docker �� PostgreSQL + ���� uvicorn --reload + ���� next dev
REM ǰ��˴���Ķ��Զ������أ����� docker rebuild��
REM
REM �� start.bat ������
REM   start.bat         ���������ķ���ȫ�����������Ĵ����� rebuild
REM   dev-start.bat     ���ؿ������� db ��������ǰ��˱���ֱ��������
REM
REM �÷�:
REM   dev-start.bat            ����ȫ����db + backend + frontend��
REM   dev-start.bat up         ͬ��
REM   dev-start.bat db         ֻ�������ݿ⣨ǰ����Լ����ն��ܣ�
REM   dev-start.bat stop       ֹͣ���ݿ�����
REM   dev-start.bat status     �鿴������˿�״̬
REM   dev-start.bat logs       �鿴���ݿ���־
REM   dev-start.bat down       ֹͣ��ɾ���������������ݾ���
REM ====================================================================

cd /d "%~dp0"

set "DEV_COMPOSE=docker compose -f docker-compose.yml -f docker-compose.dev.yml"

REM ����Ŀ¼ .env
if not exist ".env" (
  echo [����] δ��⵽��Ŀ¼ .env
  echo    ����ִ��: copy .env.docker.example .env ������ POSTGRES_* ��ƾ��
  exit /b 1
)

REM �� .env ��ȡ POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="
set "POSTGRES_DB="
set "REDIS_PASSWORD="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "key=%%a"
  set "val=%%b"
  if /i "!key!"=="POSTGRES_USER" set "POSTGRES_USER=!val!"
  if /i "!key!"=="POSTGRES_PASSWORD" set "POSTGRES_PASSWORD=!val!"
  if /i "!key!"=="POSTGRES_DB" set "POSTGRES_DB=!val!"
  if /i "!key!"=="REDIS_PASSWORD" set "REDIS_PASSWORD=!val!"
)

if "!POSTGRES_USER!"=="" (
  echo [����] .env ��δ�ҵ� POSTGRES_USER
  exit /b 1
)
if "!POSTGRES_PASSWORD!"=="" (
  echo [����] .env ��δ�ҵ� POSTGRES_PASSWORD
  exit /b 1
)
if "!POSTGRES_DB!"=="" (
  echo [����] .env ��δ�ҵ� POSTGRES_DB
  exit /b 1
)

REM �����������ǣ�backend ֱ������ӳ��� Docker db
set "DATABASE_URL=postgresql+psycopg://!POSTGRES_USER!:!POSTGRES_PASSWORD!@127.0.0.1:5432/!POSTGRES_DB!"
set "REDIS_URL=redis://:!REDIS_PASSWORD!@127.0.0.1:6379/0"
set "DEBUG=true"

REM ��� backend\.venv
if not exist "backend\.venv\Scripts\uvicorn.exe" (
  if not exist "backend\.venv\Scripts\uvicorn" (
    echo [����] backend\.venv �����ڻ�ȱ�� uvicorn
    echo    ��ִ��: cd backend ^&^& uv sync
    exit /b 1
  )
)

REM ��� frontend\node_modules
if not exist "frontend\node_modules" (
  echo [����] frontend\node_modules �����ڣ�ִ�� pnpm install...
  pushd frontend
  call pnpm install
  popd
)

REM ���� backend\static\uploads ���� �� ..\..\uploads
REM �ñ��� dev ģʽ�� Docker ��������ͬһ���ϴ��ļ�
REM Windows ��Ҫ����ԱȨ�޻򿪷���ģʽ�������������� junction ���
if not exist "backend\static" mkdir "backend\static"
if exist "backend\static\uploads" (
  REM ����Ƿ����� junction/����
  dir /al "backend\static\uploads" 2>nul | findstr "JUNCTION\|SYMLINK" > nul
  if errorlevel 1 (
    echo [����] backend\static\uploads ����ʵĿ¼���� junction
    echo    ���蹲�� Docker uploads������ɾ����Ŀ¼: rmdir /s /q backend\static\uploads
    echo    ��ǰ dev ģʽ��ʹ�ö����ı��� uploads���� Docker ����ͨ
  )
) else (
  mklink /J "backend\static\uploads" "%~dp0uploads" > nul 2>&1
  if errorlevel 1 (
    echo [����] ���� junction ʧ�ܣ�backend\static\uploads ��ʹ�ö���Ŀ¼
    echo    ���蹲�������ֶ�ִ��: mklink /J backend\static\uploads ..\..\uploads
  ) else (
    echo [�ɹ�] �Ѵ��� junction backend\static\uploads -^> ..\..\uploads������ uploads Ŀ¼��
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

:start_db
echo ���� PostgreSQL (Docker)...
%DEV_COMPOSE% up -d db redis
if errorlevel 1 (
  echo [����] �������ݿ�ʧ��
  exit /b 1
)
echo [�ɹ�] ���ݿ�������: postgresql+psycopg://!POSTGRES_USER!:***@127.0.0.1:5432/!POSTGRES_DB!
goto :eof

:up
call :start_db
echo.
echo ������� (uvicorn --reload) ��ǰ�� (next dev)...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo   (�رձ����ڻ�ֹͣǰ��ˣ����ݿⱣ������)
echo.

REM ���´������� backend�����ڲ鿴��־���رմ��ڼ�ֹͣ��
REM DATABASE_URL / DEBUG ���� setlocal �������ã�start �������½��̻�̳У�
REM ������������ٴ� set���������뺬 &/!/^ �������ַ�ʱ�ƻ� cmd /k ������
pushd backend
start "Profo Backend" cmd /k ".venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"
popd

REM ���´������� frontend
pushd frontend
start "Profo Frontend" cmd /k "pnpm dev"
popd

echo [�ɹ�] ǰ��������´�������
echo.
echo ֹͣ���ݿ�: dev-start.bat stop
goto :end

:db
call :start_db
echo.
echo ���ݿ������������������ն˷ֱ����У�
echo   cd backend ^&^& .venv\Scripts\uvicorn.exe main:app --reload --port 8000
echo   cd frontend ^&^& pnpm dev
echo.
echo ��ֱ��ִ��: dev-start.bat  (һ������ȫ��)
goto :end

:stop
echo ֹͣ���ݿ�����...
%DEV_COMPOSE% stop db
if errorlevel 1 goto :docker_error
echo [�ɹ�] ��ֹͣ������ǰ��˽�����رն�Ӧ���ڣ�
goto :end

:status
%DEV_COMPOSE% ps
echo.
echo ���ض˿�ռ��:
netstat -ano | findstr ":8000 :3000" | findstr "LISTENING" 2>nul
if errorlevel 1 echo   8000/3000 �˿ڿ���
goto :end

:logs
%DEV_COMPOSE% logs -f db
goto :end

:down
echo ֹͣ��ɾ���������������ݾ���...
%DEV_COMPOSE% down
if errorlevel 1 goto :docker_error
echo [�ɹ�] ������ɾ����pgdata volume ����
goto :end

:usage
echo �÷�: %0 {up^|db^|stop^|status^|logs^|down}
echo.
echo   up       ����ȫ����db + backend + frontend���� Ĭ��
echo   db       ֻ�������ݿ�
echo   stop     ֹͣ���ݿ�����
echo   status   �鿴������˿�״̬
echo   logs     �鿴���ݿ���־
echo   down     ֹͣ��ɾ���������������ݾ���
exit /b 1

:docker_error
echo [����] docker compose ����ִ��ʧ��
exit /b 1

:end
endlocal
exit /b 0
