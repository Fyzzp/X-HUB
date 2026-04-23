#!/bin/bash
set -e

export PATH="/usr/local/go/bin:$PATH"
cd /opt/X-HUB

echo "=== Building Backend ==="
cd backend
/usr/local/go/bin/go build -o xhub .
cd ..

echo "=== Building Frontend ==="
cd frontend
npm run build
cd ..

echo "=== Restarting Backend ==="
pkill -f '/opt/X-HUB/backend/xhub' || true
sleep 1
nohup ./backend/xhub > backend/xhub.log 2>&1 &
sleep 2

echo "=== Verifying Services ==="
curl -s http://127.0.0.1:6636/health
echo ""
curl -s -o /dev/null -w "Frontend: %{http_code}\n" https://room.pppoe.one/

echo ""
echo "=== Deploy Complete ==="
