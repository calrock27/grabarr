"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Action, api } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VariableInserter } from "@/components/common/VariableInserter"
import { Switch } from "@/components/ui/switch"
import { Plus, Trash2 } from "lucide-react"

interface ActionFormProps {
    initialData?: Action
    onSubmit: (data: Omit<Action, "id">) => Promise<void>
    onCancel: () => void
}

const ACTION_TYPES = [
    { value: 'webhook', label: 'Webhook' },
    { value: 'command', label: 'Shell Command' },
    { value: 'notification', label: 'Notification' },
    { value: 'rclone', label: 'Rclone Command' },
    { value: 'docker', label: 'Docker Control' },
    { value: 'delay', label: 'Delay' },
]

interface DockerContainer {
    id: string
    name: string
    image: string
    status: string
}

export function ActionForm({ initialData, onSubmit, onCancel }: ActionFormProps) {
    const [name, setName] = useState(initialData?.name || "")
    const [type, setType] = useState(initialData?.type || "webhook")
    const [config, setConfig] = useState<any>(initialData?.config || {})
    const [loading, setLoading] = useState(false)
    const [containers, setContainers] = useState<DockerContainer[]>([])
    const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null)
    const [payloadMode, setPayloadMode] = useState<'json' | 'kv'>('json')
    const [kvPairs, setKvPairs] = useState<{ key: string, value: string }[]>([])

    // Reset when initialData changes or dialog opens for new item
    useEffect(() => {
        if (initialData) {
            setName(initialData.name)
            setType(initialData.type)
            setConfig(initialData.config)
            // Detect payload mode
            try {
                const parsed = JSON.parse(initialData.config.body || '{}')
                if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                    setPayloadMode('kv')
                    setKvPairs(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })))
                }
            } catch {
                setPayloadMode('json')
            }
        } else {
            setName("")
            setType("webhook")
            setConfig({})
            setPayloadMode('kv')
            setKvPairs([])
        }
    }, [initialData])

    // Load Docker containers when type changes to docker
    useEffect(() => {
        if (type === 'docker') {
            api.getDockerStatus().then(status => {
                setDockerAvailable(status.available)
                if (status.available) {
                    api.getDockerContainers().then(setContainers).catch(console.error)
                }
            }).catch(() => setDockerAvailable(false))
        }
    }, [type])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await onSubmit({ name, type, config })
        } finally {
            setLoading(false)
        }
    }

    const updateConfig = (key: string, value: any) => {
        setConfig((prev: any) => ({ ...prev, [key]: value }))
    }

    // Sync KV pairs to body JSON
    useEffect(() => {
        if (type === 'webhook' && payloadMode === 'kv') {
            const bodyObj = kvPairs.reduce((acc, pair) => {
                if (pair.key) acc[pair.key] = pair.value
                return acc
            }, {} as any)
            updateConfig('body', JSON.stringify(bodyObj, null, 2))
        }
    }, [kvPairs, payloadMode, type])

    const handleInsertVariable = (variable: string, field: string) => {
        const currentVal = config[field] || ''
        updateConfig(field, currentVal + variable)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Restart Plex"
                        className="bg-muted/50 border-border"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(val) => { setType(val); setConfig({}); }}>
                        <SelectTrigger className="bg-muted/50 border-border">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-foreground">
                            {ACTION_TYPES.map(t => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Configuration</h3>

                {/* Webhook Config */}
                {type === 'webhook' && (
                    <>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="col-span-1 space-y-2">
                                <Label>Method</Label>
                                <Select value={config.method || 'POST'} onValueChange={(v) => updateConfig('method', v)}>
                                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="GET">GET</SelectItem>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="PUT">PUT</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-3 space-y-2">
                                <Label>URL</Label>
                                <Input
                                    value={config.url || ''}
                                    onChange={(e) => updateConfig('url', e.target.value)}
                                    placeholder="https://api.example.com/webhook"
                                    className="bg-muted/50 border-border"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Payload</Label>
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-normal text-muted-foreground mr-2">Use Key-Value Builder</Label>
                                    <Switch checked={payloadMode === 'kv'} onCheckedChange={(c) => setPayloadMode(c ? 'kv' : 'json')} />
                                </div>
                            </div>

                            {payloadMode === 'json' ? (
                                <div className="relative">
                                    <Textarea
                                        value={config.body || ''}
                                        onChange={(e) => updateConfig('body', e.target.value)}
                                        placeholder='{"text": "Job {{job.name}} finished"}'
                                        className="bg-muted/50 border-border font-mono text-xs min-h-[150px]"
                                    />
                                    <div className="absolute top-2 right-2">
                                        <VariableInserter onInsert={(v) => handleInsertVariable(v, 'body')} />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2 bg-muted/20 p-3 rounded border border-border">
                                    {kvPairs.map((pair, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <Input
                                                placeholder="Key"
                                                value={pair.key}
                                                onChange={e => {
                                                    const newPairs = [...kvPairs]
                                                    newPairs[idx].key = e.target.value
                                                    setKvPairs(newPairs)
                                                }}
                                                className="bg-muted/50 border-border h-8 text-xs font-mono w-[140px] shrink-0"
                                            />
                                            <div className="relative flex-1">
                                                <Input
                                                    placeholder="Value"
                                                    value={pair.value}
                                                    onChange={e => {
                                                        const newPairs = [...kvPairs]
                                                        newPairs[idx].value = e.target.value
                                                        setKvPairs(newPairs)
                                                    }}
                                                    className="bg-muted/50 border-border h-8 text-xs pr-8"
                                                />
                                                <div className="absolute top-1/2 -translate-y-1/2 right-1 scale-75 origin-right">
                                                    <VariableInserter
                                                        onInsert={(v) => {
                                                            const newPairs = [...kvPairs]
                                                            newPairs[idx].value += v
                                                            setKvPairs(newPairs)
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <Button
                                                type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400 shrink-0"
                                                onClick={() => setKvPairs(kvPairs.filter((_, i) => i !== idx))}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        type="button" variant="outline" size="sm" className="w-full text-xs h-7 gap-1 border-dashed"
                                        onClick={() => setKvPairs([...kvPairs, { key: "", value: "" }])}
                                    >
                                        <Plus className="h-3 w-3" /> New Field
                                    </Button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Command Config */}
                {type === 'command' && (
                    <>
                        <div className="space-y-2">
                            <Label>Command</Label>
                            <Input
                                value={config.command || ''}
                                onChange={(e) => updateConfig('command', e.target.value)}
                                placeholder="/usr/bin/script.sh"
                                className="bg-muted/50 border-border font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Working Directory (CWD)</Label>
                            <Input
                                value={config.cwd || ''}
                                onChange={(e) => updateConfig('cwd', e.target.value)}
                                placeholder="/home/user"
                                className="bg-muted/50 border-border font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Timeout (seconds)</Label>
                            <Input
                                type="number"
                                value={config.timeout || ''}
                                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                                placeholder="30"
                                className="bg-muted/50 border-border"
                            />
                        </div>
                    </>
                )}

                {/* Notification Config */}
                {type === 'notification' && (
                    <>
                        <div className="space-y-2">
                            <Label>Service</Label>
                            <Select value={config.service || 'discord'} onValueChange={(v) => updateConfig('service', v)}>
                                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="discord">Discord</SelectItem>
                                    <SelectItem value="gotify">Gotify</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Webhook URL / Config</Label>
                            <Input
                                value={config.webhook_url || ''}
                                onChange={(e) => updateConfig('webhook_url', e.target.value)}
                                placeholder="Webhook URL"
                                className="bg-muted/50 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Message Template</Label>
                            <div className="relative">
                                <Textarea
                                    value={config.message || ''}
                                    onChange={(e) => updateConfig('message', e.target.value)}
                                    placeholder="Job {{job.name}} completed successfully."
                                    className="bg-muted/50 border-border min-h-[100px]"
                                />
                                <div className="absolute bottom-2 right-2">
                                    <VariableInserter onInsert={(v) => handleInsertVariable(v, 'message')} />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Rclone Config */}
                {type === 'rclone' && (
                    <div className="space-y-2">
                        <Label>Rclone RC Command</Label>
                        <Input
                            value={config.command || ''}
                            onChange={(e) => updateConfig('command', e.target.value)}
                            placeholder="core/stats"
                            className="bg-muted/50 border-border font-mono"
                        />
                        <Label>Params (JSON)</Label>
                        <Textarea
                            value={config.params || ''}
                            onChange={(e) => updateConfig('params', e.target.value)}
                            placeholder='{"option": "value"}'
                            className="bg-muted/50 border-border font-mono text-xs"
                            rows={4}
                        />
                    </div>
                )}

                {/* Docker Config */}
                {type === 'docker' && (
                    <>
                        <div className="space-y-2">
                            <Label>Action</Label>
                            <Select value={config.action || 'restart'} onValueChange={(v) => updateConfig('action', v)}>
                                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="start">Start</SelectItem>
                                    <SelectItem value="stop">Stop</SelectItem>
                                    <SelectItem value="restart">Restart</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <div className="space-y-2">
                                <Label>Container</Label>
                                {dockerAvailable === false ? (
                                    <div className="text-sm text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
                                        Docker is not available. Please ensure the backend has access to the Docker socket.
                                    </div>
                                ) : (
                                    <Select value={config.container_id || ''} onValueChange={(v) => updateConfig('container_id', v)}>
                                        <SelectTrigger className="bg-muted/50 border-border">
                                            <SelectValue placeholder="Select container" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border text-foreground">
                                            {containers.length === 0 && <div className="p-2 text-xs text-muted-foreground">No containers found</div>}
                                            {containers.map(c => (
                                                <SelectItem key={c.id} value={c.name}>
                                                    <span className="font-medium">{c.name}</span>
                                                    <span className="ml-2 text-muted-foreground text-xs">({c.image})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Delay Config */}
                {type === 'delay' && (
                    <div className="space-y-2">
                        <Label>Seconds to Wait</Label>
                        <Input
                            type="number"
                            value={config.seconds || ''}
                            onChange={(e) => updateConfig('seconds', parseInt(e.target.value))}
                            placeholder="60"
                            className="bg-muted/50 border-border"
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
                    {loading ? "Saving..." : "Save Action"}
                </Button>
            </div>
        </form >
    )
}
