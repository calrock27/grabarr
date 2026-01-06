"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type Remote, type Credential } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, CheckCircle, AlertCircle, Play } from "lucide-react"

// Helper function to get endpoint placeholder based on provider
function getEndpointPlaceholder(provider: string = "AWS", region: string = ""): string {
    switch (provider) {
        case "AWS":
            return "https://s3.amazonaws.com (optional)"
        case "Cloudflare":
            return "https://<account-id>.r2.cloudflarestorage.com"
        case "Backblaze":
            return `https://s3.${region || "us-west-004"}.backblazeb2.com`
        case "Wasabi":
            return `https://s3.${region || "us-east-1"}.wasabisys.com`
        case "DigitalOcean":
            return `https://${region || "nyc3"}.digitaloceanspaces.com`
        case "Linode":
            return `https://${region || "us-east-1"}.linodeobjects.com`
        case "Vultr":
            return `https://${region || "ewr1"}.vultrobjects.com`
        case "Scaleway":
            return `https://s3.${region || "fr-par"}.scw.cloud`
        case "Oracle":
            return "https://<namespace>.compat.objectstorage.<region>.oraclecloud.com"
        case "Minio":
            return "https://minio.example.com:9000"
        default:
            return "https://s3-compatible-endpoint.com"
    }
}

// Helper function to get region placeholder based on provider
function getRegionPlaceholder(provider: string = "AWS"): string {
    switch (provider) {
        case "Cloudflare":
            return "auto"
        case "Vultr":
            return "ewr1"
        case "Scaleway":
            return "fr-par"
        case "Oracle":
            return "us-phoenix-1"
        default:
            return "us-east-1"
    }
}


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

    // Sync state when initialData changes (for edit mode)
    useEffect(() => {
        setName(initialData?.name || "")
        setType(initialData?.type || "s3")
        setCredentialId(initialData?.credential_id?.toString() || "none")
        setConfig(initialData?.config || {})
        setTestStatus('idle')
    }, [initialData])

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
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={config.provider || "AWS"} onValueChange={(v) => {
                                updateConfig("provider", v)
                                // Set sensible defaults based on provider
                                if (v === "Cloudflare") {
                                    updateConfig("region", "auto")
                                } else if (v === "Backblaze") {
                                    updateConfig("region", "")
                                } else if (v === "Wasabi") {
                                    updateConfig("region", "us-east-1")
                                } else if (v === "Linode") {
                                    updateConfig("region", "us-east-1")
                                } else if (v === "Vultr") {
                                    updateConfig("region", "ewr1")
                                } else if (v === "Scaleway") {
                                    updateConfig("region", "fr-par")
                                } else if (v === "Oracle") {
                                    updateConfig("region", "us-phoenix-1")
                                }
                            }}>
                                <SelectTrigger className="bg-muted/50 border-gray-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-gray-700 text-white">
                                    <SelectItem value="AWS">Amazon S3</SelectItem>
                                    <SelectItem value="Cloudflare">Cloudflare R2</SelectItem>
                                    <SelectItem value="Backblaze">Backblaze B2</SelectItem>
                                    <SelectItem value="Wasabi">Wasabi</SelectItem>
                                    <SelectItem value="DigitalOcean">DigitalOcean Spaces</SelectItem>
                                    <SelectItem value="Linode">Linode Object Storage</SelectItem>
                                    <SelectItem value="Vultr">Vultr Object Storage</SelectItem>
                                    <SelectItem value="Scaleway">Scaleway Object Storage</SelectItem>
                                    <SelectItem value="Oracle">Oracle Cloud Object Storage</SelectItem>
                                    <SelectItem value="Minio">MinIO (Self-Hosted)</SelectItem>
                                    <SelectItem value="Other">Other S3-Compatible</SelectItem>
                                </SelectContent>
                            </Select>
                            {config.provider === "Cloudflare" && (
                                <p className="text-xs text-blue-400">💡 Use S3 Access Key credentials from your <a href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">R2 dashboard</a></p>
                            )}
                            {config.provider === "Oracle" && (
                                <p className="text-xs text-blue-400">💡 Requires S3 Compatibility API credentials from your <a href="https://cloud.oracle.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">Oracle Cloud console</a></p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Endpoint {config.provider === "AWS" ? "(Optional)" : "(Required)"}</Label>
                                <Input
                                    value={config.endpoint || ""}
                                    onChange={e => updateConfig("endpoint", e.target.value)}
                                    placeholder={getEndpointPlaceholder(config.provider, config.region)}
                                    className="bg-muted/50 border-gray-700"
                                />
                                {config.provider === "Cloudflare" && (
                                    <p className="text-xs text-muted-foreground">Format: https://&lt;account-id&gt;.r2.cloudflarestorage.com</p>
                                )}
                                {config.provider === "Oracle" && (
                                    <p className="text-xs text-muted-foreground">Format: https://&lt;namespace&gt;.compat.objectstorage.&lt;region&gt;.oraclecloud.com</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Region</Label>
                                <Input
                                    value={config.region || ""}
                                    onChange={e => updateConfig("region", e.target.value)}
                                    placeholder={getRegionPlaceholder(config.provider)}
                                    className="bg-muted/50 border-gray-700"
                                />
                                {config.provider === "Cloudflare" && (
                                    <p className="text-xs text-muted-foreground">R2 uses "auto" for region</p>
                                )}
                                {config.provider === "Linode" && (
                                    <p className="text-xs text-muted-foreground">e.g., us-east-1, eu-central-1, ap-south-1</p>
                                )}
                                {config.provider === "Scaleway" && (
                                    <p className="text-xs text-muted-foreground">e.g., fr-par, nl-ams, pl-waw</p>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Bucket</Label>
                            <Input value={config.bucket || ""} onChange={e => updateConfig("bucket", e.target.value)} placeholder="my-bucket" className="bg-muted/50 border-gray-700" />
                        </div>
                        {config.provider !== "Cloudflare" && (
                            <div className="space-y-2">
                                <Label>Storage Class (Optional)</Label>
                                <Input value={config.storage_class || ""} onChange={e => updateConfig("storage_class", e.target.value)} placeholder="STANDARD" className="bg-muted/50 border-gray-700" />
                            </div>
                        )}
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
