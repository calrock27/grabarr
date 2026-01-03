"use client"

import { useEffect, useState } from "react"
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { RemoteForm } from "@/components/remotes/RemoteForm"
import { RemoteDialog } from "@/components/remotes/RemoteDialog"

export default function RemotesPage() {
    const [remotes, setRemotes] = useState<Remote[]>([])
    const [credentials, setCredentials] = useState<Credential[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingRemote, setEditingRemote] = useState<Remote | undefined>(undefined)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            const [remotesData, credentialsData] = await Promise.all([
                api.getRemotes(),
                api.getCredentials()
            ])
            setRemotes(remotesData)
            setCredentials(credentialsData)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

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
            loadData()
        } catch (e) {
            alert("Failed to save target")
        }
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
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Target
                </Button>
            </div>

            <div className="rounded-md border border-gray-800 bg-card">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-muted-foreground">Name</TableHead>
                            <TableHead className="text-muted-foreground">Type</TableHead>
                            <TableHead className="text-muted-foreground">Config</TableHead>
                            <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Loading...</TableCell>
                            </TableRow>
                        ) : remotes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No targets found. Create one to get started.</TableCell>
                            </TableRow>
                        ) : (
                            remotes.map((remote) => (
                                <TableRow
                                    key={remote.id}
                                    className="border-border hover:bg-muted/50 cursor-pointer"
                                    onClick={() => handleEdit(remote)}
                                >
                                    <TableCell className="font-medium">{remote.name}</TableCell>
                                    <TableCell className="capitalize">{remote.type}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground max-w-md truncate">
                                        {JSON.stringify(remote.config)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="hover:text-red-400"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (confirm('Delete target?')) {
                                                    api.deleteRemote(remote.id).then(() => loadData())
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
