#!/bin/sh
# Entrypoint script for grabarr
# Runs as root to set up user/permissions, then hands off to supervisord
# Pattern inspired by LinuxServer.io containers

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Default PUID/PGID if not set (1000 is common for first user on Linux)
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# UMASK is optional - only set if provided
# Common values: 022 (default), 002 (group write), 077 (private)
if [ -n "$UMASK" ]; then
    umask "$UMASK"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Startup Banner
# ─────────────────────────────────────────────────────────────────────────────

echo "
───────────────────────────────────────────────────────
     ___           _                    
    / __|_ _ __ _| |__  __ _ _ _ _ _ 
   | (_ | '_/ _\` | '_ \/ _\` | '_| '_|
    \___|_| \__,_|_.__/\__,_|_| |_|  

   File Transfer Orchestration Platform
───────────────────────────────────────────────────────
   PUID:  ${PUID}
   PGID:  ${PGID}
   UMASK: ${UMASK:-not set (system default)}
───────────────────────────────────────────────────────
"

# ─────────────────────────────────────────────────────────────────────────────
# User/Group Setup
# ─────────────────────────────────────────────────────────────────────────────

# Create or modify group with correct GID
EXISTING_GROUP=$(getent group "$PGID" | cut -d: -f1 || true)
if [ -z "$EXISTING_GROUP" ]; then
    # GID doesn't exist, create the grabarr group with this GID
    if getent group grabarr > /dev/null 2>&1; then
        # grabarr group exists with different GID, delete and recreate
        delgroup grabarr 2>/dev/null || true
    fi
    addgroup -g "$PGID" grabarr
    echo "Created group 'grabarr' with GID $PGID"
elif [ "$EXISTING_GROUP" != "grabarr" ]; then
    # GID exists but belongs to another group - use that group
    echo "GID $PGID already in use by group '$EXISTING_GROUP', using it"
    # Note: We still create grabarr user but with this existing group
else
    echo "Group 'grabarr' already has GID $PGID"
fi

# Determine which group name to use
GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)

# Create or modify user with correct UID
EXISTING_USER=$(getent passwd "$PUID" | cut -d: -f1 || true)
if [ -z "$EXISTING_USER" ]; then
    # UID doesn't exist, create the grabarr user with this UID
    if getent passwd grabarr > /dev/null 2>&1; then
        # grabarr user exists with different UID, delete and recreate
        deluser grabarr 2>/dev/null || true
    fi
    adduser -u "$PUID" -G "$GROUP_NAME" -D -s /bin/sh grabarr
    echo "Created user 'grabarr' with UID $PUID"
elif [ "$EXISTING_USER" != "grabarr" ]; then
    # UID exists but belongs to another user - use that user
    echo "UID $PUID already in use by user '$EXISTING_USER', using it"
else
    echo "User 'grabarr' already has UID $PUID"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Directory Structure and Permissions
# ─────────────────────────────────────────────────────────────────────────────

echo "Setting up directory structure..."

# Create required directories under /config
mkdir -p /config/logs
mkdir -p /config/rclone

# Set ownership on all config directories
chown -R "$PUID:$PGID" /config
chmod 755 /config

# Set ownership on application directories
chown -R "$PUID:$PGID" /app

echo "Directory permissions configured."

# ─────────────────────────────────────────────────────────────────────────────
# Export for child processes
# ─────────────────────────────────────────────────────────────────────────────

export PUID
export PGID

# ─────────────────────────────────────────────────────────────────────────────
# Start Application
# ─────────────────────────────────────────────────────────────────────────────

echo "Starting grabarr services..."

# Execute supervisord as root - it uses su-exec to drop privileges per-process
exec supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
