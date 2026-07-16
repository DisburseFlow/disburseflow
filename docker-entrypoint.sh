#!/bin/sh
set -e

# Start nginx in the foreground so it receives signals
nginx -g "daemon off;" &

# Wait for nginx to start
sleep 1

# Start the Go backend (also in foreground, but backgrounded here so we can
# wait on both). The backend listens on 8000, nginx proxies /api/* to it.
/app/stellar-disbursement-platform serve &
BACKEND_PID=$!

# Trap SIGTERM / SIGINT and forward to child processes
trap 'kill -TERM $BACKEND_PID; wait $BACKEND_PID' TERM INT

# Wait for any child to exit, propagating the exit code
wait $BACKEND_PID
