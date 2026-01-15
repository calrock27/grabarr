# grabarr

**grabarr** is a self-hosted, agentless file transfer orchestration platform. It replaces manual rsync scripts with a modern, web-based GUI that manages complex file movements (Local-to-Remote, Remote-to-Remote) while providing real-time progress visibility.

## Features

*   **Agentless**: Uses `rclone` RC API. No agents on remote servers.
*   **Modular**: Reusable Credentials and Remotes.
*   **Real-time**: Live progress updates via Server-Sent Events (SSE).
*   **Job Management**: Create, Schedule, Run, and Delete jobs.
*   **System Backup**: Encrypted Backup & Restore of your configuration.
*   **Embeddable**: Lightweight status widgets for your dashboards.

## Getting Started

### Docker (Recommended)

The easiest way to run grabarr is with Docker:

```bash
# Create config directory
mkdir -p ./config

# Run with docker compose
docker compose up -d
```

Access grabarr at `http://localhost:3643`

To build locally instead of using the pre-built image:

```bash
docker compose -f docker-compose.build.yml up --build -d
```

### Docker Configuration

All persistent data is stored in the `/config` volume:
- `grabarr.db` - SQLite database
- `.jwt_secret` - JWT signing key
- `.grabarr_key` - Credential encryption key
- `.rclone_auth` - Rclone RC authentication

### Manual Installation

#### Prerequisites

*   Python 3.10+
*   Node.js 18+
*   `rclone` installed and in PATH.
*   `openssl` (for backup encryption).

#### Installation

1.  **Backend**:
    ```bash
    cd backend
    pip install -r requirements.txt
    GRABARR_DEV_MODE=true python3 run.py
    ```
    Runs on `http://localhost:8001`.

2.  **Frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    Runs on `http://localhost:3000`.

## Usage

*   **Dashboard**: `http://localhost:3643` (Docker) or `http://localhost:3000` (dev)
*   **Embed Widget**: `/embed/widget/{key}`

### Backup & Restore

Navigate to **Settings > System**.
*   **Backup**: Enter a password to download an encrypted `.enc` file of your database.
*   **Restore**: Upload the `.enc` file and enter the password. *Warning: This overwrites the current database.*

## Architecture

*   **Backend**: FastAPI, SQLAlchemy (SQLite), APScheduler, Rclone RC.
*   **Frontend**: Next.js 14, TailwindCSS, shadcn/ui.

## Environment Variables

### User/Group IDs

Like other self-hosted applications (Sonarr, Radarr, etc.), grabarr supports running as a specific user/group to ensure proper file ownership:

```yaml
environment:
  - PUID=1000
  - PGID=1000
```

Find your UID/GID by running `id` on your host:
```bash
$ id
uid=1000(youruser) gid=1000(yourgroup) ...
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PUID` | `1000` | User ID to run as |
| `PGID` | `1000` | Group ID to run as |
| `UMASK` | *(not set)* | Optional file permission mask (e.g., `022`, `002`) |

### Application Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GRABARR_DB_PATH` | `/config/grabarr.db` | Database file path |
| `GRABARR_JWT_SECRET_PATH` | `/config/.jwt_secret` | JWT secret key path |
| `GRABARR_KEY_PATH` | `/config/.grabarr_key` | Encryption key path |
| `GRABARR_RCLONE_AUTH_PATH` | `/config/.rclone_auth` | Rclone auth path |
| `GRABARR_LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARNING, ERROR) |
| `GRABARR_RCLONE_TIMEOUT` | `60` | Rclone API timeout in seconds |
| `GRABARR_DEV_MODE` | `false` | Enable hot-reload for development |
| `PORT` | `3643` | Frontend port |
