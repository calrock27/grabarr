"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Credential } from "@/lib/api"
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

export default function CredentialsPage() {
    const [credentials, setCredentials] = useState<Credential[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)

    // Form State
    const [name, setName] = useState("")
    const [type, setType] = useState("s3")
    const [accessKey, setAccessKey] = useState("")
    const [secretKey, setSecretKey] = useState("")

    useEffect(() => {
        loadCredentials()
    }, [])

    async function loadCredentials() {
        try {
            const data = await api.getCredentials()
            setCredentials(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            await api.createCredential({
                name,
                type,
                data: { access_key_id: accessKey, secret_access_key: secretKey }
            })
            setOpen(false)
            loadCredentials()
            setName("")
            setAccessKey("")
            setSecretKey("")
        } catch (e) {
            alert("Failed to create credential")
        }
    }

    return (
        <div className="p-8 space-y-6 text-white">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Credentials</h2>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button><Plus className="mr-2 h-4 w-4" /> New Credential</Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#111827] text-white border-gray-800">
                        <DialogHeader>
                            <DialogTitle>Add Credential</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} required placeholder="My AWS" className="bg-gray-900 border-gray-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger className="bg-gray-900 border-gray-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="s3">S3 / MinIO</SelectItem>
                                        <SelectItem value="ftp">FTP</SelectItem>
                                        <SelectItem value="sftp">SFTP</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Dynamic fields based on type would go here. keeping simple for now */}
                            <div className="space-y-2">
                                <Label>Access Key</Label>
                                <Input value={accessKey} onChange={e => setAccessKey(e.target.value)} className="bg-gray-900 border-gray-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Secret Key</Label>
                                <Input type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} className="bg-gray-900 border-gray-700" />
                            </div>
                            <Button type="submit" className="w-full">Save</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border border-gray-800 bg-[#111827]">
                <Table>
                    <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-gray-900/50">
                            <TableHead className="text-gray-400">Name</TableHead>
                            <TableHead className="text-gray-400">Type</TableHead>
                            <TableHead className="text-gray-400 w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-gray-400">Loading...</TableCell>
                            </TableRow>
                        ) : credentials.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-gray-400">No credentials found.</TableCell>
                            </TableRow>
                        ) : (
                            credentials.map((cred) => (
                                <TableRow key={cred.id} className="border-gray-800 hover:bg-gray-900/50">
                                    <TableCell className="font-medium">{cred.name}</TableCell>
                                    <TableCell>{cred.type}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="hover:text-red-400"
                                            onClick={() => {
                                                if (confirm('Delete credential?')) {
                                                    api.deleteCredential(cred.id).then(() => loadCredentials())
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
