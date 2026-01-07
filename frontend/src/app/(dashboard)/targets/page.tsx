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
import { Plus, Trash2 } from "lucide-react"
import { RemoteDialog } from "@/components/remotes/RemoteDialog"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { InlineSelect } from "@/components/ui/inline-select"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useServerDataTable } from "@/hooks/use-server-data-table"
import { DataTable } from "@/components/common/DataTable"
import { PageHeader } from "@/components/layout/PageHeader"
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
                        className="hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        onClick={() => {
                            if (confirm('Delete target?')) {
                                api.deleteRemote(row.original.id).then(() => refresh())
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
        <div className="p-6">
            <PageHeader
                title="Targets"
                description="Manage available source and destination endpoints."
                actionLabel="New Target"
                onAction={() => setOpen(true)}
            >
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
            </PageHeader>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search targets..."
                />
            </div>

            <DataTable
                table={table}
                columns={columns}
                loading={loading}
                emptyMessage="No targets found. Create one to get started."
                onRowClick={handleEdit}
            />
        </div>
    )
}
