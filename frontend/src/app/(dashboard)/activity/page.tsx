"use client"

import { useEffect, useState } from "react"
import { api, type JobHistory } from "@/lib/api"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, Zap, FileText, Settings, Timer, ShieldCheck, CalendarClock, Play, Globe } from "lucide-react"
import { format, differenceInSeconds } from "date-fns"
import { SearchInput } from "@/components/ui/search-input"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useDataTable } from "@/hooks/use-data-table"
import { ColumnDef, flexRender } from "@tanstack/react-table"

export default function ActivityPage() {
    const [history, setHistory] = useState<JobHistory[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null)
    const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null)

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true)
                const data = await api.getHistory()
                setHistory(data)
            } catch (error) {
                console.error("Failed to fetch history:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchHistory()
    }, [])

    const formatSpeed = (bytesPerSec?: number) => {
        if (!bytesPerSec) return "—"
        if (bytesPerSec > 1024 * 1024) {
            return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
        }
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    }

    const parseDate = (dateStr: string) => {
        const normalized = dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)
            ? dateStr
            : dateStr + 'Z'
        return new Date(normalized)
    }

    const formatDateTime = (dateStr?: string) => {
        if (!dateStr) return "—"
        try {
            return format(parseDate(dateStr), "MMM d, HH:mm:ss")
        } catch {
            return "—"
        }
    }

    const formatDuration = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return "—"
        try {
            const seconds = differenceInSeconds(parseDate(endStr), parseDate(startStr))
            if (seconds < 60) return `${seconds}s`
            if (seconds < 3600) {
                const mins = Math.floor(seconds / 60)
                const secs = seconds % 60
                return `${mins}m ${secs}s`
            }
            const hours = Math.floor(seconds / 3600)
            const mins = Math.floor((seconds % 3600) / 60)
            return `${hours}h ${mins}m`
        } catch {
            return "—"
        }
    }

    const columns: ColumnDef<JobHistory>[] = [
        {
            accessorKey: "status",
            header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
            cell: ({ row }) => {
                const item = row.original
                const errorMsg = item.details?.error || item.details?.lastError || "Unknown error"
                return (
                    <TooltipProvider>
                        {item.status === "success" ? (
                            <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Success
                            </Badge>
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0 cursor-help">
                                        <XCircle className="w-3 h-3 mr-1" /> Failed
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs bg-zinc-900 border-zinc-700">
                                    <p className="text-xs text-red-400 break-words">{errorMsg}</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </TooltipProvider>
                )
            }
        },
        {
            accessorKey: "job_name",
            header: ({ column }) => <SortableHeader column={column}>Job Name</SortableHeader>,
            cell: ({ row }) => {
                const item = row.original
                const usedChecksum = item.job_snapshot?.use_checksum
                return (
                    <button
                        onClick={() => setSelectedSnapshot(item.job_snapshot)}
                        className="font-medium text-white hover:text-primary transition-colors text-left flex items-center gap-1"
                        title="View job configuration at time of run"
                    >
                        {item.job_name || "Unknown Job"}
                        {item.job_snapshot && <Settings className="w-3 h-3 text-zinc-500" />}
                        {usedChecksum && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <ShieldCheck className="w-3 h-3 text-green-500" />
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-zinc-900 border-zinc-700">
                                        <p className="text-xs">Checksum verified</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </button>
                )
            }
        },
        {
            id: "trigger",
            header: "Trigger",
            cell: ({ row }) => {
                const execType = row.original.job_snapshot?.execution_type || "manual"
                switch (execType) {
                    case "schedule":
                        return (
                            <div className="flex items-center gap-1 text-xs text-blue-400">
                                <CalendarClock className="w-3 h-3" />
                                <span>Schedule</span>
                            </div>
                        )
                    case "api":
                        return (
                            <div className="flex items-center gap-1 text-xs text-purple-400">
                                <Globe className="w-3 h-3" />
                                <span>API</span>
                            </div>
                        )
                    default:
                        return (
                            <div className="flex items-center gap-1 text-xs text-amber-400">
                                <Play className="w-3 h-3" />
                                <span>Manual</span>
                            </div>
                        )
                }
            }
        },
        {
            accessorKey: "started_at",
            header: ({ column }) => <SortableHeader column={column}>Start Time</SortableHeader>,
            cell: ({ row }) => (
                <div className="flex items-center text-xs text-zinc-400">
                    <Clock className="w-3 h-3 mr-1 text-zinc-500" />
                    {formatDateTime(row.original.started_at)}
                </div>
            )
        },
        {
            accessorKey: "completed_at",
            header: ({ column }) => <SortableHeader column={column}>End Time</SortableHeader>,
            cell: ({ row }) => (
                <div className="flex items-center text-xs text-zinc-400">
                    <Clock className="w-3 h-3 mr-1 text-zinc-500" />
                    {formatDateTime(row.original.completed_at)}
                </div>
            )
        },
        {
            id: "duration",
            header: "Duration",
            cell: ({ row }) => (
                <div className="flex items-center text-xs text-zinc-400">
                    <Timer className="w-3 h-3 mr-1 text-primary" />
                    {formatDuration(row.original.started_at, row.original.completed_at)}
                </div>
            )
        },
        {
            id: "speed",
            header: "Avg Speed",
            cell: ({ row }) => (
                <div className="flex items-center text-xs text-zinc-400">
                    <Zap className="w-3 h-3 mr-1 text-amber-400" />
                    {formatSpeed(row.original.avg_speed)}
                </div>
            )
        },
        {
            id: "files",
            header: "Files",
            cell: ({ row }) => {
                const item = row.original
                return item.files_transferred && item.files_transferred.length > 0 ? (
                    <button
                        onClick={() => setSelectedFiles(item.files_transferred || [])}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                        <FileText className="w-3 h-3" />
                        {item.files_transferred.length}
                    </button>
                ) : (
                    <span className="text-xs text-zinc-600">—</span>
                )
            }
        }
    ]

    const { table } = useDataTable({
        data: history,
        columns,
        searchColumn: "job_name"
    })

    return (
        <div className="p-6 text-white min-h-screen">
            <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-white">Activity History</h2>
                <p className="text-zinc-400 text-sm mt-1">View completed and failed transfer jobs.</p>
            </div>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={(table.getColumn("job_name")?.getFilterValue() as string) ?? ""}
                    onChange={(event) => table.getColumn("job_name")?.setFilterValue(event)}
                    placeholder="Search jobs..."
                />
            </div>

            <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border/50 hover:bg-transparent">
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
                        {loading && history.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center h-24 text-zinc-500">Loading...</TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className="border-border/50 hover:bg-zinc-800/30 transition-colors">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center h-24 text-zinc-500">No activity recorded.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Files Modal */}
            <Dialog open={!!selectedFiles} onOpenChange={() => setSelectedFiles(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle>Transferred Files</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                        {selectedFiles?.map((file, i) => (
                            <div key={i} className="px-3 py-2 bg-zinc-900/50 rounded text-sm font-mono text-zinc-300 truncate" title={file}>
                                {file}
                            </div>
                        ))}
                        {selectedFiles?.length === 0 && (
                            <p className="text-zinc-500 text-sm">No files recorded.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Job Snapshot Modal */}
            <Dialog open={!!selectedSnapshot} onOpenChange={() => setSelectedSnapshot(null)}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle>Job Configuration (At Time of Run)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {selectedSnapshot && Object.entries(selectedSnapshot).map(([key, value]) => (
                            <div key={key} className="grid grid-cols-3 gap-2 py-2 border-b border-zinc-800/50 last:border-0">
                                <span className="text-zinc-500 text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="col-span-2 text-white font-mono text-sm">
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                                </span>
                            </div>
                        ))}
                        {!selectedSnapshot && (
                            <p className="text-zinc-500 text-sm">No configuration snapshot available.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
