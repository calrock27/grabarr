"use client"

import { useEffect, useState } from "react"
import { api, type ActivityLog } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { RefreshCw, User, Briefcase, Server, Key, Calendar, Webhook, Shield, Settings } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SearchInput } from "@/components/ui/search-input"

export default function LogsPage() {
    const [activityOffset, setActivityOffset] = useState(0)
    const [hasMoreActivity, setHasMoreActivity] = useState(true)
    const [loadingMoreActivity, setLoadingMoreActivity] = useState(false)
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const LIMIT = 50

    const fetchLogs = async (type: 'initial' | 'more' = 'initial') => {
        try {
            if (type === 'initial') {
                setLoading(true)
                const activity = await api.getActivityLog({ limit: LIMIT })
                setActivityLogs(activity)
                setActivityOffset(0)
                setHasMoreActivity(activity.length === LIMIT)
            } else {
                setLoadingMoreActivity(true)
                const nextOffset = activityOffset + LIMIT
                const activity = await api.getActivityLog({ limit: LIMIT, offset: nextOffset })
                setActivityLogs(prev => [...prev, ...activity])
                setActivityOffset(nextOffset)
                setHasMoreActivity(activity.length === LIMIT)
            }
        } catch (e) {
            console.error("Failed to fetch logs", e)
        } finally {
            setLoading(false)
            setLoadingMoreActivity(false)
        }
    }

    useEffect(() => {
        fetchLogs('initial')
    }, [])

    const getEntityIcon = (entityType: string) => {
        switch (entityType) {
            case 'job': return <Briefcase className="h-4 w-4 text-blue-400" />
            case 'remote': return <Server className="h-4 w-4 text-purple-400" />
            case 'credential': return <Key className="h-4 w-4 text-amber-400" />
            case 'schedule': return <Calendar className="h-4 w-4 text-cyan-400" />
            case 'action': return <Webhook className="h-4 w-4 text-pink-400" />
            case 'apikey': return <Shield className="h-4 w-4 text-orange-400" />
            case 'admin': return <User className="h-4 w-4 text-green-400" />
            case 'system': return <Settings className="h-4 w-4 text-zinc-400" />
            default: return <Settings className="h-4 w-4 text-zinc-400" />
        }
    }

    const getActionColor = (action: string) => {
        switch (action) {
            case 'create': return 'bg-green-500/20 text-green-400'
            case 'delete': return 'bg-red-500/20 text-red-400'
            case 'update':
            case 'patch': return 'bg-blue-500/20 text-blue-400'
            case 'run': return 'bg-purple-500/20 text-purple-400'
            case 'stop': return 'bg-orange-500/20 text-orange-400'
            case 'login': return 'bg-cyan-500/20 text-cyan-400'
            case 'toggle': return 'bg-amber-500/20 text-amber-400'
            case 'rotate_key': return 'bg-pink-500/20 text-pink-400'
            default: return 'bg-zinc-500/20 text-zinc-400'
        }
    }

    const formatDetails = (details: any) => {
        if (!details) return "—"
        if (details.name) return details.name
        if (details.username) return details.username
        if (details.enabled !== undefined) return details.enabled ? "Enabled" : "Disabled"
        if (details.execution_type) return `Type: ${details.execution_type}`
        return JSON.stringify(details)
    }

    const filteredLogs = activityLogs.filter(log => {
        if (!searchQuery) return true
        const searchLower = searchQuery.toLowerCase()
        return (
            log.action.toLowerCase().includes(searchLower) ||
            log.entity_type.toLowerCase().includes(searchLower) ||
            formatDetails(log.details).toLowerCase().includes(searchLower)
        )
    })

    return (
        <div className="p-8 space-y-6 text-white h-screen flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">System Logs</h2>
                    <p className="text-muted-foreground">Audit trail for system actions.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => fetchLogs('initial')}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search activity..."
                />
            </div>

            <div className="flex-1 border border-border rounded-md bg-card overflow-hidden">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-muted/50 border-border">
                                <TableHead className="w-[180px]">Timestamp</TableHead>
                                <TableHead className="w-[100px]">Action</TableHead>
                                <TableHead className="w-[120px]">Entity</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        Loading...
                                    </TableCell>
                                </TableRow>
                            ) : filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        No activity recorded.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredLogs.map((log) => (
                                    <TableRow key={log.id} className="hover:bg-muted/50 border-border">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {new Date(log.timestamp + "Z").toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getActionColor(log.action)}`}>
                                                {log.action.replace('_', ' ')}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 capitalize">
                                                {getEntityIcon(log.entity_type)}
                                                <span className="text-sm">{log.entity_type}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-zinc-400">
                                            {formatDetails(log.details)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {hasMoreActivity && activityLogs.length > 0 && !loading && (
                        <div className="p-4 border-t border-border flex justify-center">
                            <Button variant="ghost" size="sm" onClick={() => fetchLogs('more')} disabled={loadingMoreActivity}>
                                {loadingMoreActivity ? "Loading..." : "Load More"}
                            </Button>
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    )
}
