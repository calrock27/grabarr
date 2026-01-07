"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Credential } from "@/lib/api"
import { Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SearchInput } from "@/components/ui/search-input"
import { SortableHeader } from "@/components/ui/sortable-header"
import { useServerDataTable } from "@/hooks/use-server-data-table"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/common/DataTable"
import { PageHeader } from "@/components/layout/PageHeader"

export default function CredentialsPage() {
    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)

    // Form state
    const [name, setName] = useState("")
    const [type, setType] = useState("ssh")
    const [formData, setFormData] = useState<Record<string, string>>({})

    // Columns definition
    const columns: ColumnDef<Credential>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => (
                <div className="font-medium flex items-center">
                    {row.getValue("name")}
                </div>
            ),
        },
        {
            accessorKey: "type",
            header: ({ column }) => <SortableHeader column={column}>Type</SortableHeader>,
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const c = row.original
                return (
                    <div className="text-right">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Delete credential?')) api.deleteCredential(c.id).then(refresh)
                            }}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                    </div>
                )
            },
        },
    ]

    const { table, loading, searchValue, setSearchValue, refresh } = useServerDataTable({
        fetchFn: (params) => api.getCredentials(params),
        columns,
        defaultSortBy: "name",
    })

    function resetForm() {
        setName("")
        setType("ssh")
        setFormData({})
        setEditingId(null)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            const payload = {
                name,
                type,
                data: formData
            }

            if (editingId) {
                await api.updateCredential(editingId, payload)
            } else {
                await api.createCredential(payload)
            }
            setOpen(false)
            refresh()
            resetForm()
        } catch (e) {
            alert("Failed to save credential.")
        }
    }

    const updateField = (key: string, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    const renderFields = () => {
        switch (type) {
            case "ssh":
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Username</Label>
                            <Input value={formData.user || ""} onChange={e => updateField("user", e.target.value)} className="bg-muted/50 border-input" placeholder="root" />
                        </div>
                        <div className="space-y-2">
                            <Label>Private Key (PEM)</Label>
                            <Textarea
                                value={formData.private_key || ""}
                                onChange={e => updateField("private_key", e.target.value)}
                                className="bg-muted/50 border-input font-mono h-32"
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Passphrase (Optional)</Label>
                            <Input type="password" value={formData.passphrase || ""} onChange={e => updateField("passphrase", e.target.value)} className="bg-muted/50 border-input" />
                        </div>
                    </>
                )
            case "password":
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Username</Label>
                            <Input value={formData.user || ""} onChange={e => updateField("user", e.target.value)} className="bg-muted/50 border-input" />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input type="password" value={formData.password || ""} onChange={e => updateField("password", e.target.value)} className="bg-muted/50 border-input" />
                        </div>
                    </>
                )
            case "s3":
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Access Key ID</Label>
                            <Input value={formData.access_key_id || ""} onChange={e => updateField("access_key_id", e.target.value)} className="bg-muted/50 border-input" />
                        </div>
                        <div className="space-y-2">
                            <Label>Secret Access Key</Label>
                            <Input type="password" value={formData.secret_access_key || ""} onChange={e => updateField("secret_access_key", e.target.value)} className="bg-muted/50 border-input" />
                        </div>
                    </>
                )
            case "token":
                return (
                    <div className="space-y-2">
                        <Label>API Token</Label>
                        <Input type="password" value={formData.token || ""} onChange={e => updateField("token", e.target.value)} className="bg-muted/50 border-input" />
                    </div>
                )
            default:
                return (
                    <div className="space-y-2">
                        <Label>Configuration Data (JSON)</Label>
                        <Textarea
                            value={formData.json || "{}"}
                            onChange={e => updateField("json", e.target.value)}
                            className="bg-muted/50 border-input font-mono h-32"
                        />
                    </div>
                )
        }
    }

    const handleRowClick = (credential: Credential) => {
        setEditingId(credential.id)
        setName(credential.name)
        setType(credential.type)
        setFormData(credential.data || {})
        setOpen(true)
    }

    return (
        <div className="p-6">
            <PageHeader
                title="Credentials"
                description="Securely manage authentication keys and tokens."
            >
                <Dialog open={open} onOpenChange={(val) => {
                    setOpen(val)
                    if (!val) resetForm()
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6">
                            New Credential
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card text-card-foreground border-gray-800">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Credential" : "New Credential"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} required className="bg-muted/50 border-input" />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={type} onValueChange={(v) => {
                                    setType(v);
                                    if (!editingId) setFormData({});
                                }}>
                                    <SelectTrigger className="bg-muted/50 border-input">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ssh">SSH Key</SelectItem>
                                        <SelectItem value="password">Password</SelectItem>
                                        <SelectItem value="s3">S3 Access Key</SelectItem>
                                        <SelectItem value="token">API Token</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {renderFields()}

                            <Button type="submit" className="w-full">Save</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </PageHeader>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search credentials..."
                />
            </div>

            <DataTable
                table={table}
                columns={columns}
                loading={loading}
                emptyMessage="No results."
                onRowClick={handleRowClick}
            />
        </div>
    )
}
