#!/bin/sh
# One-time setup of the Python Blocks API on the Linode box, run as root (scripts/deploy-backend.sh
# then copies the code). It shares the box with the arcade's game server, so it keeps to its own:
# Node 24 in /opt/node-24 (the game server keeps /usr/bin/node), user pyblocks, /opt/python-blocks,
# data in /var/lib/python-blocks and port 8788. Safe to run again.
# The secrets are written separately: /etc/python-blocks.env (python-blocks.env.example) and
# /etc/python-blocks-rclone.conf, both root:pyblocks 640.
set -eu
NODE_MAJOR=24

if [ ! -x /opt/node-24/bin/node ]; then
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  name=$(grep -o "node-v$NODE_MAJOR\.[0-9.]*-linux-x64\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)
  curl -fsSL "$base/$name" -o "$tmp/$name"
  (cd "$tmp" && grep " $name\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p /opt/node-24
  tar -xJf "$tmp/$name" -C /opt/node-24 --strip-components=1
  rm -rf "$tmp"
fi
/opt/node-24/bin/node --version

id pyblocks >/dev/null 2>&1 || useradd --system --home-dir /var/lib/python-blocks --shell /usr/sbin/nologin pyblocks
install -d -o root -g root -m 755 /opt/python-blocks
install -d -o pyblocks -g pyblocks -m 750 /var/lib/python-blocks
command -v rclone >/dev/null || { apt-get update -qq && apt-get install -y -qq rclone; }

here=$(dirname "$0")
install -m 644 "$here/python-blocks.service" "$here/python-blocks-backup.service" "$here/python-blocks-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable python-blocks.service python-blocks-backup.timer
