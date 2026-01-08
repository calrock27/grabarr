"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Trash2, Copy, Globe, AlertCircle, ShieldAlert } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"

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

    // CORS Settings State
    const [corsOrigins, setCorsOrigins] = useState<string[]>([])
    const [corsLoading, setCorsLoading] = useState(true)
    const [allowAll, setAllowAll] = useState(false)
    const [newOrigin, setNewOrigin] = useState("")
    const [corsSaving, setCorsSaving] = useState(false)

    useEffect(() => {
        loadData()
        loadCORSSettings()
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

    async function loadCORSSettings() {
        try {
            const data = await api.getCORSSettings()
            setCorsOrigins(data.allowed_origins || [])
            setAllowAll(data.allow_all || false)
        } catch (err) {
            console.error(err)
        } finally {
            setCorsLoading(false)
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

    async function handleAddOrigin() {
        const origin = newOrigin.trim()
        if (!origin) return

        // Basic validation
        if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
            toast.error("Origin must start with http:// or https://")
            return
        }

        if (corsOrigins.includes(origin)) {
            toast.error("Origin already exists")
            return
        }

        const updatedOrigins = [...corsOrigins, origin]
        await saveCORSSettings(updatedOrigins, allowAll)
        setNewOrigin("")
    }

    async function handleRemoveOrigin(origin: string) {
        const updatedOrigins = corsOrigins.filter(o => o !== origin)
        await saveCORSSettings(updatedOrigins, allowAll)
    }

    async function handleToggleAllowAll(enabled: boolean) {
        await saveCORSSettings(corsOrigins, enabled)
    }

    async function saveCORSSettings(origins: string[], allowAll: boolean) {
        setCorsSaving(true)
        try {
            const result = await api.updateCORSSettings(origins, allowAll)
            setCorsOrigins(result.allowed_origins)
            setAllowAll(result.allow_all)
            toast.success("CORS settings updated. Restart grabarr for changes to take effect.")
        } catch (err) {
            toast.error("Failed to update CORS settings")
        } finally {
            setCorsSaving(false)
        }
    }

    return (
        <div className="p-8 space-y-6 text-white min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Security</h2>
                    <p className="text-muted-foreground">Manage API keys and security settings.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6">
                            <Plus className="mr-2 h-4 w-4" /> New API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border text-card-foreground">
                        <DialogHeader>
                            <DialogTitle>New API Key</DialogTitle>
                            <DialogDescription>
                                This key grants full access to trigger jobs via the API.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Key Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Home Assistant" className="bg-muted/50 border-input" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={!name}>Generate</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {newKey && (
                <Card className="bg-primary/10 border-primary/50 mb-6">
                    <CardContent className="p-6">
                        <h3 className="text-lg font-medium text-primary mb-2">API Key Generated</h3>
                        <p className="text-sm text-muted-foreground mb-4">Make sure to copy your API key now. You won't be able to see it again!</p>
                        <div className="flex items-center gap-2">
                            <Input value={newKey} readOnly className="font-mono bg-black/50 border-primary/30 text-primary" />
                            <Button size="icon" variant="outline" className="border-primary/30 hover:bg-primary/20" onClick={() => navigator.clipboard.writeText(newKey)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button variant="ghost" className="mt-4 text-sm text-muted-foreground hover:text-white p-0 h-auto" onClick={() => setNewKey(null)}>
                            Close
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* API Keys Table */}
            <Card className="bg-card border-border">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">API Keys</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground">Name</TableHead>
                                <TableHead className="text-muted-foreground">Key Prefix</TableHead>
                                <TableHead className="text-muted-foreground">Created</TableHead>
                                <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                                </TableRow>
                            ) : keys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No API keys found.</TableCell>
                                </TableRow>
                            ) : (
                                keys.map((k) => (
                                    <TableRow key={k.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="font-medium">
                                            {k.name}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {k.key.substring(0, 10)}...
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
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

            {/* CORS Settings */}
            <Card className="bg-card border-border">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">CORS Allowed Origins</CardTitle>
                    <CardDescription>
                        Configure which domains can access the API. Changes require a grabarr restart.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">Allow API traffic from any destination</Label>
                            <p className="text-xs text-muted-foreground">Allows cross-origin requests from any domain (*)</p>
                        </div>
                        <Switch
                            checked={allowAll}
                            onCheckedChange={handleToggleAllowAll}
                            disabled={corsSaving}
                        />
                    </div>

                    {allowAll && (
                        <div className="flex flex-col gap-1 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200">
                            <div className="flex items-center gap-2 font-semibold">
                                <ShieldAlert className="h-4 w-4" />
                                <span>Security Warning</span>
                            </div>
                            <p className="text-xs">
                                Enabling this option allows any website to make requests to your grabarr instance. This should only be used for testing purposes and exposes grabarr to increased security risks.
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-sm text-amber-200">
                            Changes to CORS settings require restarting grabarr to take effect.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            value={newOrigin}
                            onChange={e => setNewOrigin(e.target.value)}
                            placeholder="https://example.com"
                            className="bg-muted/50 border-input"
                            onKeyDown={e => e.key === 'Enter' && handleAddOrigin()}
                        />
                        <Button onClick={handleAddOrigin} disabled={corsSaving || !newOrigin.trim()}>
                            <Plus className="h-4 w-4 mr-2" /> Add
                        </Button>
                    </div>

                    {corsLoading ? (
                        <p className="text-muted-foreground text-sm">Loading...</p>
                    ) : corsOrigins.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No allowed origins configured. Add origins to enable cross-origin requests.</p>
                    ) : (
                        <div className="space-y-2">
                            {corsOrigins.map((origin) => (
                                <div key={origin} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                                    <code className="text-sm font-mono">{origin}</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="hover:text-red-400 h-8 w-8"
                                        onClick={() => handleRemoveOrigin(origin)}
                                        disabled={corsSaving}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
