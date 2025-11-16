#!/bin/bash
echo "Starting Profo Real Estate Data Center..."
trap "echo 'Stopping servers...'; pkill -f 'uv run python main.py'; pkill -f 'pnpm dev'; exit 0" INT
cd backend && uv run python main.py &
cd frontend && pnpm dev &
wait
