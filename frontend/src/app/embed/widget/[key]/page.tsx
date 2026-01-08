"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Progress } from "@/components/ui/progress"
import { Clock } from "lucide-react"

interface WidgetData {
    id: number
    job_id: number
    embed_key: string
    name: string
    width: number
    height: number
    config: {
        fields: Record<string, { enabled: boolean; order: number }>
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
            theme: string
            autoWidth?: boolean
            autoHeight?: boolean
            idleBehavior?: 'keep' | 'minimal'
        }
        layout: string
    }
    job: {
        id: number
        name: string
        operation: string
        updated_at?: string
    }
}

export default function EmbedWidgetPage() {
    const params = useParams()
    const key = params.key as string

    const [widget, setWidget] = useState<WidgetData | null>(null)
    const [stats, setStats] = useState<any>(null)
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Fetch widget config
        fetch(`/api/widgets/by-key/${key}`)
            .then(res => {
                if (!res.ok) throw new Error("Widget not found")
                return res.json()
            })
            .then(data => {
                setWidget(data)

                // Connect to SSE for live updates
                const eventSource = new EventSource(`/api/events`)

                eventSource.onopen = () => setConnected(true)
                eventSource.onmessage = (event) => {
                    const eventData = JSON.parse(event.data)
                    if (eventData.type === "progress" && eventData.payload.job_id === data.job?.id) {
                        setStats(eventData.payload)
                    }
                    if (eventData.type === "job_update" && eventData.payload.job_id === data.job?.id) {
                        if (eventData.payload.status === "finished") {
                            setStats(null)
                        }
                    }
                }
                eventSource.onerror = () => setConnected(false)

                return () => eventSource.close()
            })
            .catch(err => setError(err.message))
    }, [key])

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 text-zinc-400 text-sm">
                Widget not found or invalid key
            </div>
        )
    }

    if (!widget) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 text-zinc-400 text-sm">
                Loading...
            </div>
        )
    }

    const { config, job } = widget
    const style = config?.style || {
        backgroundColor: "#111827",
        textColor: "#ffffff",
        secondaryTextColor: "#9ca3af",
        accentColor: "#8b5cf6",
        borderRadius: 8,
        borderColor: "#374151",
        borderWidth: 1,
        fontSize: 14
    }
    const fields = config?.fields || {}

    const isRunning = !!stats

    // Get enabled fields sorted by order
    const enabledFields = Object.entries(fields)
        .filter(([_, v]) => v.enabled)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([k]) => k)

    // Calculate current speed from active transfers
    let currentSpeed = 0
    if (stats?.transferring && Array.isArray(stats.transferring) && stats.transferring.length > 0) {
        currentSpeed = stats.transferring.reduce((sum: number, t: any) => sum + (t.speedAvg || t.speed || 0), 0)
    } else if (stats?.speed) {
        currentSpeed = stats.speed
    }

    // Construct the jobs page URL
    const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''
    const jobsPageUrl = `${baseUrl}/jobs`

    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-2">
            <a
                href={jobsPageUrl}
                target="_top"
                rel="noopener noreferrer"
                className="block no-underline transition-transform hover:scale-[1.02]"
                style={{
                    backgroundColor: style.backgroundColor,
                    borderRadius: `${style.borderRadius}px`,
                    borderWidth: `${style.borderWidth}px`,
                    borderColor: style.borderColor,
                    borderStyle: 'solid',
                    color: style.textColor,
                    fontSize: `${style.fontSize}px`,
                    width: style.autoWidth ? '100vw' : '100%',
                    height: style.autoHeight ? '100vh' : 'auto',
                    maxWidth: style.autoWidth ? '100%' : `${widget.width}px`,
                    maxHeight: style.autoHeight ? '100%' : `${widget.height}px`,
                    overflow: 'hidden',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    cursor: 'pointer'
                }}
            >
                {/* Header */}
                <div
                    className="p-3 border-b flex justify-between items-center"
                    style={{ borderColor: style.borderColor }}
                >
                    <h3 className="font-medium truncate pr-2">{job?.name}</h3>
                    {config.fields.statusIndicator.enabled && (
                        <div
                            className={`h-2 w-2 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: isRunning ? (style.theme === 'custom' ? style.accentColor : '#10b981') : '#6b7280' }}
                        />
                    )}
                </div>

                {/* Body */}
                <div
                    className="p-3 flex-1 flex flex-col space-y-3 overflow-y-auto"
                >
                    {!isRunning && style.idleBehavior === 'minimal' ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-60 space-y-2">
                            <span className="text-xs uppercase tracking-wider font-semibold">Idle</span>
                            {fields.lastRunTime?.enabled && (
                                <div className="text-[10px] flex items-center gap-1" style={{ color: style.secondaryTextColor }}>
                                    <Clock className="h-3 w-3" />
                                    {job?.updated_at ? new Date(job.updated_at).toLocaleString() : "Recently"}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {enabledFields.map((fieldKey) => {
                                if (fieldKey === 'operationType') {
                                    return (
                                        <div
                                            key={fieldKey}
                                            className="flex items-center justify-between text-sm"
                                            style={{ color: style.secondaryTextColor }}
                                        >
                                            <span>{job?.operation?.toUpperCase()}</span>
                                            {enabledFields.includes('speed') && isRunning && currentSpeed > 0 && (
                                                <span className="font-mono" style={{ color: style.accentColor }}>
                                                    {(currentSpeed / 1024 / 1024).toFixed(1)} MB/s
                                                </span>
                                            )}
                                        </div>
                                    )
                                }

                                if (fieldKey === 'speed' && !enabledFields.includes('operationType')) {
                                    return isRunning && currentSpeed > 0 ? (
                                        <div key={fieldKey} className="flex justify-between text-xs" style={{ color: style.secondaryTextColor }}>
                                            <span>Speed</span>
                                            <span style={{ color: style.accentColor }}>{(currentSpeed / 1024 / 1024).toFixed(1)} MB/s</span>
                                        </div>
                                    ) : null
                                }

                                if (fieldKey === 'progressBar' && isRunning) {
                                    return (
                                        <div
                                            key={fieldKey}
                                            className="h-2 rounded-full overflow-hidden"
                                            style={{ backgroundColor: style.borderColor }}
                                        >
                                            <div
                                                className="h-full transition-all duration-300"
                                                style={{
                                                    backgroundColor: style.accentColor,
                                                    width: '50%',
                                                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                                                }}
                                            />
                                        </div>
                                    )
                                }

                                if (isRunning) {
                                    if (fieldKey === 'bytesTransferred') {
                                        return (
                                            <div key={fieldKey} className="flex justify-between text-xs font-mono" style={{ color: style.secondaryTextColor }}>
                                                <span>Transferred</span>
                                                <span>{(stats.bytes / 1024 / 1024).toFixed(1)} MB</span>
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'filesTransferred') {
                                        return (
                                            <div key={fieldKey} className="flex justify-between text-xs font-mono" style={{ color: style.secondaryTextColor }}>
                                                <span>Files</span>
                                                <span>{stats.transfers} files</span>
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'currentFile' && stats.transferring?.[0]?.name) {
                                        return (
                                            <div key={fieldKey} className="text-xs truncate" style={{ color: style.secondaryTextColor }}>
                                                {stats.transferring[0].name}
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'eta' && stats.eta) {
                                        return (
                                            <div key={fieldKey} className="text-xs" style={{ color: style.secondaryTextColor }}>
                                                ETA: {stats.eta}
                                            </div>
                                        )
                                    }
                                }

                                if (fieldKey === 'lastRunTime' && !isRunning) {
                                    return (
                                        <div key={fieldKey} className="flex justify-between text-xs italic" style={{ color: style.secondaryTextColor }}>
                                            <span>Last Run</span>
                                            <span>{job?.updated_at ? new Date(job.updated_at).toLocaleString() : "Recently"}</span>
                                        </div>
                                    )
                                }

                                return null
                            })}

                            {!isRunning && style.idleBehavior !== 'minimal' && (
                                <div
                                    className="text-center py-3 flex flex-col items-center"
                                    style={{ color: style.secondaryTextColor }}
                                >
                                    <Clock className="w-6 h-6 mb-1 opacity-30" />
                                    <span className="text-xs">Idle / Waiting</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </a>
        </div>
    )
}
