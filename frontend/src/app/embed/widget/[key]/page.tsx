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
                    if (eventData.type === "progress" && eventData.job_id === data.job?.id) {
                        setStats(eventData.stats)
                    }
                    if (eventData.type === "job_update" && eventData.job_id === data.job?.id) {
                        if (eventData.status === "success" || eventData.status === "failed") {
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
    const defaultStyle = {
        backgroundColor: "#111827",
        textColor: "#ffffff",
        secondaryTextColor: "#9ca3af",
        accentColor: "#8b5cf6",
        borderRadius: 8,
        borderColor: "#374151",
        borderWidth: 1,
        fontSize: 14,
        idleBehavior: 'keep' as const,
    }
    const style = { ...defaultStyle, ...config?.style }
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

    // Calculate progress percentage (matching jobs page logic)
    let progressPercent = 0
    if (stats?.totalBytes && stats.totalBytes > 0) {
        progressPercent = Math.min(100, (stats.bytes / stats.totalBytes) * 100)
    } else if (stats?.totalTransfers && stats.totalTransfers > 0) {
        progressPercent = Math.min(100, (stats.transfers / stats.totalTransfers) * 100)
    }
    const hasProgress = progressPercent > 0 && (stats?.bytes > 0 || stats?.transfers > 0)

    // Construct the jobs page URL
    const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''
    const jobsPageUrl = `${baseUrl}/jobs`

    return (
        <div className="bg-transparent flex items-start justify-center p-2">
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
                    width: `${widget.width}px`,
                    maxHeight: style.autoHeight ? undefined : `${widget.height}px`,
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
                    <h3 className="font-medium truncate pr-2">{widget.name}</h3>
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
                            <span className="uppercase tracking-wider font-semibold" style={{ fontSize: '0.75em' }}>Idle</span>
                            {fields.lastRunTime?.enabled && (
                                <div className="flex items-center gap-1" style={{ color: style.secondaryTextColor, fontSize: '0.65em' }}>
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
                                            className="flex items-center justify-between"
                                            style={{ color: style.secondaryTextColor, fontSize: '0.875em' }}
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
                                        <div key={fieldKey} className="flex justify-between" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
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
                                                    width: hasProgress ? `${Math.max(2, progressPercent)}%` : '0%',
                                                    opacity: hasProgress ? 1 : 0.5
                                                }}
                                            />
                                        </div>
                                    )
                                }

                                if (isRunning) {
                                    if (fieldKey === 'bytesTransferred') {
                                        return (
                                            <div key={fieldKey} className="flex justify-between font-mono" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
                                                <span>Transferred</span>
                                                <span>{(stats.bytes / 1024 / 1024).toFixed(1)} MB</span>
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'filesTransferred') {
                                        const transferred = stats.transfers || 0
                                        const totalFiles = stats.totalTransfers || stats.checks || transferred
                                        return (
                                            <div key={fieldKey} className="flex justify-between font-mono" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
                                                <span>File Counter</span>
                                                <span>{transferred}{totalFiles > transferred ? ` of ${totalFiles}` : ''}</span>
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'currentFile' && stats.transferring?.length > 0) {
                                        const transferCount = stats.transferring.length
                                        return (
                                            <div key={fieldKey} className="truncate" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
                                                {transferCount === 1
                                                    ? stats.transferring[0].name
                                                    : `${transferCount} files transferring...`}
                                            </div>
                                        )
                                    }
                                    if (fieldKey === 'eta' && stats.eta) {
                                        // Parse eta (format like "1h2m3s" or "5m30s" or "45s")
                                        const etaStr = String(stats.eta)
                                        const hoursMatch = etaStr.match(/(\d+)h/)
                                        const minsMatch = etaStr.match(/(\d+)m/)
                                        const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0
                                        const mins = minsMatch ? parseInt(minsMatch[1]) : 0
                                        const totalMins = hours * 60 + mins

                                        let etaDisplay = ''
                                        if (totalMins >= 60) {
                                            const h = Math.floor(totalMins / 60)
                                            const m = totalMins % 60
                                            etaDisplay = m > 0 ? `${h}h ${m}m` : `${h}h`
                                        } else if (totalMins > 0) {
                                            etaDisplay = `${totalMins}m`
                                        } else {
                                            etaDisplay = '< 1m'
                                        }

                                        return (
                                            <div key={fieldKey} className="flex justify-between" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
                                                <span>Time Remaining</span>
                                                <span>{etaDisplay}</span>
                                            </div>
                                        )
                                    }
                                }

                                if (fieldKey === 'lastRunTime' && !isRunning) {
                                    return (
                                        <div key={fieldKey} className="flex justify-between italic" style={{ color: style.secondaryTextColor, fontSize: '0.75em' }}>
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
                                    <span style={{ fontSize: '0.75em' }}>Idle / Waiting</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </a>
        </div>
    )
}
