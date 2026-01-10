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

| Variable | Default | Description |
|----------|---------|-------------|
| `GRABARR_DB_PATH` | `/config/grabarr.db` | Database file path |
| `GRABARR_JWT_SECRET_PATH` | `/config/.jwt_secret` | JWT secret key path |
| `GRABARR_KEY_PATH` | `/config/.grabarr_key` | Encryption key path |
| `GRABARR_RCLONE_AUTH_PATH` | `/config/.rclone_auth` | Rclone auth path |
| `GRABARR_RCLONE_CONFIG_PATH` | `/config/rclone.conf` | Rclone config file path |
| `GRABARR_LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARNING, ERROR) |
| `GRABARR_RCLONE_TIMEOUT` | `60` | Rclone API timeout in seconds |
| `GRABARR_BROWSE_SESSION_TIMEOUT` | `300` | Browse session timeout in seconds |
| `GRABARR_DEV_MODE` | `false` | Enable hot-reload for development |
| `PORT` | `3643` | Frontend port |

## API Endpoints

All endpoints require authentication unless otherwise noted.

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/status` | GET | Check auth status (public) |
| `/api/auth/login` | POST | Login with username/password |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/setup` | POST | Initial admin setup (public) |

### Jobs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/jobs` | GET | List all jobs |
| `/api/jobs` | POST | Create a job |
| `/api/jobs/{id}` | GET | Get job details |
| `/api/jobs/{id}` | PATCH | Update job |
| `/api/jobs/{id}` | DELETE | Delete job |
| `/api/jobs/{id}/run` | POST | Run job |
| `/api/jobs/{id}/stop` | POST | Stop running job |

### Remotes (Targets)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/remotes` | GET | List remotes |
| `/api/remotes` | POST | Create remote |
| `/api/remotes/{id}` | PUT | Update remote |
| `/api/remotes/{id}` | DELETE | Delete remote |
| `/api/remotes/{id}/test` | POST | Test remote connection |
| `/api/remotes/{id}/browse` | POST | Browse remote filesystem |

### Browse Sessions (Connection Pooling)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/browse/start` | POST | Start a browse session for a remote |
| `/api/browse/{session_id}` | POST | Browse using existing session |
| `/api/browse/end/{session_id}` | POST | End browse session |

### Credentials
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/credentials` | GET | List credentials |
| `/api/credentials` | POST | Create credential |
| `/api/credentials/{id}` | PUT | Update credential |
| `/api/credentials/{id}` | DELETE | Delete credential |

### Schedules
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schedules` | GET | List schedules |
| `/api/schedules` | POST | Create schedule |
| `/api/schedules/{id}` | PUT | Update schedule |
| `/api/schedules/{id}` | DELETE | Delete schedule |

### Actions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/actions` | GET | List actions |
| `/api/actions` | POST | Create action |
| `/api/actions/{id}` | PUT | Update action |
| `/api/actions/{id}` | DELETE | Delete action |

### Widgets
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/widgets` | GET | List widgets |
| `/api/widgets` | POST | Create widget |
| `/api/widgets/{id}` | PUT | Update widget |
| `/api/widgets/{id}` | DELETE | Delete widget |
| `/api/widgets/{id}/rotate-key` | POST | Rotate widget embed key |

### System
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system/backup` | POST | Download encrypted backup |
| `/api/system/restore` | POST | Restore from backup |
| `/api/settings/system` | GET/PUT | System settings |
| `/api/security/keys` | GET/POST | API keys |
| `/api/security/cors` | GET/PUT | CORS settings |
| `/api/history` | GET | Job history |
| `/api/activity` | GET | Activity log |
| `/api/events` | GET | SSE stream for real-time updates |

