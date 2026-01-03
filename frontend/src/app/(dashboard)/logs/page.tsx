"use client"

import { useLogStore, type LogLevel, LEVEL_PRIORITY } from "@/lib/logger"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trash2, AlertCircle, Info, CheckCircle, AlertTriangle, Bug, XOctagon, RefreshCw } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useEffect, useState } from "react"
import { api, type ActivityLog, type JobHistory } from "@/lib/api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function LogsPage() {
    const { logs, clearLogs, minLevel, setMinLevel } = useLogStore()
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
    const [jobHistory, setJobHistory] = useState<JobHistory[]>([])
    const [refreshKey, setRefreshKey] = useState(0)

    const filteredLogs = logs.filter(log => LEVEL_PRIORITY[log.level] >= LEVEL_PRIORITY[minLevel])

    const fetchServerLogs = async () => {
        try {
            const [activity, history] = await Promise.all([
                api.getActivityLog(),
                api.getHistory()
            ])
            setActivityLogs(activity)
            setJobHistory(history)
        } catch (e) {
            console.error("Failed to fetch logs", e)
        }
    }

    useEffect(() => {
        fetchServerLogs()
    }, [refreshKey])

    const getIcon = (level: string) => {
        switch (level) {
            case 'fatal': return <XOctagon className="h-4 w-4 text-purple-500" />
            case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />
            case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
            case 'info': return <Info className="h-4 w-4 text-blue-500" />
            case 'debug': return <Bug className="h-4 w-4 text-zinc-500" />
            default: return <Info className="h-4 w-4 text-blue-500" />
        }
    }

    const getColor = (level: string) => {
        switch (level) {
            case 'fatal': return 'text-purple-400 font-bold'
            case 'error': return 'text-red-400'
            case 'warn': return 'text-yellow-400'
            case 'info': return 'text-blue-400'
            case 'debug': return 'text-zinc-400'
            default: return 'text-blue-400'
        }
    }

    return (
        <div className="p-8 space-y-6 text-white h-screen flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">System Logs</h2>
                    <p className="text-muted-foreground">Monitor application requests, job history, and errors.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => setRefreshKey(k => k + 1)}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="activity" className="flex-1 flex flex-col h-full overflow-hidden">
                <TabsList className="bg-muted/20 border border-border w-fit">
                    <TabsTrigger value="activity">Activity Log</TabsTrigger>
                    <TabsTrigger value="history">Job History</TabsTrigger>
                    <TabsTrigger value="client">Client Logs</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="flex-1 border border-border rounded-md bg-card overflow-hidden mt-4">
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-muted/50 border-border">
                                    <TableHead className="w-[180px]">Timestamp</TableHead>
                                    <TableHead className="w-[100px]">Action</TableHead>
                                    <TableHead className="w-[100px]">Entity</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activityLogs.map((log) => (
                                    <TableRow key={log.id} className="hover:bg-muted/50 border-border">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {new Date(log.timestamp + "Z").toLocaleString()}
                                        </TableCell>
                                        <TableCell className="capitalize">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.action === 'create' ? 'bg-green-500/20 text-green-400' :
                                                    log.action === 'delete' ? 'bg-red-500/20 text-red-400' :
                                                        log.action === 'update' ? 'bg-blue-500/20 text-blue-400' :
                                                            'bg-zinc-500/20 text-zinc-400'
                                                }`}>
                                                {log.action}
                                            </span>
                                        </TableCell>
                                        <TableCell className="capitalize">{log.entity_type}</TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {JSON.stringify(log.details)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {activityLogs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                            No activity recorded.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="history" className="flex-1 border border-border rounded-md bg-card overflow-hidden mt-4">
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-muted/50 border-border">
                                    <TableHead className="w-[180px]">Timestamp</TableHead>
                                    <TableHead>Job Name</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobHistory.map((h) => (
                                    <TableRow key={h.id} className="hover:bg-muted/50 border-border">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {new Date(h.timestamp + "Z").toLocaleString()}
                                        </TableCell>
                                        <TableCell>{h.job_name || `Job #${h.job_id}`}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {h.status === 'success' ? (
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                                )}
                                                <span className={`text-xs font-medium capitalize ${h.status === 'success' ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                    {h.status}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {h.details?.error ? (
                                                <span className="text-red-400 block max-w-xl break-words">
                                                    {h.details.error}
                                                </span>
                                            ) : (
                                                <div className="space-x-4 text-muted-foreground">
                                                    {h.details?.transfers !== undefined && (
                                                        <span>Files: {h.details.transfers}</span>
                                                    )}
                                                    {h.details?.bytes !== undefined && (
                                                        <span>Size: {(h.details.bytes / 1024 / 1024).toFixed(2)} MB</span>
                                                    )}
                                                    {h.details?.duration !== undefined && (
                                                        <span>Duration: {h.details.duration.toFixed(2)}s</span>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {jobHistory.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                            No job history found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </TabsContent>

                <TabsContent value="client" className="flex-1 flex flex-col overflow-hidden mt-4">
                    <div className="flex justify-end mb-2 items-center gap-3">
                        <Select value={minLevel} onValueChange={(val) => setMinLevel(val as LogLevel)}>
                            <SelectTrigger className="w-[140px] bg-muted/20 border-border">
                                <SelectValue placeholder="Log Level" />
                            </SelectTrigger>
                            <SelectContent position="popper" className="bg-popover border-border text-popover-foreground w-[140px]">
                                <SelectItem value="debug">Debug</SelectItem>
                                <SelectItem value="info">Info</SelectItem>
                                <SelectItem value="warn">Warn</SelectItem>
                                <SelectItem value="error">Error</SelectItem>
                                <SelectItem value="fatal">Fatal</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={clearLogs} disabled={logs.length === 0}>
                            <Trash2 className="mr-2 h-4 w-4" /> Clear Logs
                        </Button>
                    </div>

                    <div className="flex-1 border border-border rounded-md bg-card overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-1 font-mono text-sm">
                                {filteredLogs.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-10">No logs found for this level.</div>
                                ) : (
                                    filteredLogs.map(log => (
                                        <div key={log.id} className="flex gap-3 hover:bg-muted/50 p-2 rounded">
                                            <span className="text-muted-foreground shrink-0 w-24">
                                                {log.timestamp.toLocaleTimeString()}
                                            </span>
                                            <span className="shrink-0 mt-0.5">{getIcon(log.level)}</span>
                                            <span className={`break-all ${getColor(log.level)}`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
