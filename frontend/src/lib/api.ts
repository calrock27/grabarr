import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const API_BASE_URL = "/api"

export async function fetchAPI<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: "include", // Include cookies for session
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    })

    // Handle unauthorized - redirect to login
    if (res.status === 401 && typeof window !== 'undefined') {
        // Don't redirect if already on auth pages
        if (!window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/setup')) {
            window.location.href = '/login'
            throw new Error("Session expired")
        }
    }

    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.detail || "An error occurred while fetching the data.")
    }

    return res.json()
}

// Typed API Wrappers

export interface Credential {
    id: number
    name: string
    type: string
    data: any
}

export interface Remote {
    id: number
    name: string
    type: string
    credential_id?: number
    config: any
}

export interface Job {
    id: number
    name: string
    source_remote_id: number
    dest_remote_id: number
    operation: string
    schedule?: string
    source_path?: string
    dest_path?: string
    excludes?: string[]
    embed_key?: string
    transfer_method?: 'direct' | 'proxy'
    copy_mode?: 'folder' | 'contents'
    enabled?: boolean
    last_run?: string
    next_run?: string
    last_status?: 'idle' | 'running' | 'success' | 'failed'
    last_error?: string
    allow_concurrent_runs?: boolean
    max_concurrent_runs?: number
    use_checksum?: boolean
    actions?: JobAction[]
}

export interface Action {
    id: number
    name: string
    type: string
    config: any
}

export interface JobAction {
    id?: number
    tempId?: string
    action_id: number
    trigger: 'pre' | 'post_success' | 'post_fail' | 'post_always'
    order: number
    action?: Action
}

export interface SystemSettings {
    failure_cooldown_seconds: number
    max_history_entries: number
    timezone?: string  // 'auto' for browser detection, or IANA timezone like 'America/New_York'
}

export interface Schedule {
    id: number
    name: string
    schedule_type: string
    config: Record<string, any>
}

// ...

// Logging Interfaces
export interface ActivityLog {
    id: number
    action: string
    entity_type: string
    entity_id?: number
    details?: any
    timestamp: string
}

export interface JobHistory {
    id: number
    job_id: number
    job_name?: string
    status: string
    details?: any
    timestamp: string
    avg_speed?: number  // bytes/sec
    files_transferred?: string[]
    job_snapshot?: any
    started_at?: string
    completed_at?: string
}

export interface EmbedWidget {
    id: number
    job_id: number
    embed_key: string
    name: string
    width: number
    height: number
    config?: WidgetConfig
    job?: Job
    created_at?: string
    updated_at?: string
}

export interface WidgetConfig {
    fields: {
        statusIndicator: { enabled: boolean; order: number }
        progressBar: { enabled: boolean; order: number }
        speed: { enabled: boolean; order: number }
        bytesTransferred: { enabled: boolean; order: number }
        eta: { enabled: boolean; order: number }
        filesTransferred: { enabled: boolean; order: number }
        currentFile: { enabled: boolean; order: number }
        operationType: { enabled: boolean; order: number }
        lastRunTime: { enabled: boolean; order: number }
    }
    style: {
        backgroundColor: string
        backgroundOpacity: number
        textColor: string
        secondaryTextColor: string
        accentColor: string
        borderRadius: number
        borderColor: string
        borderWidth: number
        fontSize: number
        theme: 'dark' | 'light' | 'transparent' | 'custom'
        autoWidth?: boolean
        autoHeight?: boolean
        idleBehavior?: 'keep' | 'minimal'
    }
    layout: 'vertical' | 'horizontal' | 'compact'
}


// List query parameters for server-side search/sort
export interface ListParams {
    search?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    limit?: number
    offset?: number
}

function buildQueryString(params?: ListParams): string {
    if (!params) return ''
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.set('search', params.search)
    if (params.sort_by) searchParams.set('sort_by', params.sort_by)
    if (params.sort_order) searchParams.set('sort_order', params.sort_order)
    if (params.limit !== undefined) searchParams.set('limit', params.limit.toString())
    if (params.offset !== undefined) searchParams.set('offset', params.offset.toString())
    const qs = searchParams.toString()
    return qs ? `?${qs}` : ''
}

export const api = {
    getCredentials: (params?: ListParams) => fetchAPI(`/credentials${buildQueryString(params)}`),
    createCredential: (data: Omit<Credential, "id">) => fetchAPI("/credentials", { method: "POST", body: JSON.stringify(data) }),
    updateCredential: (id: number, data: Omit<Credential, "id">) => fetchAPI(`/credentials/${id}`, { method: "PUT", body: JSON.stringify(data) }),

    getRemotes: (params?: ListParams) => fetchAPI(`/remotes${buildQueryString(params)}`),
    createRemote: (data: Omit<Remote, "id">) => fetchAPI("/remotes", { method: "POST", body: JSON.stringify(data) }),
    updateRemote: (id: number, data: Omit<Remote, "id">) => fetchAPI(`/remotes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    testRemote: (data: Omit<Remote, "id">) => fetchAPI("/remotes/test", { method: "POST", body: JSON.stringify(data) }),
    testRemoteById: (id: number) => fetchAPI(`/remotes/${id}/test`, { method: "POST" }),

    getSchedules: (params?: ListParams) => fetchAPI(`/schedules${buildQueryString(params)}`),
    createSchedule: (data: Omit<Schedule, "id">) => fetchAPI("/schedules", { method: "POST", body: JSON.stringify(data) }),
    updateSchedule: (id: number, data: Omit<Schedule, "id">) => fetchAPI(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteSchedule: (id: number) => fetchAPI(`/schedules/${id}`, { method: "DELETE" }),

    getAPIKeys: () => fetchAPI("/security/keys"),
    createAPIKey: (name: string) => fetchAPI("/security/keys", { method: "POST", body: JSON.stringify({ name }) }),
    deleteAPIKey: (id: number) => fetchAPI(`/security/keys/${id}`, { method: "DELETE" }),

    // CORS Settings
    getCORSSettings: (): Promise<{ allowed_origins: string[], allow_all: boolean }> => fetchAPI("/security/cors"),
    updateCORSSettings: (allowed_origins: string[], allow_all: boolean): Promise<{ allowed_origins: string[], allow_all: boolean }> =>
        fetchAPI("/security/cors", { method: "PUT", body: JSON.stringify({ allowed_origins, allow_all }) }),

    getActions: (params?: ListParams) => fetchAPI(`/actions${buildQueryString(params)}`),
    createAction: (data: Omit<Action, "id">) => fetchAPI("/actions", { method: "POST", body: JSON.stringify(data) }),
    updateAction: (id: number, data: Omit<Action, "id">) => fetchAPI(`/actions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteAction: (id: number) => fetchAPI(`/actions/${id}`, { method: "DELETE" }),

    getJobs: (params?: ListParams) => fetchAPI(`/jobs${buildQueryString(params)}`),
    createJob: (job: Omit<Job, "id">) => fetchAPI("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
    }),
    updateJob: (id: number, job: Omit<Job, "id">) => fetchAPI(`/jobs/${id}`, { method: "PUT", body: JSON.stringify(job) }),
    getJob: (id: number) => fetchAPI(`/jobs/${id}`),
    testJob: (job: { source_remote_id: number, dest_remote_id: number, operation: string }) => fetchAPI("/jobs/test", {
        method: "POST",
        body: JSON.stringify(job)
    }),
    rotateJobKey: (id: number) => fetchAPI(`/jobs/${id}/rotate_key`, { method: "POST" }),
    runJob: (id: number) => fetchAPI(`/jobs/${id}/run?execution_type=manual`, { method: "POST" }),
    stopJob: (id: number) => fetchAPI(`/jobs/${id}/stop`, { method: "POST" }),
    patchJob: (id: number, job: Partial<Job>) => fetchAPI(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(job) }),
    toggleJob: (id: number, enabled: boolean) => fetchAPI(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    deleteJob: (id: number) => fetchAPI(`/jobs/${id}`, { method: "DELETE" }),
    deleteCredential: (id: number) => fetchAPI(`/credentials/${id}`, { method: "DELETE" }),
    deleteRemote: (id: number) => fetchAPI(`/remotes/${id}`, { method: "DELETE" }),
    browseRemote: (id: number, path: string) => fetchAPI(`/remotes/${id}/browse`, { method: "POST", body: JSON.stringify({ path }) }),

    getHistory: (params?: ListParams) => fetchAPI(`/history${buildQueryString(params)}`),
    getActivityLog: (params?: ListParams) => fetchAPI(`/activity${buildQueryString(params)}`),

    // System
    backupSystem: (password: string) => fetch(`${API_BASE_URL}/system/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    }),
    restoreSystem: (formData: FormData) => fetch(`${API_BASE_URL}/system/restore`, {
        method: 'POST',
        body: formData
    }),
    restartSystem: () => fetchAPI("/system/restart", { method: "POST" }),

    // System Settings
    getSystemSettings: () => fetchAPI("/settings/system"),
    updateSystemSettings: (settings: Partial<SystemSettings>) => fetchAPI("/settings/system", {
        method: "PUT",
        body: JSON.stringify(settings)
    }),

    // Authentication
    checkAuthStatus: () => fetchAPI("/auth/status"),
    login: (username: string, password: string) => fetchAPI("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
    }),
    logout: () => fetchAPI("/auth/logout", { method: "POST" }),
    getMe: () => fetchAPI("/auth/me"),
    setupAdmin: (username: string, password: string) => fetchAPI("/auth/setup", {
        method: "POST",
        body: JSON.stringify({ username, password })
    }),

    async getDockerStatus(): Promise<{ available: boolean }> {
        return fetchAPI<{ available: boolean }>('/system/docker/status')
    },

    async getDockerContainers(): Promise<{ id: string, name: string, image: string, status: string }[]> {
        return fetchAPI<{ id: string, name: string, image: string, status: string }[]>('/system/docker/containers')
    },

    // Embed Widgets
    getWidgets: (params?: ListParams): Promise<EmbedWidget[]> => fetchAPI(`/widgets${buildQueryString(params)}`),
    getWidget: (id: number): Promise<EmbedWidget> => fetchAPI(`/widgets/${id}`),
    getWidgetByKey: (key: string) => fetchAPI(`/widgets/by-key/${key}`),
    getJobWidgets: (jobId: number): Promise<EmbedWidget[]> => fetchAPI(`/jobs/${jobId}/widgets`),
    createWidget: (data: { job_id: number; name?: string; width?: number; height?: number; config?: Partial<WidgetConfig> }): Promise<EmbedWidget> =>
        fetchAPI("/widgets", { method: "POST", body: JSON.stringify(data) }),
    updateWidget: (id: number, data: { name?: string; width?: number; height?: number; config?: Partial<WidgetConfig> }): Promise<EmbedWidget> =>
        fetchAPI(`/widgets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteWidget: (id: number) => fetchAPI(`/widgets/${id}`, { method: "DELETE" }),
    rotateWidgetKey: (id: number): Promise<EmbedWidget> => fetchAPI(`/widgets/${id}/rotate-key`, { method: "POST" }),
}

