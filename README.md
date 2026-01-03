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

### Prerequisites

*   Python 3.10+
*   Node.js 18+
*   `rclone` installed and in PATH.
*   `openssl` (for backup encryption).

### Installation

1.  **Backend**:
    ```bash
    cd backend
    pip install -r requirements.txt
    python3 run.py
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

*   **Dashboard**: `http://localhost:3000`
*   **Embed Widget**: `http://localhost:3000/embed/job/{id}`

### Backup & Restore

Navigate to **Settings > System**.
*   **Backup**: Enter a password to download an encrypted `.enc` file of your database.
*   **Restore**: Upload the `.enc` file and enter the password. *Warning: This overwrites the current database.*

## Architecture

*   **Backend**: FastAPI, SQLAlchemy (SQLite), APScheduler, Rclone RC.
*   **Frontend**: Next.js 14, TailwindCSS, shadcn/ui.
