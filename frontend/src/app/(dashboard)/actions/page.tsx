"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Action } from "@/lib/api"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Trash2, Webhook, Terminal, Bell, HardDrive, RefreshCcw, Clock } from "lucide-react"
import { ActionDialog } from "@/components/actions/ActionDialog"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useServerDataTable } from "@/hooks/use-server-data-table"
import { DataTable } from "@/components/common/DataTable"
import { PageHeader } from "@/components/layout/PageHeader"
import { ColumnDef, flexRender } from "@tanstack/react-table"

function getActionIcon(type: string) {
    switch (type) {
        case 'webhook': return <Webhook className="h-4 w-4" />
        case 'command': return <Terminal className="h-4 w-4" />
        case 'notification': return <Bell className="h-4 w-4" />
        case 'rclone': return <HardDrive className="h-4 w-4" />
        case 'docker': return <RefreshCcw className="h-4 w-4" />
        case 'delay': return <Clock className="h-4 w-4" />
        default: return <Terminal className="h-4 w-4" />
    }
}

function getActionColor(type: string) {
    switch (type) {
        case 'webhook': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
        case 'command': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        case 'notification': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        case 'rclone': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        case 'docker': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
        case 'delay': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
}

function getActionDetails(action: Action) {
    const config = action.config || {}
    switch (action.type) {
        case 'webhook':
            return (
                <div className="flex flex-col">
                    <span className="font-mono text-xs">{config.method || 'POST'} {config.url}</span>
                </div>
            )
        case 'command':
            return (
                <div className="flex flex-col">
                    <span className="font-mono text-xs text-emerald-400">$ {config.command}</span>
                    {config.cwd && <span className="text-xs text-muted-foreground">in {config.cwd}</span>}
                </div>
            )
        case 'notification':
            return (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{config.service}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[300px]">{config.webhook_url}</span>
                </div>
            )
        case 'rclone':
            return <span className="font-mono text-xs text-orange-400">rc {config.command}</span>
        case 'docker':
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase text-[10px]">{config.action}</Badge>
                    <span className="font-mono text-xs">{config.container_id}</span>
                </div>
            )
        case 'delay':
            return <span className="text-sm">{config.seconds} seconds</span>
        default:
            return <span className="text-muted-foreground italic">No details</span>
    }
}

export default function ActionsPage() {
    const [open, setOpen] = useState(false)
    const [editingAction, setEditingAction] = useState<Action | undefined>(undefined)

    const columns: ColumnDef<Action>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>
        },
        {
            accessorKey: "type",
            header: ({ column }) => <SortableHeader column={column}>Type</SortableHeader>,
            cell: ({ row }) => {
                const type = row.getValue("type") as string
                return (
                    <div className={`inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionColor(type)}`}>
                        {getActionIcon(type)}
                        <span className="capitalize">{type}</span>
                    </div>
                )
            }
        },
        {
            id: "details",
            header: "Details",
            cell: ({ row }) => getActionDetails(row.original)
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => (
                <div className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        onClick={() => {
                            if (confirm('Delete action? This may break jobs using it.')) {
                                api.deleteAction(row.original.id).then(() => refresh())
                            }
                        }}
                    >
                        <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                </div>
            )
        }
    ]

    const { table, loading, searchValue, setSearchValue, refresh } = useServerDataTable({
        fetchFn: (params) => api.getActions(params),
        columns,
        defaultSortBy: "name",
    })

    function handleEdit(action: Action) {
        setEditingAction(action)
        setOpen(true)
    }

    async function handleSubmit(data: Omit<Action, "id">) {
        try {
            if (editingAction) {
                await api.updateAction(editingAction.id, data)
            } else {
                await api.createAction(data)
            }
            setOpen(false)
            setEditingAction(undefined)
            refresh()
        } catch (e) {
            alert("Failed to save action")
        }
    }

    return (
        <div className="p-6">
            <PageHeader
                title="Actions"
                description="Atomic operations like shell scripts, API calls, and notifications that can be grouped into jobs."
                actionLabel="New Action"
                onAction={() => { setEditingAction(undefined); setOpen(true); }}
            />

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search actions..."
                />
            </div>

            <DataTable
                table={table}
                columns={columns}
                loading={loading}
                emptyMessage="No actions defined. Create one to get started."
                onRowClick={handleEdit}
            />

            <ActionDialog
                open={open}
                onOpenChange={setOpen}
                onSubmit={handleSubmit}
                initialData={editingAction}
            />
        </div>
    )
}
