"use client"

import { useEffect, useState, Suspense, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type EmbedWidget, type WidgetConfig, type Job } from "@/lib/api"
import { toast } from "sonner"
import { ArrowLeft, Save, Copy, RotateCw, Eye, GripVertical } from "lucide-react"
import Link from "next/link"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// Default config if none exists
const DEFAULT_CONFIG: WidgetConfig = {
    fields: {
        statusIndicator: { enabled: true, order: 1 },
        progressBar: { enabled: true, order: 2 },
        speed: { enabled: true, order: 3 },
        bytesTransferred: { enabled: true, order: 4 },
        eta: { enabled: false, order: 5 },
        filesTransferred: { enabled: false, order: 6 },
        currentFile: { enabled: false, order: 7 },
        operationType: { enabled: false, order: 8 },
        lastRunTime: { enabled: false, order: 9 }
    },
    style: {
        backgroundColor: "#111827",
        backgroundOpacity: 1.0,
        textColor: "#ffffff",
        secondaryTextColor: "#9ca3af",
        accentColor: "#8b5cf6",
        borderRadius: 8,
        borderColor: "#374151",
        borderWidth: 1,
        fontSize: 14,
        theme: "dark",
        autoWidth: true,
        autoHeight: true,
        idleBehavior: 'keep'
    },
    layout: "vertical"
}

const FIELD_LABELS: Record<string, string> = {
    statusIndicator: "Status Indicator",
    progressBar: "Progress Bar",
    speed: "Transfer Speed",
    bytesTransferred: "Bytes Transferred",
    eta: "Estimated Time",
    filesTransferred: "Files Transferred",
    currentFile: "Current File",
    operationType: "Operation Type",
    lastRunTime: "Last Run Time"
}

interface SortableFieldProps {
    id: string
    label: string
    enabled: boolean
    onToggle: () => void
}

function SortableField({ id, label, enabled, onToggle }: SortableFieldProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        position: 'relative' as const,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center justify-between p-2 rounded hover:bg-zinc-800/50 ${isDragging ? "bg-zinc-800 shadow-lg" : ""}`}
        >
            <div className="flex items-center gap-2">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-zinc-600" />
                </div>
                <span className="text-sm">{label}</span>
            </div>
            <Switch
                checked={enabled}
                onCheckedChange={onToggle}
            />
        </div>
    )
}

function WidgetEditorContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const widgetId = searchParams.get("id")

    const [widget, setWidget] = useState<EmbedWidget | null>(null)
    const [job, setJob] = useState<Job | null>(null)
    const [jobs, setJobs] = useState<Job[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const isNewWidget = !widgetId

    // Editable state
    const [name, setName] = useState("")
    const [width, setWidth] = useState(350)
    const [height, setHeight] = useState(150)
    const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG)
    const [isMockRunning, setIsMockRunning] = useState(true)
    const [actualDimensions, setActualDimensions] = useState({ width: 0, height: 0 })
    const previewRef = useRef<HTMLDivElement>(null)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    useEffect(() => {
        // Load all jobs for the selector
        api.getJobs().then(setJobs).catch(console.error)

        if (!widgetId) {
            // New widget mode - use defaults
            setName("New Widget")
            setConfig(DEFAULT_CONFIG)
            setLoading(false)
            return
        }

        api.getWidget(parseInt(widgetId)).then(async (w) => {
            setWidget(w)
            setName(w.name)
            setWidth(w.width)
            setHeight(w.height)
            // Deep merge config with defaults to handle new fields
            const mergedConfig: WidgetConfig = {
                ...DEFAULT_CONFIG,
                ...(w.config || {}),
                fields: {
                    ...DEFAULT_CONFIG.fields,
                    ...(w.config?.fields || {})
                },
                style: {
                    ...DEFAULT_CONFIG.style,
                    ...(w.config?.style || {})
                }
            }
            setConfig(mergedConfig)

            // Fetch job info
            const jobData = await api.getJob(w.job_id)
            setJob(jobData)
        }).catch((err) => {
            toast.error("Widget not found")
            router.push("/widgets")
        }).finally(() => setLoading(false))
    }, [widgetId, router])

    useEffect(() => {
        if (!previewRef.current) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setActualDimensions({
                    width: Math.round(entry.contentRect.width),
                    height: Math.round(entry.contentRect.height)
                })
            }
        })

        observer.observe(previewRef.current)
        return () => observer.disconnect()
    }, [previewRef.current])

    const handleSave = async () => {
        if (isNewWidget && !job) {
            toast.error("Please select a job first")
            return
        }
        setSaving(true)
        try {
            if (isNewWidget) {
                // Create new widget
                const created = await api.createWidget({
                    job_id: job!.id,
                    name,
                    width,
                    height,
                    config
                })
                toast.success("Widget created")
                router.push(`/widgets/editor?id=${created.id}`)
            } else if (widget) {
                // Update existing widget
                const updated = await api.updateWidget(widget.id, {
                    name,
                    width,
                    height,
                    config
                })
                setWidget(updated)
                toast.success("Widget saved")
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to save")
        } finally {
            setSaving(false)
        }
    }

    const toggleField = (fieldKey: string) => {
        setConfig(prev => ({
            ...prev,
            fields: {
                ...prev.fields,
                [fieldKey]: {
                    ...prev.fields[fieldKey as keyof typeof prev.fields],
                    enabled: !prev.fields[fieldKey as keyof typeof prev.fields].enabled
                }
            }
        }))
    }

    const updateStyle = (key: keyof WidgetConfig['style'], value: any) => {
        setConfig(prev => ({
            ...prev,
            style: {
                ...prev.style,
                [key]: value
            }
        }))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const fieldKeys = Object.keys(config.fields)
            const oldIndex = fieldKeys.indexOf(active.id as string)
            const newIndex = fieldKeys.indexOf(over.id as string)

            const newOrderedKeys = arrayMove(fieldKeys, oldIndex, newIndex)

            const newFields = { ...config.fields }
            newOrderedKeys.forEach((key, index) => {
                newFields[key as keyof typeof newFields].order = index
            })

            setConfig(prev => ({
                ...prev,
                fields: newFields
            }))
        }
    }

    const copyEmbedCode = () => {
        if (!widget) return
        const url = `${window.location.protocol}//${window.location.host}/embed/widget/${widget.embed_key}`
        const w = config.style.autoWidth ? '100%' : width
        const h = config.style.autoHeight ? '100%' : height
        const code = `<iframe src="${url}" width="${w}" height="${h}" frameborder="0"></iframe>`
        navigator.clipboard.writeText(code)
        toast.success("Embed code copied")
    }

    const handleRotateKey = async () => {
        if (!widget) return
        if (!confirm("Rotate embed key? This will invalidate existing embed URLs.")) return
        try {
            const updated = await api.rotateWidgetKey(widget.id)
            setWidget(updated)
            toast.success("Embed key rotated")
        } catch (err: any) {
            toast.error(err.message || "Failed to rotate key")
        }
    }

    if (loading) {
        return <div className="p-6 text-white">Loading...</div>
    }

    if (!widget && !isNewWidget) return null

    // Get sorted enabled fields
    const enabledFields = Object.entries(config.fields)
        .filter(([_, v]) => v.enabled)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([k]) => k)

    return (
        <div className="p-6 text-white min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/widgets">
                        <Button variant="ghost" size="icon" className="hover:bg-white/10">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-white">{isNewWidget ? 'New Widget' : 'Widget Editor'}</h2>
                        <p className="text-zinc-400 text-sm">{isNewWidget ? 'Create a new embeddable widget' : 'Customize how your widget appears'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-3 mr-2 h-9">
                        <span className="text-xs text-zinc-400">Preview State:</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-zinc-500 w-12 text-center">{isMockRunning ? 'Running' : 'Idle'}</span>
                            <Switch
                                size="sm"
                                checked={isMockRunning}
                                onCheckedChange={setIsMockRunning}
                            />
                        </div>
                    </div>
                    {!isNewWidget && (
                        <>
                            <Button variant="outline" size="sm" onClick={copyEmbedCode}>
                                <Copy className="h-4 w-4 mr-2" /> Embed Code
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleRotateKey}>
                                <RotateCw className="h-4 w-4 mr-2" /> Rotate Key
                            </Button>
                        </>
                    )}
                    <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
                        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : isNewWidget ? "Create" : "Save"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Field Selector */}
                <Card className="bg-card border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Fields</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={Object.keys(config.fields)
                                    .filter(key => key !== 'jobName')
                                    .sort((a, b) =>
                                        config.fields[a as keyof typeof config.fields].order -
                                        config.fields[b as keyof typeof config.fields].order
                                    )}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-1">
                                    {Object.entries(config.fields)
                                        .filter(([key]) => key !== 'jobName')
                                        .sort((a, b) => a[1].order - b[1].order)
                                        .map(([key, field]) => (
                                            <SortableField
                                                key={key}
                                                id={key}
                                                label={FIELD_LABELS[key]}
                                                enabled={field.enabled}
                                                onToggle={() => toggleField(key)}
                                            />
                                        ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </CardContent>
                </Card>

                {/* Center: Preview */}
                <Card className="bg-card border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Eye className="h-4 w-4" /> Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center p-4 bg-zinc-900/50 rounded-lg min-h-[300px]">
                            <div
                                style={{
                                    width: config.style.autoWidth ? '100%' : `${Math.min(width, 400)}px`,
                                    height: config.style.autoHeight ? '100%' : `${Math.min(height, 250)}px`,
                                    minWidth: config.style.autoWidth ? '150px' : undefined,
                                    minHeight: config.style.autoHeight ? '50px' : undefined,
                                    backgroundColor: config.style.backgroundColor,
                                    opacity: config.style.backgroundOpacity,
                                    borderRadius: `${config.style.borderRadius}px`,
                                    borderWidth: `${config.style.borderWidth}px`,
                                    borderColor: config.style.borderColor,
                                    borderStyle: 'solid',
                                    fontSize: `${config.style.fontSize}px`,
                                    color: config.style.textColor,
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                                ref={previewRef}
                            >
                                <div className="p-3 border-b flex justify-between items-center" style={{ borderColor: config.style.borderColor }}>
                                    <span className="font-medium truncate">{job?.name || "Job Name"}</span>
                                    {config.fields.statusIndicator.enabled && (
                                        <span
                                            className={`h-2 w-2 rounded-full ${isMockRunning ? 'animate-pulse' : ''}`}
                                            style={{ backgroundColor: isMockRunning ? (config.style.theme === 'custom' ? config.style.accentColor : '#10b981') : '#6b7280' }}
                                        />
                                    )}
                                </div>
                                <div className="p-3 flex-1 space-y-2 overflow-y-auto">
                                    {!isMockRunning && config.style.idleBehavior === 'minimal' ? (
                                        <div className="space-y-2 flex flex-col items-center justify-center h-full opacity-60">
                                            <span className="text-xs uppercase tracking-wider font-semibold">Idle</span>
                                            {config.fields.lastRunTime?.enabled && (
                                                <div className="text-[10px]" style={{ color: config.style.secondaryTextColor }}>
                                                    Last run: Jan 5, 2026 11:30 AM
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        enabledFields.map((fieldKey) => {
                                            if (fieldKey === 'operationType') {
                                                return (
                                                    <div key={fieldKey} className="text-xs" style={{ color: config.style.secondaryTextColor }}>
                                                        {job?.operation?.toUpperCase() || "SYNC"}
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'progressBar') {
                                                return (
                                                    <div key={fieldKey} className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: config.style.borderColor }}>
                                                        <div
                                                            className="h-full w-1/2 transition-all"
                                                            style={{ backgroundColor: config.style.accentColor }}
                                                        />
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'speed') {
                                                return (
                                                    <div key={fieldKey} className="flex justify-between text-xs" style={{ color: config.style.secondaryTextColor }}>
                                                        <span>Speed</span>
                                                        <span style={{ color: config.style.accentColor }}>12.5 MB/s</span>
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'bytesTransferred') {
                                                return (
                                                    <div key={fieldKey} className="flex justify-between text-xs" style={{ color: config.style.secondaryTextColor }}>
                                                        <span>Transferred</span>
                                                        <span>1.2 GB</span>
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'filesTransferred') {
                                                return (
                                                    <div key={fieldKey} className="flex justify-between text-xs" style={{ color: config.style.secondaryTextColor }}>
                                                        <span>Files</span>
                                                        <span>42 / 100</span>
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'eta') {
                                                return (
                                                    <div key={fieldKey} className="flex justify-between text-xs" style={{ color: config.style.secondaryTextColor }}>
                                                        <span>ETA</span>
                                                        <span>~5 min</span>
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'currentFile') {
                                                return (
                                                    <div key={fieldKey} className="text-xs truncate pt-1 opacity-80" style={{ color: config.style.secondaryTextColor }}>
                                                        sample-data-transfer.zip
                                                    </div>
                                                )
                                            }
                                            if (fieldKey === 'lastRunTime') {
                                                return (
                                                    <div key={fieldKey} className="flex justify-between text-xs italic" style={{ color: config.style.secondaryTextColor }}>
                                                        <span>Last Run</span>
                                                        <span>Jan 5, 12:00 PM</span>
                                                    </div>
                                                )
                                            }
                                            return null
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-center text-muted-foreground mt-2">
                            Actual size: {actualDimensions.width} × {actualDimensions.height} px
                        </p>
                    </CardContent>
                </Card>

                {/* Right: Style Controls */}
                <Card className="bg-card border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isNewWidget && (
                            <div className="space-y-2">
                                <Label>Job <span className="text-red-400">*</span></Label>
                                <select
                                    value={job?.id || ""}
                                    onChange={(e) => {
                                        const selectedJob = jobs.find(j => j.id === parseInt(e.target.value))
                                        setJob(selectedJob || null)
                                    }}
                                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="">Select a job...</option>
                                    {jobs.map(j => (
                                        <option key={j.id} value={j.id}>{j.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Widget Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-background border-border"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Width</Label>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-zinc-500">Responsive</span>
                                        <Switch
                                            size="sm"
                                            checked={config.style.autoWidth}
                                            onCheckedChange={(val) => updateStyle('autoWidth', val)}
                                        />
                                    </div>
                                </div>
                                {!config.style.autoWidth && (
                                    <Input
                                        type="number"
                                        value={width}
                                        onChange={(e) => setWidth(parseInt(e.target.value) || 350)}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="bg-background border-border"
                                    />
                                )}
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Height</Label>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-zinc-500">Responsive</span>
                                        <Switch
                                            size="sm"
                                            checked={config.style.autoHeight}
                                            onCheckedChange={(val) => updateStyle('autoHeight', val)}
                                        />
                                    </div>
                                </div>
                                {!config.style.autoHeight && (
                                    <Input
                                        type="number"
                                        value={height}
                                        onChange={(e) => setHeight(parseInt(e.target.value) || 150)}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="bg-background border-border"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Background Color</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="color"
                                    value={config.style.backgroundColor}
                                    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                                    className="w-12 h-10 p-1 bg-background border-border"
                                />
                                <Input
                                    value={config.style.backgroundColor}
                                    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                                    className="flex-1 bg-background border-border font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Text Color</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="color"
                                    value={config.style.textColor}
                                    onChange={(e) => updateStyle('textColor', e.target.value)}
                                    className="w-12 h-10 p-1 bg-background border-border"
                                />
                                <Input
                                    value={config.style.textColor}
                                    onChange={(e) => updateStyle('textColor', e.target.value)}
                                    className="flex-1 bg-background border-border font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Accent Color</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="color"
                                    value={config.style.accentColor}
                                    onChange={(e) => updateStyle('accentColor', e.target.value)}
                                    className="w-12 h-10 p-1 bg-background border-border"
                                />
                                <Input
                                    value={config.style.accentColor}
                                    onChange={(e) => updateStyle('accentColor', e.target.value)}
                                    className="flex-1 bg-background border-border font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-zinc-800">
                            <Label>Idle Behavior</Label>
                            <div className="flex items-center justify-between bg-zinc-900/50 p-2 rounded-md">
                                <span className="text-xs text-zinc-400">
                                    {config.style.idleBehavior === 'minimal' ? 'Minimal Info' : 'Show Last Stats'}
                                </span>
                                <Switch
                                    size="sm"
                                    checked={config.style.idleBehavior === 'minimal'}
                                    onCheckedChange={(val) => updateStyle('idleBehavior', val ? 'minimal' : 'keep')}
                                />
                            </div>
                            <p className="text-[10px] text-zinc-500">
                                "Minimal" shows only Name, Status, and Last Run Time when idle.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Border Radius: {config.style.borderRadius}px</Label>
                            <input
                                type="range"
                                min={0}
                                max={24}
                                step={1}
                                value={config.style.borderRadius}
                                onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value))}
                                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Font Size: {config.style.fontSize}px</Label>
                            <input
                                type="range"
                                min={10}
                                max={20}
                                step={1}
                                value={config.style.fontSize}
                                onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))}
                                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default function WidgetEditorPage() {
    return (
        <Suspense fallback={<div className="p-6 text-white">Loading...</div>}>
            <WidgetEditorContent />
        </Suspense>
    )
}
