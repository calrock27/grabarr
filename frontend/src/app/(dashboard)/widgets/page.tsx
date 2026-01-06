"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { api, type EmbedWidget, type ListParams } from "@/lib/api"
import { toast } from "sonner"
import { Plus, Copy, Trash2, ExternalLink, RotateCw } from "lucide-react"
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"

export default function WidgetsPage() {
    const router = useRouter()
    const [widgets, setWidgets] = useState<EmbedWidget[]>([])
    const [loading, setLoading] = useState(true)
    const [searchValue, setSearchValue] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [deleteWidget, setDeleteWidget] = useState<EmbedWidget | null>(null)

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchValue])

    const fetchWidgets = async () => {
        setLoading(true)
        try {
            const params: ListParams = {}
            if (debouncedSearch) params.search = debouncedSearch
            const data = await api.getWidgets(params)
            setWidgets(data)
        } catch (err) {
            toast.error("Failed to load widgets")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchWidgets()
    }, [debouncedSearch])

    const handleDelete = async () => {
        if (!deleteWidget) return
        try {
            await api.deleteWidget(deleteWidget.id)
            toast.success("Widget deleted")
            setDeleteWidget(null)
            fetchWidgets()
        } catch (err: any) {
            toast.error(err.message || "Failed to delete widget")
        }
    }

    const handleRotateKey = async (widget: EmbedWidget) => {
        try {
            await api.rotateWidgetKey(widget.id)
            toast.success("Embed key rotated")
            fetchWidgets()
        } catch (err: any) {
            toast.error(err.message || "Failed to rotate key")
        }
    }

    const copyEmbedCode = (widget: EmbedWidget) => {
        const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
        const embedUrl = `${baseUrl}/embed/widget/${widget.embed_key}`
        const iframeCode = `<iframe src="${embedUrl}" width="${widget.width}" height="${widget.height}" frameborder="0" style="border-radius: 8px;"></iframe>`
        navigator.clipboard.writeText(iframeCode)
        toast.success("Embed code copied to clipboard")
    }

    const columns: ColumnDef<EmbedWidget>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => (
                <button
                    onClick={() => router.push(`/widgets/editor?id=${row.original.id}`)}
                    className="hover:text-primary transition-colors text-left font-medium"
                >
                    {row.getValue("name")}
                </button>
            )
        },
        {
            accessorKey: "job",
            header: ({ column }) => <SortableHeader column={column}>Job</SortableHeader>,
            cell: ({ row }) => (
                <span className="text-muted-foreground">
                    {row.original.job?.name || `Job #${row.original.job_id}`}
                </span>
            )
        },
        {
            id: "size",
            header: "Size",
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">
                    {row.original.width} × {row.original.height}
                </span>
            )
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const widget = row.original
                return (
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-white/10 active:scale-90 transition-all"
                            title="Copy Embed Code"
                            onClick={() => copyEmbedCode(widget)}
                        >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-white/10 active:scale-90 transition-all"
                            title="Preview"
                            asChild
                        >
                            <Link href={`/embed/widget/${widget.embed_key}`} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-white/10 active:scale-90 transition-all"
                            title="Rotate Embed Key"
                            onClick={() => handleRotateKey(widget)}
                        >
                            <RotateCw className="h-3.5 w-3.5 text-orange-400" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-white/10 active:scale-90 transition-all"
                            title="Delete"
                            onClick={() => setDeleteWidget(widget)}
                        >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                    </div>
                )
            }
        }
    ]

    const { table } = useDataTable({
        data: widgets,
        columns,
    })

    return (
        <div className="p-6 text-white min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-white">Widgets</h2>
                    <p className="text-zinc-400 text-sm mt-1">Embeddable status widgets for your dashboards.</p>
                </div>
                <Link href="/widgets/editor">
                    <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6">
                        <Plus className="mr-2 h-4 w-4" /> New Widget
                    </Button>
                </Link>
            </div>

            <div className="flex items-center justify-between mb-4">
                <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search widgets..."
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
                                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">Loading...</TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className="border-border/50 hover:bg-zinc-800/30 transition-colors group"
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
                                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">No widgets configured</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteWidget} onOpenChange={() => setDeleteWidget(null)}>
                <DialogContent className="bg-card border-zinc-800">
                    <DialogHeader>
                        <DialogTitle>Delete Widget</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deleteWidget?.name}"? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteWidget(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
