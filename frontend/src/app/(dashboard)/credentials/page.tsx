"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Credential, type ListParams } from "@/lib/api"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
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
import { useDataTable } from "@/hooks/use-data-table"
import { ColumnDef, flexRender } from "@tanstack/react-table"

export default function CredentialsPage() {
    const [credentials, setCredentials] = useState<Credential[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [searchValue, setSearchValue] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchValue), 300)
        return () => clearTimeout(timer)
    }, [searchValue])

    // Columns
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
                        <Button variant="ghost" size="icon" className="hover:text-red-400" onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete credential?')) api.deleteCredential(c.id).then(loadData)
                        }}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )
            },
        },
    ]

    const { table } = useDataTable({
        data: credentials,
        columns,
    })

    // Form
    const [name, setName] = useState("")
    const [type, setType] = useState("ssh")
    const [formData, setFormData] = useState<Record<string, string>>({})

    useEffect(() => {
        loadData()
    }, [debouncedSearch])

    async function loadData() {
        setLoading(true)
        try {
            const params: ListParams = {}
            if (debouncedSearch) params.search = debouncedSearch
            const data = await api.getCredentials(params)
            setCredentials(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

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
            loadData()
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

    return (
        <div className="p-8 space-y-6 text-white">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Credentials</h2>
                    <p className="text-muted-foreground">Securely manage authentication keys and tokens.</p>
                </div>
                <Dialog open={open} onOpenChange={(val) => {
                    setOpen(val)
                    if (!val) resetForm()
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6">
                            <Plus className="mr-2 h-4 w-4" /> New Credential
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card text-card-foreground border-gray-800">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Credential" : "New Credential"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* ... (existing form) */}
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} required className="bg-muted/50 border-input" />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={type} onValueChange={(v) => {
                                    // Only reset data if changing type completely, mainly if creating? 
                                    // If editing, changing type might clear data.
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
            </div>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search credentials..."
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
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className="border-border/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                                    onClick={() => {
                                        const c = row.original
                                        setEditingId(c.id)
                                        setName(c.name)
                                        setType(c.type)
                                        setFormData(c.data || {})
                                        setOpen(true)
                                    }}
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
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
