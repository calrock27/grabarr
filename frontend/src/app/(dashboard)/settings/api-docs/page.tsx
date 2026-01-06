"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Copy,
    Check,
    ChevronDown,
    ChevronRight,
    Search,
    Play,
    Key,
    Server,
    Briefcase,
    Calendar,
    Shield,
    History,
    Activity,
    Settings,
    Wifi
} from "lucide-react"
import { toast } from "sonner"

// API Endpoint definitions
interface EndpointParam {
    name: string
    type: string
    required: boolean
    description: string
}

interface Endpoint {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    path: string
    description: string
    requiresAuth: boolean
    pathParams?: EndpointParam[]
    queryParams?: EndpointParam[]
    bodySchema?: Record<string, any>
    responseSchema?: Record<string, any>
}

interface EndpointCategory {
    name: string
    icon: React.ReactNode
    description: string
    endpoints: Endpoint[]
}

const API_CATEGORIES: EndpointCategory[] = [
    {
        name: "Credentials",
        icon: <Key className="w-4 h-4" />,
        description: "Manage authentication credentials (SSH keys, passwords, tokens)",
        endpoints: [
            {
                method: "GET",
                path: "/credentials",
                description: "List all credentials (sensitive data masked)",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ],
                responseSchema: { type: "array", items: { id: "number", name: "string", type: "string", data: "object" } }
            },
            {
                method: "POST",
                path: "/credentials",
                description: "Create a new credential",
                requiresAuth: false,
                bodySchema: { name: "string", type: "string (ssh_key|password|api_token)", data: "object" }
            },
            {
                method: "PUT",
                path: "/credentials/{credential_id}",
                description: "Update an existing credential",
                requiresAuth: false,
                pathParams: [{ name: "credential_id", type: "integer", required: true, description: "Credential ID" }],
                bodySchema: { name: "string", type: "string", data: "object" }
            },
            {
                method: "DELETE",
                path: "/credentials/{credential_id}",
                description: "Delete a credential",
                requiresAuth: false,
                pathParams: [{ name: "credential_id", type: "integer", required: true, description: "Credential ID" }]
            }
        ]
    },
    {
        name: "Remotes",
        icon: <Server className="w-4 h-4" />,
        description: "Configure remote storage locations and connections",
        endpoints: [
            {
                method: "GET",
                path: "/remotes",
                description: "List all configured remotes",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ]
            },
            {
                method: "POST",
                path: "/remotes",
                description: "Create a new remote",
                requiresAuth: false,
                bodySchema: { name: "string", type: "string (sftp|local|s3|etc)", credential_id: "number?", config: "object" }
            },
            {
                method: "PUT",
                path: "/remotes/{remote_id}",
                description: "Update a remote configuration",
                requiresAuth: false,
                pathParams: [{ name: "remote_id", type: "integer", required: true, description: "Remote ID" }],
                bodySchema: { name: "string", type: "string", credential_id: "number?", config: "object" }
            },
            {
                method: "DELETE",
                path: "/remotes/{remote_id}",
                description: "Delete a remote",
                requiresAuth: false,
                pathParams: [{ name: "remote_id", type: "integer", required: true, description: "Remote ID" }]
            },
            {
                method: "POST",
                path: "/remotes/test",
                description: "Test remote connectivity without saving",
                requiresAuth: false,
                bodySchema: { name: "string", type: "string", credential_id: "number?", config: "object" }
            },
            {
                method: "POST",
                path: "/remotes/{remote_id}/test",
                description: "Test an existing saved remote by its ID",
                requiresAuth: false,
                pathParams: [{ name: "remote_id", type: "integer", required: true, description: "Remote ID" }]
            },
            {
                method: "POST",
                path: "/remotes/{remote_id}/browse",
                description: "Browse files on a remote",
                requiresAuth: false,
                pathParams: [{ name: "remote_id", type: "integer", required: true, description: "Remote ID" }],
                bodySchema: { path: "string" }
            }
        ]
    },
    {
        name: "Actions",
        icon: <Activity className="w-4 h-4" />,
        description: "Manage reusable automation actions (webhooks, scripts, notifications)",
        endpoints: [
            {
                method: "GET",
                path: "/actions/",
                description: "List all configured actions",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ]
            },
            {
                method: "POST",
                path: "/actions/",
                description: "Create a new action",
                requiresAuth: false,
                bodySchema: { name: "string", type: "string (webhook|script|docker|notify)", config: "object" }
            },
            {
                method: "GET",
                path: "/actions/{action_id}",
                description: "Get a specific action by ID",
                requiresAuth: false,
                pathParams: [{ name: "action_id", type: "integer", required: true, description: "Action ID" }]
            },
            {
                method: "PUT",
                path: "/actions/{action_id}",
                description: "Update an existing action",
                requiresAuth: false,
                pathParams: [{ name: "action_id", type: "integer", required: true, description: "Action ID" }],
                bodySchema: { name: "string?", type: "string?", config: "object?" }
            },
            {
                method: "DELETE",
                path: "/actions/{action_id}",
                description: "Delete an action",
                requiresAuth: false,
                pathParams: [{ name: "action_id", type: "integer", required: true, description: "Action ID" }]
            }
        ]
    },
    {
        name: "Jobs",
        icon: <Briefcase className="w-4 h-4" />,
        description: "Create and manage file transfer jobs",
        endpoints: [
            {
                method: "GET",
                path: "/jobs/",
                description: "List all jobs with current status",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ]
            },
            {
                method: "POST",
                path: "/jobs/",
                description: "Create a new transfer job",
                requiresAuth: false,
                bodySchema: {
                    name: "string",
                    source_remote_id: "number",
                    dest_remote_id: "number",
                    operation: "string (copy|sync|move)",
                    schedule: "string?",
                    source_path: "string?",
                    dest_path: "string?",
                    excludes: "string[]?",
                    transfer_method: "string? (direct|proxy)",
                    copy_mode: "string? (folder|contents)",
                    use_checksum: "boolean?",
                    actions: "JobActionCreate[]?"
                }
            },
            {
                method: "GET",
                path: "/jobs/{job_id}",
                description: "Get job details by ID",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            },
            {
                method: "PUT",
                path: "/jobs/{job_id}",
                description: "Update a job configuration",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }],
                bodySchema: { name: "string", source_remote_id: "number", dest_remote_id: "number", operation: "string" }
            },
            {
                method: "PATCH",
                path: "/jobs/{job_id}",
                description: "Partially update a job",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }],
                bodySchema: { name: "string?", enabled: "boolean?", schedule: "string?", actions: "JobActionCreate[]?" }
            },
            {
                method: "DELETE",
                path: "/jobs/{job_id}",
                description: "Delete a job",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            },
            {
                method: "POST",
                path: "/jobs/{job_id}/run",
                description: "Manually trigger a job run",
                requiresAuth: true,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            },
            {
                method: "POST",
                path: "/jobs/{job_id}/stop",
                description: "Stop a running job",
                requiresAuth: true,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            },
            {
                method: "POST",
                path: "/jobs/{job_id}/toggle",
                description: "Enable or disable a job",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }],
                bodySchema: { enabled: "boolean" }
            },
            {
                method: "POST",
                path: "/jobs/{job_id}/rotate_key",
                description: "Generate a new embed key for the job",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            },
            {
                method: "GET",
                path: "/jobs/{job_id}/secure_info",
                description: "Get job info with embed key authentication",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }],
                queryParams: [{ name: "key", type: "string", required: true, description: "Embed key" }]
            }
        ]
    },
    {
        name: "Schedules",
        icon: <Calendar className="w-4 h-4" />,
        description: "Manage reusable schedule templates",
        endpoints: [
            {
                method: "GET",
                path: "/schedules/",
                description: "List all schedule templates",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ]
            },
            {
                method: "POST",
                path: "/schedules/",
                description: "Create a schedule template",
                requiresAuth: false,
                bodySchema: { name: "string", schedule_type: "string (cron|interval)", config: "object" }
            },
            {
                method: "PUT",
                path: "/schedules/{schedule_id}",
                description: "Update a schedule template",
                requiresAuth: false,
                pathParams: [{ name: "schedule_id", type: "integer", required: true, description: "Schedule ID" }],
                bodySchema: { name: "string", schedule_type: "string", config: "object" }
            },
            {
                method: "DELETE",
                path: "/schedules/{schedule_id}",
                description: "Delete a schedule template",
                requiresAuth: false,
                pathParams: [{ name: "schedule_id", type: "integer", required: true, description: "Schedule ID" }]
            }
        ]
    },
    {
        name: "Security",
        icon: <Shield className="w-4 h-4" />,
        description: "Manage API keys for external access",
        endpoints: [
            {
                method: "GET",
                path: "/security/keys",
                description: "List all API keys",
                requiresAuth: false
            },
            {
                method: "POST",
                path: "/security/keys",
                description: "Generate a new API key",
                requiresAuth: false,
                bodySchema: { name: "string" }
            },
            {
                method: "DELETE",
                path: "/security/keys/{key_id}",
                description: "Delete an API key",
                requiresAuth: false,
                pathParams: [{ name: "key_id", type: "integer", required: true, description: "Key ID" }]
            }
        ]
    },
    {
        name: "Authentication",
        icon: <Shield className="w-4 h-4" />,
        description: "User authentication and session management",
        endpoints: [
            {
                method: "GET",
                path: "/auth/status",
                description: "Check if authentication is set up and required",
                requiresAuth: false,
                responseSchema: { setup_complete: "boolean", requires_auth: "boolean" }
            },
            {
                method: "POST",
                path: "/auth/setup",
                description: "Initial admin setup (only works if no admin exists)",
                requiresAuth: false,
                bodySchema: { username: "string (default: admin)", password: "string" }
            },
            {
                method: "POST",
                path: "/auth/login",
                description: "Authenticate and get session token",
                requiresAuth: false,
                bodySchema: { username: "string", password: "string" },
                responseSchema: { success: "boolean", message: "string", username: "string?" }
            },
            {
                method: "POST",
                path: "/auth/logout",
                description: "Log out and clear session",
                requiresAuth: false
            },
            {
                method: "GET",
                path: "/auth/me",
                description: "Get current authenticated user info",
                requiresAuth: false,
                responseSchema: { username: "string", is_admin: "boolean" }
            }
        ]
    },
    {
        name: "History & Activity",
        icon: <History className="w-4 h-4" />,
        description: "View job execution history and activity logs",
        endpoints: [
            {
                method: "GET",
                path: "/history",
                description: "Get job execution history",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by status or job name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: desc)" },
                    { name: "limit", type: "integer", required: false, description: "Max entries (default: 50)" },
                    { name: "offset", type: "integer", required: false, description: "Pagination offset (default: 0)" }
                ]
            },
            {
                method: "GET",
                path: "/activity",
                description: "Get system activity log (CRUD operations)",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by action or entity type" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: desc)" },
                    { name: "limit", type: "integer", required: false, description: "Max entries (default: 50)" },
                    { name: "offset", type: "integer", required: false, description: "Pagination offset (default: 0)" }
                ]
            }
        ]
    },
    {
        name: "System",
        icon: <Settings className="w-4 h-4" />,
        description: "System settings, backup, and restore",
        endpoints: [
            {
                method: "GET",
                path: "/settings/system",
                description: "Get system settings",
                requiresAuth: false,
                responseSchema: { failure_cooldown_seconds: "number", max_history_entries: "number" }
            },
            {
                method: "PUT",
                path: "/settings/system",
                description: "Update system settings",
                requiresAuth: false,
                bodySchema: { failure_cooldown_seconds: "number?", max_history_entries: "number?" }
            },
            {
                method: "POST",
                path: "/system/backup",
                description: "Create encrypted system backup",
                requiresAuth: false,
                bodySchema: { password: "string" }
            },
            {
                method: "POST",
                path: "/system/restore",
                description: "Restore from encrypted backup",
                requiresAuth: false,
                bodySchema: { "multipart/form-data": "file + password" }
            }
        ]
    },
    {
        name: "Events",
        icon: <Wifi className="w-4 h-4" />,
        description: "Real-time event streaming via SSE",
        endpoints: [
            {
                method: "GET",
                path: "/events",
                description: "Subscribe to Server-Sent Events for real-time job updates",
                requiresAuth: false,
                responseSchema: { type: "SSE stream", events: ["job_status", "job_progress", "job_complete"] }
            }
        ]
    },
    {
        name: "Widgets",
        icon: <Activity className="w-4 h-4" />,
        description: "Customizable embed widgets for displaying job status on external dashboards",
        endpoints: [
            {
                method: "GET",
                path: "/widgets",
                description: "List all embed widgets",
                requiresAuth: false,
                queryParams: [
                    { name: "search", type: "string", required: false, description: "Search term to filter by name" },
                    { name: "sort_by", type: "string", required: false, description: "Column to sort by" },
                    { name: "sort_order", type: "string", required: false, description: "Sort direction (asc/desc, default: asc)" }
                ]
            },
            {
                method: "POST",
                path: "/widgets",
                description: "Create a new embed widget",
                requiresAuth: false,
                bodySchema: {
                    job_id: "number (required)",
                    name: "string?",
                    width: "number? (default: 350)",
                    height: "number? (default: 150)",
                    config: "object? (fields, style, layout)"
                }
            },
            {
                method: "GET",
                path: "/widgets/{widget_id}",
                description: "Get a specific widget by ID",
                requiresAuth: false,
                pathParams: [{ name: "widget_id", type: "integer", required: true, description: "Widget ID" }]
            },
            {
                method: "PUT",
                path: "/widgets/{widget_id}",
                description: "Update an existing widget",
                requiresAuth: false,
                pathParams: [{ name: "widget_id", type: "integer", required: true, description: "Widget ID" }],
                bodySchema: { name: "string?", width: "number?", height: "number?", config: "object?" }
            },
            {
                method: "DELETE",
                path: "/widgets/{widget_id}",
                description: "Delete a widget",
                requiresAuth: false,
                pathParams: [{ name: "widget_id", type: "integer", required: true, description: "Widget ID" }]
            },
            {
                method: "POST",
                path: "/widgets/{widget_id}/rotate-key",
                description: "Rotate the embed key, invalidating old embed URLs",
                requiresAuth: false,
                pathParams: [{ name: "widget_id", type: "integer", required: true, description: "Widget ID" }]
            },
            {
                method: "GET",
                path: "/widgets/by-key/{embed_key}",
                description: "Get widget configuration by embed key (used by embed pages)",
                requiresAuth: false,
                pathParams: [{ name: "embed_key", type: "string", required: true, description: "Unique embed key" }]
            },
            {
                method: "GET",
                path: "/jobs/{job_id}/widgets",
                description: "List all widgets for a specific job",
                requiresAuth: false,
                pathParams: [{ name: "job_id", type: "integer", required: true, description: "Job ID" }]
            }
        ]
    }
]


// Method color mapping
const METHOD_COLORS: Record<string, string> = {
    GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    PATCH: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30"
}

function EndpointCard({ endpoint, baseUrl }: { endpoint: Endpoint; baseUrl: string }) {
    const [expanded, setExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
    const [pathParams, setPathParams] = useState<Record<string, string>>({})
    const [queryParams, setQueryParams] = useState<Record<string, string>>({})
    const [requestBody, setRequestBody] = useState("")

    // Generate cURL command
    const curlCommand = useMemo(() => {
        let path = endpoint.path
        // Replace path params
        endpoint.pathParams?.forEach(p => {
            const value = pathParams[p.name] || `{${p.name}}`
            path = path.replace(`{${p.name}}`, value)
        })

        // Add query params
        const queryString = Object.entries(queryParams)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join("&")
        if (queryString) path += `?${queryString}`

        let cmd = `curl -X ${endpoint.method} "${baseUrl}${path}"`

        if (endpoint.requiresAuth) {
            cmd += ` \\\n  -H "X-API-Key: YOUR_API_KEY"`
        }

        if (endpoint.bodySchema && requestBody) {
            cmd += ` \\\n  -H "Content-Type: application/json"`
            cmd += ` \\\n  -d '${requestBody}'`
        } else if (endpoint.bodySchema) {
            cmd += ` \\\n  -H "Content-Type: application/json"`
            cmd += ` \\\n  -d '${JSON.stringify(endpoint.bodySchema, null, 2)}'`
        }

        return cmd
    }, [endpoint, baseUrl, pathParams, queryParams, requestBody])

    const handleCopy = () => {
        navigator.clipboard.writeText(curlCommand)
        setCopied(true)
        toast.success("Copied to clipboard!")
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition text-left"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <Badge className={`${METHOD_COLORS[endpoint.method]} border font-mono text-xs px-2`}>
                    {endpoint.method}
                </Badge>
                <code className="text-sm text-zinc-300 font-mono flex-1">{endpoint.path}</code>
                {endpoint.requiresAuth && (
                    <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
                        <Key className="w-3 h-3 mr-1" /> Auth
                    </Badge>
                )}
            </button>

            {expanded && (
                <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-900/50">
                    <p className="text-sm text-zinc-400">{endpoint.description}</p>

                    {/* Path Parameters */}
                    {endpoint.pathParams && endpoint.pathParams.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-xs text-zinc-500 uppercase tracking-wider">Path Parameters</Label>
                            <div className="grid gap-2">
                                {endpoint.pathParams.map(p => (
                                    <div key={p.name} className="flex items-center gap-2">
                                        <code className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300 min-w-[120px]">{p.name}</code>
                                        <Input
                                            placeholder={p.type}
                                            className="bg-zinc-800 border-zinc-700 text-sm h-8"
                                            value={pathParams[p.name] || ""}
                                            onChange={(e) => setPathParams({ ...pathParams, [p.name]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Query Parameters */}
                    {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-xs text-zinc-500 uppercase tracking-wider">Query Parameters</Label>
                            <div className="grid gap-2">
                                {endpoint.queryParams.map(p => (
                                    <div key={p.name} className="flex items-center gap-2">
                                        <code className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-300 min-w-[120px]">
                                            {p.name}
                                            {!p.required && <span className="text-zinc-500 ml-1">?</span>}
                                        </code>
                                        <Input
                                            placeholder={p.description}
                                            className="bg-zinc-800 border-zinc-700 text-sm h-8"
                                            value={queryParams[p.name] || ""}
                                            onChange={(e) => setQueryParams({ ...queryParams, [p.name]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Request Body */}
                    {endpoint.bodySchema && (
                        <div className="space-y-2">
                            <Label className="text-xs text-zinc-500 uppercase tracking-wider">Request Body</Label>
                            <pre className="text-xs bg-zinc-800 p-3 rounded-lg overflow-x-auto text-zinc-300">
                                {JSON.stringify(endpoint.bodySchema, null, 2)}
                            </pre>
                            <textarea
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-zinc-300 min-h-[100px]"
                                placeholder="Paste or write your JSON body here..."
                                value={requestBody}
                                onChange={(e) => setRequestBody(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Generated cURL */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-zinc-500 uppercase tracking-wider">cURL Command</Label>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1"
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied!" : "Copy"}
                            </Button>
                        </div>
                        <pre className="text-xs bg-zinc-950 border border-zinc-800 p-3 rounded-lg overflow-x-auto text-emerald-400 font-mono">
                            {curlCommand}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function APIDocsPage() {
    const [search, setSearch] = useState("")
    const [activeCategory, setActiveCategory] = useState("all")
    const [baseUrl, setBaseUrl] = useState("http://localhost:8000/api")

    // Filter endpoints based on search
    const filteredCategories = useMemo(() => {
        if (!search && activeCategory === "all") return API_CATEGORIES

        return API_CATEGORIES
            .filter(cat => activeCategory === "all" || cat.name.toLowerCase() === activeCategory.toLowerCase())
            .map(cat => ({
                ...cat,
                endpoints: cat.endpoints.filter(ep =>
                    ep.path.toLowerCase().includes(search.toLowerCase()) ||
                    ep.description.toLowerCase().includes(search.toLowerCase()) ||
                    ep.method.toLowerCase().includes(search.toLowerCase())
                )
            }))
            .filter(cat => cat.endpoints.length > 0)
    }, [search, activeCategory])

    const totalEndpoints = API_CATEGORIES.reduce((acc, cat) => acc + cat.endpoints.length, 0)

    return (
        <div className="p-6 text-white min-h-screen">
            <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-white">API Reference</h2>
                <p className="text-zinc-400 text-sm mt-1">
                    Interactive documentation for all {totalEndpoints} API endpoints. Build and test requests directly.
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                        placeholder="Search endpoints..."
                        className="pl-10 bg-zinc-900 border-zinc-700"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Label className="text-xs text-zinc-500 whitespace-nowrap">Base URL:</Label>
                    <Input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        className="bg-zinc-900 border-zinc-700 font-mono text-sm w-[280px]"
                    />
                </div>
            </div>

            {/* Category Tabs */}
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
                <TabsList className="bg-zinc-900 border border-zinc-800 p-1 flex-wrap h-auto gap-1 mb-6">
                    <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                        All ({totalEndpoints})
                    </TabsTrigger>
                    {API_CATEGORIES.map(cat => (
                        <TabsTrigger
                            key={cat.name}
                            value={cat.name.toLowerCase()}
                            className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs gap-1"
                        >
                            {cat.icon}
                            {cat.name} ({cat.endpoints.length})
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="space-y-6">
                    {filteredCategories.map(category => (
                        <Card key={category.name} className="bg-card border-zinc-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    {category.icon}
                                    {category.name}
                                </CardTitle>
                                <CardDescription>{category.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {category.endpoints.map((endpoint, idx) => (
                                    <EndpointCard key={`${endpoint.method}-${endpoint.path}-${idx}`} endpoint={endpoint} baseUrl={baseUrl} />
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </Tabs>

            {filteredCategories.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No endpoints found matching your search.</p>
                </div>
            )}
        </div>
    )
}
