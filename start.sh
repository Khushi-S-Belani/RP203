#!/bin/bash
# SnapBooth RP203 Launch Script for macOS

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "   📸 SnapBooth — RP203 Thermal Photo Booth       "
echo "   Prince Tagadiya • The Creato4 Lab              "
echo "=================================================="
echo ""
echo "Starting local web server on http://localhost:8080 ..."

# Kill any existing server on 8080
lsof -ti:8080 | xargs kill -9 2>/dev/null

# Start server (Node.js unified server with API routes, fallback to python static)
if command -v node >/dev/null 2>&1; then
  node server.js &
  SERVER_PID=$!
else
  python3 -m http.server 8080 &
  SERVER_PID=$!
fi

sleep 1

# Open in Google Chrome if installed, else default browser
if [ -d "/Applications/Google Chrome.app" ]; then
  echo "Opening in Google Chrome (supports Web Serial direct printing)..."
  open -a "Google Chrome" "http://localhost:8080"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  echo "Opening in Microsoft Edge..."
  open -a "Microsoft Edge" "http://localhost:8080"
else
  echo "Opening in default browser..."
  open "http://localhost:8080"
fi

echo ""
echo "✅ SnapBooth is running at http://localhost:8080"
echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
