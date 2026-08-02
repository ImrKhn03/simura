#!/bin/bash
# SIMURA supervisor: keeps the world alive across crashes. Usage: ./scripts/run-forever.sh
cd "$(dirname "$0")/.."
echo "SIMURA supervisor started (ctrl-c twice to stop)"
while true; do
  npx tsx src/server/index.ts
  code=$?
  echo "[supervisor] server exited ($code) — restarting in 3s"
  sleep 3
done
