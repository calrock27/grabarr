# GEMINI.md: grabarr Project Master Requirements

## 1. Project Vision
**grabarr** is a self-hosted, agentless file transfer orchestration platform. It replaces manual rsync scripts with a modern, web-based GUI that manages complex file movements (Local-to-Remote, Remote-to-Local, and Remote-to-Remote) while providing real-time progress visibility for dashboards. It also has the look, feel, and behavior of the popular Arr-Style UI, commonly called Servarr UI.

## 2. Core Architectural Principles
* **Agentless & Zero-Footprint:** No software, binaries, or non-standard packages may be installed on remote sources or destinations. All logic is executed from the grabarr controller.
* **Modular Asset Reuse:** Components (Credentials, Hosts, Schedules) are independent entities. 
    * A single Credential can be used by multiple Hosts.
    * A single Host can be a Source for one job and a Destination for another.
* **Intelligent Transport Layer:** The engine must automatically negotiate the fastest transfer method (e.g., Server-Side Copy for cloud-to-cloud) while allowing manual protocol/flag overrides.
* **Sub-Workflow UI:** The interface must allow users to create missing assets (e.g., adding a new SSH key) in-line during the Job creation process without losing state.

---

## 3. Technical Stack
| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Orchestration Engine** | **rclone** (via RC API) | Native support for 40+ protocols and server-side transfers. |
| **Backend API** | **FastAPI** (Python) | Async-native; handles long-running jobs and SSE streaming efficiently. |
| **Database** | **SQLite + SQLAlchemy** | Relational mapping for modular assets; portable and NAS-friendly. |
| **Task Scheduling** | **APScheduler** | Allows dynamic cron/interval management via the GUI. |
| **Frontend** | **Next.js + shadcn/ui** | Supports "Intercepting Routes" and "Drawers" for nested workflows. |

---

## 4. Detailed Functional Requirements

### 4.1 Modular Asset Registry
* **Credentials Library:** Secure storage for SSH Keys, Passwords, and API Tokens.
* **Remote Registry:** Definition of hosts (IP/Domain, Port, Protocol) linked to specific Credentials.
* **Schedule Templates:** Named cron or interval definitions (e.g., "Seedbox Sync: Every 15m").

### 4.2 The Job Builder & Sub-Workflows
* **Wizard-based Setup:** Step-by-step creation of transfer tasks.
* **In-line Provisioning:** If a required Remote or Credential does not exist, the UI must provide a button to open a "Sub-Workflow" (Drawer or Modal) to create it without exiting the Job Builder.
* **Operation Types:** * **Move:** Copy file + delete source upon successful checksum verification.
    * **Sync:** Mirror source to destination.
    * **Copy:** Standard transfer.

### 4.3 Monitoring & Integration
* **Real-time Status:** Live transfer speeds, ETA, and progress bars via **Server-Sent Events (SSE)**.
* **Embeddable View:** A dedicated, lightweight route (`/embed/job/{id}`) designed for iframes on dashboards.
* **API Control:** A master **Application API Key** must be definable to secure external calls to `/api/status`.

### 4.4 Backup & Portability
* **System Backup:** A one-click feature to export the database, `rclone.conf`, and app settings into a single encrypted archive.
* **Restore:** Ability to upload an archive to a fresh grabarr instance to resume all jobs and assets.

---

## 5. Development Reference Material
* **Rclone Remote Control API:** https://rclone.org/rc/
* **Rclone Server-Side Copy:** https://rclone.org/commands/rclone_copy/
* **FastAPI Background Tasks:** https://fastapi.tiangolo.com/tutorial/background-tasks/
* **APScheduler Guide:** https://apscheduler.readthedocs.io/
* **shadcn/ui Sheet (Drawers):** https://ui.shadcn.com/docs/components/sheet


---
