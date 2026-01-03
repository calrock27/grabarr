"use client"

import { useEffect, useState } from "react"
import { api, type Schedule } from "@/lib/api"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import cronstrue from "cronstrue";
import { getNextRunDate } from "@/lib/cron";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { SearchInput } from "@/components/ui/search-input"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useDataTable } from "@/hooks/use-data-table"
import { ColumnDef, flexRender } from "@tanstack/react-table"
import { Plus, Trash2, Calendar, Copy } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { CronBuilder } from "@/components/scheduler/CronBuilder"

export default function SchedulesPage() {
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isOpen, setIsOpen] = useState(false)

    // State
    const [name, setName] = useState("")
    const [cronValue, setCronValue] = useState("*/15 * * * *")
    const [currentTime, setCurrentTime] = useState<Date | null>(null)

    useEffect(() => {
        loadData()
        setCurrentTime(new Date())
        const interval = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    async function loadData() {
        try {
            const data = await api.getSchedules()
            setSchedules(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("Are you sure?")) return
        await api.deleteSchedule(id)
        loadData()
    }

    function handleClone(sched: Schedule) {
        setName(`${sched.name} (Copy)`)
        if (sched.schedule_type === "interval") {
            setCronValue(`*/${sched.config.minutes} * * * *`)
        } else {
            setCronValue(sched.config.cron || "* * * * *")
        }
        setEditingId(null) // New create
        setIsOpen(true)
    }

    function resetForm() {
        setName("")
        setCronValue("*/15 * * * *")
        setEditingId(null)
    }

    async function handleCreate() {
        // Detect if simple interval
        let type = "cron"
        let config: any = { cron: cronValue }

        if (cronValue.startsWith("*/") && cronValue.endsWith(" * * * *")) {
            // It's an interval!
            const mins = cronValue.split(" ")[0].replace("*/", "")
            if (!isNaN(parseInt(mins))) {
                type = "interval"
                config = { minutes: parseInt(mins) }
            }
        }

        try {
            const payload = {
                name,
                schedule_type: type,
                config
            }

            if (editingId) {
                await api.updateSchedule(editingId, payload)
            } else {
                await api.createSchedule(payload)
            }

            setIsOpen(false)
            resetForm()
            loadData()
            toast.success("Schedule saved")
            logger.success(`Schedule saved: ${name}`)
        } catch (error: any) {
            const msg = error.message || "Failed to save schedule"
            toast.error(msg)
            logger.error(`Schedule Save Failed: ${msg}`)
            console.error(error)
        }
    }

    // Helper to get next run time
    const getNextRun = (cron: string | undefined) => {
        if (!cron) return "N/A";
        const date = getNextRunDate(cron);
        return date ? date.toLocaleString() : "Invalid Cron";
    };

    // Helper to get description
    const getDescription = (cron: string | undefined) => {
        if (!cron) return "N/A";
        try {
            return cronstrue.toString(cron);
        } catch (e) {
            return "Unknown Schedule";
        }
    };

    const columns: ColumnDef<Schedule>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => (
                <div
                    className="font-medium flex items-center cursor-pointer"
                    onClick={() => {
                        const sched = row.original;
                        let cron = "* * * * *"
                        if (sched.schedule_type === "interval") {
                            cron = `*/${sched.config.minutes} * * * *`
                        } else {
                            cron = sched.config.cron || "* * * * *"
                        }
                        setEditingId(sched.id)
                        setName(sched.name)
                        setCronValue(cron)
                        setIsOpen(true)
                    }}
                >
                    <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                    {row.getValue("name")}
                </div>
            )
        },
        {
            id: "description",
            header: "Description",
            cell: ({ row }) => {
                const sched = row.original;
                let cron = "* * * * *"
                if (sched.schedule_type === "interval") {
                    cron = `*/${sched.config.minutes} * * * *`
                } else {
                    cron = sched.config.cron || "* * * * *"
                }
                return getDescription(cron)
            }
        },
        {
            id: "next_run",
            header: "Next Projected Run",
            cell: ({ row }) => {
                const sched = row.original;
                let cron = "* * * * *"
                if (sched.schedule_type === "interval") {
                    cron = `*/${sched.config.minutes} * * * *`
                } else {
                    cron = sched.config.cron || "* * * * *"
                }
                return <span className="font-mono text-sm">{getNextRun(cron)}</span>
            }
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const sched = row.original
                return (
                    <div className="text-right space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            title="Clone Schedule"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleClone(sched)
                            }}
                        >
                            <Copy className="h-4 w-4 text-blue-400" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:text-red-400"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(sched.id)
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )
            }
        }
    ]

    const { table } = useDataTable({
        data: schedules,
        columns,
    })

    return (
        <div className="p-8 space-y-6 text-white min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Schedules</h2>
                    <p className="text-muted-foreground">Manage automation templates for your jobs.</p>
                </div>
                <div className="flex items-center gap-4">
                    {currentTime && (
                        <>
                            <div className="text-right flex flex-col justify-center border-r border-white/10 pr-4">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Local Time</span>
                                <span className="text-sm font-mono text-foreground font-medium">
                                    {currentTime.toLocaleString()}
                                </span>
                            </div>
                            <div className="text-right flex flex-col justify-center">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">System Time</span>
                                <span className="text-sm font-mono text-foreground font-medium">
                                    {currentTime.toLocaleString()}
                                </span>
                            </div>
                        </>
                    )}
                    <Dialog open={isOpen} onOpenChange={(val) => {
                        setIsOpen(val)
                        if (!val) resetForm()
                    }}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Plus className="mr-2 h-4 w-4" /> Add Schedule
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card text-card-foreground border-border sm:max-w-xl">
                            <DialogHeader>
                                <DialogTitle>{editingId ? "Edit Schedule" : "New Schedule Template"}</DialogTitle>
                                <DialogDescription>Define a reusable schedule.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                                <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Backup" className="bg-muted/50 border-input" />
                                </div>

                                <div className="space-y-2">
                                    <Label>Schedule Cadence</Label>
                                    <CronBuilder value={cronValue} onChange={setCronValue} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreate} disabled={!name}>Save</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                    onChange={(event) => table.getColumn("name")?.setFilterValue(event)}
                />
            </div>

            <Card className="bg-card border-border">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id} className="text-muted-foreground">
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
                                    <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                                </TableRow>
                            ) : table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                        className="border-border hover:bg-muted/50 transition-colors"
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
                                    <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">No schedules found. Create one to get started.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
