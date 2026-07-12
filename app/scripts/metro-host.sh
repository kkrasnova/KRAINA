#!/usr/bin/env bash
# Print the Mac LAN IP Metro should use for physical iOS devices.
set -euo pipefail

for iface in en0 en1 bridge100; do
  ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
    echo "$ip"
    exit 0
  fi
done

ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ { print $2; exit }')"
if [ -n "$ip" ]; then
  echo "$ip"
  exit 0
fi

echo "127.0.0.1"
