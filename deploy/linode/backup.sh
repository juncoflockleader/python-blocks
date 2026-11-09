#!/bin/sh
# A whole copy of the database (safe while the server runs), gzipped: kept 7 days on the box and 30 in
# the R2 bucket python-blocks (rclone remote "r2", /etc/python-blocks-rclone.conf). Run by python-blocks-backup.service.
set -eu
dir="$DATA_DIR/backups"
file="$dir/python-blocks-$(date -u +%Y-%m-%dT%H%M%S).sqlite"
mkdir -p "$dir"
/opt/node-24/bin/node server/cli.ts backup "$file"
gzip -9f "$file"
find "$dir" -name 'python-blocks-*.sqlite.gz' -mtime +7 -delete
rclone copy "$file.gz" r2:python-blocks/backups/
rclone delete r2:python-blocks/backups/ --min-age 30d
echo "Backed up $(basename "$file").gz"
