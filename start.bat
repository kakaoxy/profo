@echo off
echo Starting Profo Real Estate Data Center...
echo.
REM Start backend
echo [1/2] Starting backend on :8000 ...
cd backend
start uv run python main.py
cd ..
REM Start frontend
echo [2/2] Starting frontend on :3000 ...
cd frontend
start pnpm dev
cd ..
echo.
echo === Servers launching ===
echo   Backend  http://localhost:8000
echo   Frontend http://localhost:3000
echo.
echo Press any key to STOP all servers...
pause > nul
taskkill /F /IM python.exe 2>nul
taskkill /F /IM node.exe   2>nul
echo All servers stopped.
pause
