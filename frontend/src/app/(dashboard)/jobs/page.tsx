"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { api, type Job, type Schedule, type ListParams } from "@/lib/api"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { Plus, Play, Trash2, Square, Power, PowerOff } from "lucide-react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { SearchInput } from "@/components/ui/search-input"
import { InlineSelect } from "@/components/ui/inline-select"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useDataTable } from "@/hooks/use-data-table"
import { PageHeader } from "@/components/layout/PageHeader"
import { ColumnDef, flexRender } from "@tanstack/react-table"
import { useRouter } from "next/navigation"

export default function JobsPage() {
    const router = useRouter()
    const [jobs, setJobs] = useState<Job[]>([])
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [loading, setLoading] = useState(true)
    const [searchValue, setSearchValue] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [jobStatusMap, setJobStatusMap] = useState<Record<number, {
        status: 'idle' | 'running' | 'success' | 'failed',
        stats?: any,
        error?: string,
        timestamp?: number
    }>>({})

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchValue])

    // Fetch jobs when search changes
    const fetchJobs = async () => {
        setLoading(true)
        try {
            const params: ListParams = {}
            if (debouncedSearch) params.search = debouncedSearch
            const jobsData = await api.getJobs(params)
            setJobs(jobsData)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchJobs()
    }, [debouncedSearch])

    // Fetch schedules once
    useEffect(() => {
        api.getSchedules().then(setSchedules).catch(console.error)

        const evtSource = new EventSource("/api/events")

        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === 'progress') {
                setJobStatusMap(prev => ({
                    ...prev,
                    [data.job_id]: { status: 'running', stats: data.stats, timestamp: Date.now() }
                }))
            } else if (data.type === 'job_update') {
                const { job_id, status, error } = data;

                // Update specific job in the list
                setJobs(prevJobs => prevJobs.map(job =>
                    job.id === job_id
                        ? { ...job, last_status: status, last_error: error, last_run: status === 'success' || status === 'failed' ? new Date().toISOString() : job.last_run }
                        : job
                ));

                setJobStatusMap(prev => ({
                    ...prev,
                    [job_id]: { status: status, error: error, timestamp: Date.now() }
                }))

                if (status === 'success') toast.success("Job completed")
                if (status === 'failed') toast.error(`Job failed: ${error || "Unknown"}`)
            }
        }

        evtSource.onerror = () => {
            // Only re-fetch on error to ensure sync, but less frequently?
            // Actually, we can just leave it for now or retry connection.
        }

        return () => evtSource.close()
    }, [])

    async function handleDelete(id: number) {
        if (!confirm("Delete this job?")) return
        await api.deleteJob(id)
        fetchJobs()
    }

    async function handleToggle(job: Job) {
        try {
            await api.toggleJob(job.id, !job.enabled)
            fetchJobs()
            toast.success(job.enabled ? "Job disabled" : "Job enabled")
        } catch {
            toast.error("Failed to toggle job")
        }
    }



    const formatDate = (date?: string) => {
        if (!date) return "—"
        const dateStr = date.includes('Z') || date.includes('+') || date.includes('-', 10) ? date : date + 'Z'
        const d = new Date(dateStr)
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    const columns: ColumnDef<Job>[] = [
        {
            id: "enabled",
            header: "",
            size: 40,
            cell: ({ row }) => {
                const job = row.original
                return (
                    <div className="w-8 px-2" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleToggle(job); }}
                            className={`p-1 rounded ${job.enabled !== false ? 'text-primary hover:text-primary/80' : 'text-zinc-500 hover:text-zinc-400'}`}
                            title={job.enabled !== false ? "Disable job" : "Enable job"}
                        >
                            {job.enabled !== false ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                        </button>
                    </div>
                )
            }
        },
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => (
                <button
                    onClick={() => router.push(`/jobs/new?edit=${row.original.id}`)}
                    className="hover:text-primary transition-colors text-left font-medium"
                >
                    {row.getValue("name")}
                </button>
            )
        },
        {
            accessorKey: "operation",
            header: ({ column }) => <SortableHeader column={column}>Operation</SortableHeader>,
            cell: ({ row }) => (
                <div onClick={e => e.stopPropagation()}>
                    <InlineSelect
                        value={row.getValue("operation")}
                        options={[
                            { label: 'Sync', value: 'sync' },
                            { label: 'Copy', value: 'copy' },
                            { label: 'Move', value: 'move' }
                        ]}
                        onSave={(val) => api.patchJob(row.original.id, { operation: val }).then(() => fetchJobs())}
                    />
                </div>
            )
        },
        {
            accessorKey: "transfer_method",
            header: ({ column }) => <SortableHeader column={column}>Method</SortableHeader>,
            cell: ({ row }) => (
                <div onClick={e => e.stopPropagation()}>
                    <InlineSelect
                        value={row.original.transfer_method || 'direct'}
                        options={[
                            { label: 'Direct', value: 'direct' },
                            { label: 'Proxy', value: 'proxy' }
                        ]}
                        onSave={(val) => api.patchJob(row.original.id, { transfer_method: val as any }).then(() => fetchJobs())}
                    />
                </div>
            )
        },
        {
            accessorKey: "schedule",
            header: ({ column }) => <SortableHeader column={column}>Schedule</SortableHeader>,
            cell: ({ row }) => (
                <div onClick={e => e.stopPropagation()}>
                    <InlineSelect
                        value={row.original.schedule ? (schedules.find(s => s.config?.cron === row.original.schedule)?.name || row.original.schedule) : "Manual"}
                        options={[
                            { label: 'Manual', value: 'Manual' },
                            ...schedules.map(s => ({ label: s.name, value: s.config?.cron || s.id.toString() }))
                        ]}
                        onSave={(val) => {
                            const updateVal = val === "Manual" ? "Manual" : val;
                            return api.patchJob(row.original.id, { schedule: updateVal }).then(() => fetchJobs())
                        }}
                    />
                </div>
            )
        },
        {
            accessorKey: "last_run",
            header: ({ column }) => <SortableHeader column={column}>Last Run</SortableHeader>,
            cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.getValue("last_run"))}</span>
        },
        {
            accessorKey: "next_run",
            header: ({ column }) => <SortableHeader column={column}>Next Run</SortableHeader>,
            cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.getValue("next_run"))}</span>
        },
        {
            id: "status",
            header: "Status",
            cell: ({ row }) => {
                const job = row.original
                const statusObj = jobStatusMap[job.id] || {
                    status: job.last_status || 'idle',
                    error: job.last_error
                }

                if (statusObj.status === 'running') {
                    const stats = statusObj.stats
                    let percent = 0
                    if (stats?.totalBytes && stats.totalBytes > 0) {
                        percent = Math.min(100, (stats.bytes / stats.totalBytes) * 100)
                    } else if (stats?.totalTransfers && stats.totalTransfers > 0) {
                        percent = Math.min(100, (stats.transfers / stats.totalTransfers) * 100)
                    }
                    const hasProgress = percent > 0 && (stats?.bytes > 0 || stats?.transfers > 0)

                    let currentSpeed = 0
                    if (stats?.transferring && Array.isArray(stats.transferring) && stats.transferring.length > 0) {
                        currentSpeed = stats.transferring.reduce((sum: number, t: any) => sum + (t.speedAvg || t.speed || 0), 0)
                    } else if (stats?.speed) {
                        currentSpeed = stats.speed
                    }

                    return (
                        <div className="space-y-1 w-40">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-violet-400 font-medium">
                                    {hasProgress ? `${percent.toFixed(0)}%` : 'Starting...'}
                                </span>
                                {currentSpeed > 0 ? (
                                    <span className="text-muted-foreground">
                                        {(currentSpeed / 1024 / 1024).toFixed(1)} MB/s
                                    </span>
                                ) : null}
                            </div>
                            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-violet-500 transition-all duration-300"
                                    style={{
                                        width: hasProgress ? `${Math.max(2, percent)}%` : '0%',
                                        opacity: hasProgress ? 1 : 0
                                    }}
                                />
                            </div>
                        </div>
                    )
                }

                if (statusObj.status === 'failed') {
                    return (
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <span className="text-xs text-red-400 font-medium">Failed</span>
                        </div>
                    )
                }

                return (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-zinc-500" />
                        <span className="text-xs">Idle</span>
                    </div>
                )
            }
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const job = row.original
                return (
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Run Job"
                            onClick={async (e) => {
                                e.stopPropagation()
                                if (job.enabled === false) {
                                    toast.error("Cannot start disabled job")
                                    return
                                }
                                setJobStatusMap(prev => ({ ...prev, [job.id]: { status: 'running', timestamp: Date.now() } }))
                                try {
                                    await api.runJob(job.id)
                                    toast.success("Job started")
                                } catch (err: any) {
                                    toast.error(err.message || "Failed")
                                    setJobStatusMap(prev => ({ ...prev, [job.id]: { status: 'failed', error: err.message, timestamp: Date.now() } }))
                                }
                            }}
                        >
                            <Play className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:text-orange-400 hover:bg-orange-400/10 transition-colors"
                            title="Stop Job"
                            onClick={async (e) => {
                                e.stopPropagation()
                                await api.stopJob(job.id)
                                toast.success("Stop requested")
                            }}
                        >
                            <Square className="h-4 w-4 text-orange-400" />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Delete Job"
                            onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                        >
                            <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                    </div>
                )
            }
        }
    ]

    const { table } = useDataTable({
        data: jobs,
        columns,
    })

    return (
        <div className="p-6">
            <PageHeader
                title="Jobs"
                description="Orchestrate and monitor your file transfer tasks."
                actionLabel="New Job"
                actionHref="/jobs/new"
            />



            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search jobs..."
                />
            </div>

            <div className="rounded-md border border-border bg-card">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">Loading...</TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={`border-border/50 hover:bg-zinc-800/30 transition-colors group ${row.original.enabled === false ? 'opacity-50' : ''}`}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">No jobs configured</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
