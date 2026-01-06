"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { api, type Remote, type Credential } from "@/lib/api"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Trash2, ChevronDown, Check, X } from "lucide-react"
import { RemoteDialog } from "@/components/remotes/RemoteDialog"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useServerDataTable } from "@/hooks/use-server-data-table"
import { ColumnDef, flexRender } from "@tanstack/react-table"

// Helper to get host/endpoint display based on remote type
function getHostDisplay(remote: Remote): string {
    const config = remote.config || {}
    switch (remote.type) {
        case 'sftp':
        case 'ftp':
        case 'smb':
            const host = config.host || '—'
            const port = config.port
            return port ? `${host}:${port}` : host
        case 's3':
            return config.endpoint || 's3.amazonaws.com'
        case 'webdav':
        case 'http':
            return config.url || '—'
        case 'local':
            return config.path || '/'
        default:
            return '—'
    }
}

// Helper to get provider/bucket display for S3 types
function getProviderBucketDisplay(remote: Remote): string | null {
    if (remote.type !== 's3') return null
    const config = remote.config || {}
    const provider = config.provider || 'S3'
    const bucket = config.bucket
    if (bucket) {
        return `${provider} · ${bucket}`
    }
    return provider
}

// Protocol badge colors
function getProtocolColor(type: string): string {
    switch (type) {
        case 's3': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        case 'sftp': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        case 'ftp': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
        case 'smb': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
        case 'webdav': return 'bg-green-500/20 text-green-400 border-green-500/30'
        case 'http': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        case 'local': return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
        default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
}

export default function RemotesPage() {
    const [credentials, setCredentials] = useState<Credential[]>([])
    const [open, setOpen] = useState(false)
    const [editingRemote, setEditingRemote] = useState<Remote | undefined>(undefined)

    // Fetch credentials for the dropdown
    useEffect(() => {
        api.getCredentials().then(setCredentials).catch(console.error)
    }, [])

    // Get credential name by ID
    const getCredentialName = useCallback((credentialId: number | undefined): string => {
        if (!credentialId) return '—'
        const cred = credentials.find(c => c.id === credentialId)
        return cred ? cred.name : '—'
    }, [credentials])

    // Filter credentials based on remote type
    const getFilteredCredentials = useCallback((remoteType: string): Credential[] => {
        return credentials.filter(c => {
            if (remoteType === 's3') return c.type === 's3'
            if (remoteType === 'sftp') return c.type === 'ssh' || c.type === 'password'
            if (['ftp', 'smb', 'webdav'].includes(remoteType)) return c.type === 'password'
            return true
        })
    }, [credentials])

    const columns: ColumnDef<Remote>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>
        },
        {
            accessorKey: "type",
            header: ({ column }) => <SortableHeader column={column}>Protocol</SortableHeader>,
            cell: ({ row }) => (
                <Badge variant="outline" className={`uppercase text-xs font-medium ${getProtocolColor(row.getValue("type"))}`}>
                    {row.getValue("type")}
                </Badge>
            )
        },
        {
            id: "host",
            header: "Host / Endpoint",
            cell: ({ row }) => (
                <span className="font-mono text-sm text-muted-foreground">
                    {getHostDisplay(row.original)}
                </span>
            )
        },
        {
            id: "provider",
            header: "Provider / Bucket",
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {getProviderBucketDisplay(row.original) || '—'}
                </span>
            )
        },
        {
            id: "credential",
            header: "Credential",
            cell: ({ row }) => {
                const remote = row.original
                if (remote.type === 'local' || remote.type === 'http') {
                    return <span className="text-muted-foreground">—</span>
                }
                return (
                    <div onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                            value={getCredentialName(remote.credential_id)}
                            options={[
                                { label: 'No Credential', value: 'none' },
                                ...getFilteredCredentials(remote.type).map(c => ({
                                    label: c.name,
                                    value: c.id.toString()
                                }))
                            ]}
                            onSave={(val) => handleCredentialChange(remote.id, val)}
                        />
                    </div>
                )
            }
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => (
                <div className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-red-400"
                        onClick={() => {
                            if (confirm('Delete target?')) {
                                api.deleteRemote(row.original.id).then(() => refresh())
                            }
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )
        }
    ]

    const { table, loading, searchValue, setSearchValue, refresh } = useServerDataTable({
        fetchFn: (params) => api.getRemotes(params),
        columns,
        defaultSortBy: "name",
    })

    function handleEdit(remote: Remote) {
        setEditingRemote(remote)
        setOpen(true)
    }

    async function handleSubmit(data: Omit<Remote, "id">) {
        try {
            if (editingRemote) {
                await api.updateRemote(editingRemote.id, data)
            } else {
                await api.createRemote(data)
            }
            setOpen(false)
            setEditingRemote(undefined)
            refresh()
        } catch (e) {
            alert("Failed to save target")
        }
    }

    async function handleCredentialChange(remoteId: number, credentialId: string): Promise<void> {
        const remote = table.getRowModel().rows.find(r => r.original.id === remoteId)?.original
        if (!remote) return

        await api.updateRemote(remoteId, {
            name: remote.name,
            type: remote.type,
            credential_id: credentialId === "none" ? undefined : parseInt(credentialId),
            config: remote.config
        })
        refresh()
    }

    return (
        <div className="p-8 space-y-6 text-white h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Targets</h2>
                    <p className="text-muted-foreground">Manage available source and destination endpoints.</p>
                </div>
                <RemoteDialog
                    open={open}
                    onOpenChange={(val) => {
                        setOpen(val)
                        if (!val) setEditingRemote(undefined)
                    }}
                    initialData={editingRemote}
                    credentials={credentials}
                    onSubmit={handleSubmit}
                    mode={editingRemote ? "edit" : "create"}
                />
                <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6" onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Target
                </Button>
            </div>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search targets..."
                />
            </div>

            <div className="rounded-md border border-border bg-card">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
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
                                    className="border-border/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                                    onClick={() => handleEdit(row.original)}
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
                                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">No targets found. Create one to get started.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

function InlineSelect({ value, options, onSave }: { value: string, options: { label: string, value: string }[], onSave: (val: string) => Promise<any> }) {
    const [isEditing, setIsEditing] = useState(false)
    const [currentValue, setCurrentValue] = useState(options.find(o => o.label === value)?.value || options[0]?.value || '')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        setCurrentValue(options.find(o => o.label === value)?.value || options[0]?.value || '')
    }, [value, options])

    if (isEditing) {
        return (
            <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="relative">
                    <select
                        value={currentValue}
                        onChange={(e) => setCurrentValue(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-primary w-32"
                        disabled={isLoading}
                        autoFocus
                    >
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1.5 h-3 w-3 text-zinc-500 pointer-events-none" />
                </div>
                <button
                    onClick={async () => {
                        setIsLoading(true)
                        try {
                            await onSave(currentValue)
                            setIsEditing(false)
                        } finally {
                            setIsLoading(false)
                        }
                    }}
                    className="p-1 hover:bg-primary/10 rounded text-primary transition-colors"
                    disabled={isLoading}
                >
                    <Check className="h-4 w-4" />
                </button>
                <button
                    onClick={() => {
                        setCurrentValue(options.find(o => o.label === value)?.value || options[0]?.value || '')
                        setIsEditing(false)
                    }}
                    className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                    disabled={isLoading}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        )
    }

    return (
        <div
            onDoubleClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-white/5 px-2 py-1 rounded -ml-2 transition-all border border-transparent hover:border-zinc-700/50 text-sm text-muted-foreground"
            title="Double click to edit"
        >
            {value || "—"}
        </div>
    )
}
