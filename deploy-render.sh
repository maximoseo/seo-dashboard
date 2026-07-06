#!/usr/bin/env bash
set -euo pipefail

: "${RENDER_DEPLOY_HOOK:?Set RENDER_DEPLOY_HOOK in your shell or CI secrets}"

curl --fail --show-error --silent --connect-timeout 10 --max-time 60 --request POST "$RENDER_DEPLOY_HOOK"
echo "Render deploy hook triggered."
