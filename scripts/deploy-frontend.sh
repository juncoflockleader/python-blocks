#!/bin/sh
# Deploy pythonblocks.org to Cloudflare: build the app, then upload it with the Worker (wrangler.jsonc).
# The API token is read from ~/creds/cloudflare.worker.api ("name: token" or just the token).
set -eu
cd "$(dirname "$0")/.."
CLOUDFLARE_API_TOKEN=$(sed -E 's/^[A-Za-z_][A-Za-z0-9_ .-]*[=:][[:space:]]*//' "$HOME/creds/cloudflare.worker.api" | head -1 | tr -d '[:space:]')
export CLOUDFLARE_API_TOKEN
if [ "${1:-}" != "--no-build" ]; then pnpm build; fi
npx --yes wrangler@4.152.0 deploy
