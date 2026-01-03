"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
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
import { Plus, Trash2, Key, Copy } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

// Define helper type locally since it's just for display
interface APIKey {
    id: number
    name: string
    key: string
    created_at: string
}

export default function SecurityPage() {
    const [keys, setKeys] = useState<APIKey[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState("")

    const [newKey, setNewKey] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            const data = await api.getAPIKeys()
            setKeys(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    async function handleCreate() {
        try {
            const res = await api.createAPIKey(name)
            setNewKey(res.key) // Show the key once
            setIsOpen(false)
            setName("")
            loadData()
        } catch (error) {
            alert("Failed to create key")
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("Are you sure? This action cannot be undone.")) return
        await api.deleteAPIKey(id)
        loadData()
    }

    return (
        <div className="p-8 space-y-6 text-white min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Security</h2>
                    <p className="text-gray-400">Manage API Keys for external integration.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <Plus className="mr-2 h-4 w-4" /> Generate New Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1f2937] border-gray-700 text-white">
                        <DialogHeader>
                            <DialogTitle>Generate Application API Key</DialogTitle>
                            <DialogDescription>
                                This key grants full access to trigger jobs via the API.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Key Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Home Assistant" className="bg-gray-900 border-gray-700" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={!name}>Generate</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {newKey && (
                <Card className="bg-emerald-900/20 border-emerald-500/50 mb-6">
                    <CardContent className="p-6">
                        <h3 className="text-lg font-medium text-emerald-400 mb-2">API Key Generated</h3>
                        <p className="text-sm text-gray-400 mb-4">Make sure to copy your API key now. You won't be able to see it again!</p>
                        <div className="flex items-center gap-2">
                            <Input value={newKey} readOnly className="font-mono bg-black/50 border-emerald-500/30 text-emerald-200" />
                            <Button size="icon" variant="outline" className="border-emerald-500/30 hover:bg-emerald-500/20" onClick={() => navigator.clipboard.writeText(newKey)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button variant="ghost" className="mt-4 text-sm text-gray-400 hover:text-white p-0 h-auto" onClick={() => setNewKey(null)}>
                            Close
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-[#111827] border-gray-800">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableHead className="text-gray-400">Name</TableHead>
                                <TableHead className="text-gray-400">Key Prefix</TableHead>
                                <TableHead className="text-gray-400">Created</TableHead>
                                <TableHead className="text-right text-gray-400">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">Loading...</TableCell>
                                </TableRow>
                            ) : keys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">No API keys found.</TableCell>
                                </TableRow>
                            ) : (
                                keys.map((k) => (
                                    <TableRow key={k.id} className="border-gray-800 hover:bg-gray-900/50">
                                        <TableCell className="font-medium flex items-center">
                                            <Key className="mr-2 h-4 w-4 text-gray-500" />
                                            {k.name}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-gray-400">
                                            {k.key.substring(0, 10)}...
                                        </TableCell>
                                        <TableCell className="text-sm text-gray-400">
                                            {new Date(k.created_at?.includes('Z') ? k.created_at : k.created_at + 'Z').toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="hover:text-red-400"
                                                onClick={() => handleDelete(k.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
