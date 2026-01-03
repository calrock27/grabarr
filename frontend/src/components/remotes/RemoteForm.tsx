"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type Remote, type Credential } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, CheckCircle, AlertCircle, Play } from "lucide-react"

interface RemoteFormProps {
    initialData?: Remote
    credentials: Credential[]
    onSubmit: (data: Omit<Remote, "id">) => void
    onCancel: () => void
}

export function RemoteForm({ initialData, credentials, onSubmit, onCancel }: RemoteFormProps) {
    const [name, setName] = useState(initialData?.name || "")
    const [type, setType] = useState(initialData?.type || "s3")
    const [credentialId, setCredentialId] = useState<string>(initialData?.credential_id?.toString() || "none")
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

    // Config State - Flattened for form usage, will be packed on submit
    const [config, setConfig] = useState<Record<string, string>>(initialData?.config || {})

    // Reset config when type changes (optional, or keep generic fields)
    const handleTypeChange = (val: string) => {
        setType(val)
        // Reset config to avoid leakage, but maybe keep some like 'path'? 
        // Safer to reset.
        if (val !== type) setConfig({})
    }

    const updateConfig = (key: string, val: string) => {
        setConfig(prev => ({ ...prev, [key]: val }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSubmit({
            name,
            type,
            credential_id: credentialId === "none" || !credentialId ? undefined : parseInt(credentialId),
            config
        })
    }

    // Filter credentials based on type
    // s3 -> s3
    // sftp -> ssh, password
    // ftp -> password
    // smb -> password
    const filteredCredentials = credentials.filter(c => {
        if (type === 's3') return c.type === 's3'
        if (type === 'sftp') return c.type === 'ssh' || c.type === 'password'
        if (['ftp', 'smb', 'webdav'].includes(type)) return c.type === 'password'
        return true
    })

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label>Name</Label>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="e.g. Production S3"
                    className="bg-muted/50 border-gray-700"
                />
            </div>

            <div className="space-y-2">
                <Label>Protocol</Label>
                <Select value={type} onValueChange={handleTypeChange}>
                    <SelectTrigger className="bg-muted/50 border-gray-700">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-gray-700 text-white">
                        <SelectItem value="s3">S3 / MinIO / R2</SelectItem>
                        <SelectItem value="sftp">SFTP (SSH)</SelectItem>
                        <SelectItem value="ftp">FTP</SelectItem>
                        <SelectItem value="smb">SMB / CIFS</SelectItem>
                        <SelectItem value="webdav">WebDAV</SelectItem>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="local">Local Filesystem</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Credential Selection */}
            {type !== 'local' && type !== 'http' && (
                <div className="space-y-2">
                    <Label>Credential</Label>
                    <Select value={credentialId} onValueChange={setCredentialId}>
                        <SelectTrigger className="bg-muted/50 border-gray-700">
                            <SelectValue placeholder="Select Identity..." />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-gray-700 text-white">
                            <SelectItem value="none">No Credential</SelectItem>
                            {filteredCredentials.map(c => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.type})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {filteredCredentials.length === 0 && (
                        <p className="text-xs text-muted-foreground">No matching credentials found. Create one first.</p>
                    )}
                </div>
            )}

            {/* Dynamic Fields */}
            <div className="space-y-4 border-t border-gray-800 pt-4">
                {type === 'local' && (
                    <div className="space-y-2">
                        <Label>Path</Label>
                        <Input value={config.path || ""} onChange={e => updateConfig("path", e.target.value)} placeholder="/mnt/data" className="bg-muted/50 border-gray-700" />
                    </div>
                )}

                {type === 's3' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Provider</Label>
                                <Input value={config.provider || "AWS"} onChange={e => updateConfig("provider", e.target.value)} className="bg-muted/50 border-gray-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Region</Label>
                                <Input value={config.region || ""} onChange={e => updateConfig("region", e.target.value)} placeholder="us-east-1" className="bg-muted/50 border-gray-700" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Endpoint (Optional)</Label>
                            <Input value={config.endpoint || ""} onChange={e => updateConfig("endpoint", e.target.value)} placeholder="https://..." className="bg-muted/50 border-gray-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Bucket</Label>
                            <Input value={config.bucket || ""} onChange={e => updateConfig("bucket", e.target.value)} className="bg-muted/50 border-gray-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Storage Class</Label>
                            <Input value={config.storage_class || ""} onChange={e => updateConfig("storage_class", e.target.value)} placeholder="STANDARD" className="bg-muted/50 border-gray-700" />
                        </div>
                    </>
                )}

                {(type === 'sftp' || type === 'ftp') && (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2 space-y-2">
                                <Label>Host</Label>
                                <Input value={config.host || ""} onChange={e => updateConfig("host", e.target.value)} className="bg-muted/50 border-gray-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Port</Label>
                                <Input value={config.port || (type === 'sftp' ? "22" : "21")} onChange={e => updateConfig("port", e.target.value)} className="bg-muted/50 border-gray-700" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Base Path (Optional)</Label>
                            <Input value={config.path || ""} onChange={e => updateConfig("path", e.target.value)} placeholder="/" className="bg-muted/50 border-gray-700" />
                        </div>
                    </>
                )}

                {type === 'smb' && (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2 space-y-2">
                                <Label>Host</Label>
                                <Input value={config.host || ""} onChange={e => updateConfig("host", e.target.value)} className="bg-muted/50 border-gray-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Port</Label>
                                <Input value={config.port || "445"} onChange={e => updateConfig("port", e.target.value)} className="bg-muted/50 border-gray-700" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Share Name</Label>
                            <Input value={config.share || ""} onChange={e => updateConfig("share", e.target.value)} className="bg-muted/50 border-gray-700" />
                        </div>
                        <div className="space-y-2">
                            <Label>Domain (Optional)</Label>
                            <Input value={config.domain || ""} onChange={e => updateConfig("domain", e.target.value)} className="bg-muted/50 border-gray-700" />
                        </div>
                    </>
                )}

                {type === 'webdav' && (
                    <div className="space-y-2">
                        <Label>URL</Label>
                        <Input value={config.url || ""} onChange={e => updateConfig("url", e.target.value)} placeholder="https://webdav.example.com" className="bg-muted/50 border-gray-700" />
                    </div>
                )}

                {type === 'http' && (
                    <div className="space-y-2">
                        <Label>URL</Label>
                        <Input value={config.url || ""} onChange={e => updateConfig("url", e.target.value)} placeholder="https://example.com/files/" className="bg-muted/50 border-gray-700" />
                    </div>
                )}
            </div>

            <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary transition-colors" onClick={async () => {
                    setTestStatus('testing')
                    try {
                        const payload = {
                            name,
                            type,
                            credential_id: credentialId === "none" || !credentialId ? undefined : parseInt(credentialId),
                            config
                        }
                        const res = await api.testRemote(payload)
                        if (res.success) {
                            setTestStatus('success')
                            toast.success("Connection successful!")
                        } else {
                            setTestStatus('error')
                            toast.error("Connection failed: " + res.error)
                        }
                    } catch (e: any) {
                        setTestStatus('error')
                        toast.error("Test failed: " + e.message)
                    }
                }} disabled={!name}>
                    {testStatus === 'idle' ? <Play className="h-4 w-4 mr-2" /> : testStatus === 'testing' ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : testStatus === 'success' ? <CheckCircle className="h-4 w-4 mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
                    {testStatus === 'testing' ? "Testing..." : "Test Connection"}
                </Button>

                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                    <Button type="submit" disabled={!name}>Save Target</Button>
                </div>
            </div>
        </form>
    )
}
