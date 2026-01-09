#!/bin/sh
# Entrypoint script for grabarr
# Runs as root to fix permissions, supervisord handles user dropping per-process

set -e

# Default PUID/PGID if not set (common pattern from LinuxServer.io)
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "───────────────────────────────────────"
echo "  grabarr - File Transfer Orchestrator "
echo "───────────────────────────────────────"
echo "  PUID: $PUID"
echo "  PGID: $PGID"
echo "───────────────────────────────────────"

# Update grabarr user/group IDs if different from default
if [ "$PUID" != "1000" ] || [ "$PGID" != "1000" ]; then
    echo "Updating user/group IDs..."
    # Update group ID
    if [ "$PGID" != "1000" ]; then
        delgroup grabarr 2>/dev/null || true
        addgroup -g "$PGID" grabarr
    fi
    # Update user ID
    if [ "$PUID" != "1000" ]; then
        deluser grabarr 2>/dev/null || true
        adduser -u "$PUID" -G grabarr -D grabarr
    fi
    # Re-set ownership of /app since user changed
    chown -R grabarr:grabarr /app
fi

# Ensure /config directory exists and has correct ownership
echo "Setting permissions on /config..."
mkdir -p /config
chown -R grabarr:grabarr /config
chmod 755 /config

echo "Starting grabarr..."

# Execute supervisord as root - it handles dropping privileges per-process
exec supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
