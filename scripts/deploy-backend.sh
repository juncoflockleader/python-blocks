#!/bin/sh
# Deploy the API to the Linode box (deploy/linode): the server, the lessons (for coin rewards), the shared
# account limits and the box's own scripts. The new copy replaces the old in one move, then the service
# restarts and must answer its health check. SSH as root with ~/.ssh/id_ed25519 to the address in
# ~/creds/linode.ip. The first time, run deploy/linode/setup.sh on the box.
set -eu
cd "$(dirname "$0")/.."
host="root@$(cat "$HOME/creds/linode.ip")"
COPYFILE_DISABLE=1 tar -czf - --exclude .DS_Store --exclude __pycache__ server content deploy/linode src/account/shared.ts package.json |
  ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes "$host" '
    set -e
    rm -rf /opt/python-blocks.new && mkdir -p /opt/python-blocks.new
    tar -xzf - -C /opt/python-blocks.new --no-same-owner 2>/dev/null
    rm -rf /opt/python-blocks.old
    if [ -d /opt/python-blocks ]; then mv /opt/python-blocks /opt/python-blocks.old; fi
    mv /opt/python-blocks.new /opt/python-blocks
    systemctl restart python-blocks
    for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:8788/api/health && echo && exit 0; sleep 1; done
    journalctl -u python-blocks -n 20 --no-pager; exit 1'
