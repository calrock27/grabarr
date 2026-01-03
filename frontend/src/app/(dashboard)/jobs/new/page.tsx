"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api, type Remote, type Schedule, type Credential } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Save, ArrowRight, ArrowLeft, CheckCircle, Plus, AlertCircle, Loader2, MoveRight, X, FileText, Folder, File } from "lucide-react"
import { RemoteDialog } from "@/components/remotes/RemoteDialog"
import { FileBrowser, type CopyMode } from "@/components/files/FileBrowser"

export default function NewJobPage() {
    return (
        <Suspense fallback={<div className="p-6 text-white">Loading...</div>}>
            <NewJobPageContent />
        </Suspense>
    )
}

function NewJobPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const editId = searchParams.get("edit")

    const [step, setStep] = useState(1)
    const [remotes, setRemotes] = useState<Remote[]>([])
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [credentials, setCredentials] = useState<Credential[]>([])

    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [createFor, setCreateFor] = useState<"source" | "dest" | null>(null)

    // Step 1: Basics
    const [name, setName] = useState("")
    const [operation, setOperation] = useState("copy")
    const [transferMethod, setTransferMethod] = useState<'direct' | 'proxy'>('direct')
    const [schedule, setSchedule] = useState<string | undefined>(undefined)

    // Step 1: Targets
    const [sourceId, setSourceId] = useState<string>("")
    const [destId, setDestId] = useState<string>("")
    const [sourceTestStatus, setSourceTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
    const [destTestStatus, setDestTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
    const [testErrors, setTestErrors] = useState<{ source?: string, dest?: string }>({})

    // Step 2: Paths & Excludes
    const [sourcePath, setSourcePath] = useState("")
    const [destPath, setDestPath] = useState("")
    const [sourceCopyMode, setSourceCopyMode] = useState<CopyMode>('folder')
    const [destCopyMode, setDestCopyMode] = useState<CopyMode>('folder')
    const [excludePatterns, setExcludePatterns] = useState<string[]>([])

    // Concurrency settings
    const [allowConcurrentRuns, setAllowConcurrentRuns] = useState(false)
    const [maxConcurrentRuns, setMaxConcurrentRuns] = useState(1)

    // Verification settings
    const [useChecksum, setUseChecksum] = useState(false)

    // Summary Dialog
    const [showSummary, setShowSummary] = useState(false)
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryFiles, setSummaryFiles] = useState<any[]>([])

    useEffect(() => {
        api.getRemotes().then(setRemotes).catch(console.error)
        api.getSchedules().then(setSchedules).catch(console.error)
        api.getCredentials().then(setCredentials).catch(console.error)

        if (editId) {
            api.getJob(parseInt(editId)).then(job => {
                setName(job.name)
                setOperation(job.operation)
                setTransferMethod(job.transfer_method || 'direct')
                setSourceId(job.source_remote_id.toString())
                setDestId(job.dest_remote_id.toString())
                setSchedule(job.schedule || "")
                setSourcePath(job.source_path || "")
                setDestPath(job.dest_path || "")
                setSourceCopyMode(job.copy_mode as any || 'folder')
                setExcludePatterns(job.excludes || [])
                setAllowConcurrentRuns(job.allow_concurrent_runs || false)
                setMaxConcurrentRuns(job.max_concurrent_runs || 1)
                setUseChecksum(job.use_checksum || false)
            }).catch(() => {
                alert("Failed to load job")
                router.push("/jobs")
            })
        }
    }, [editId, router])

    async function handleJobCreate() {
        try {
            const payload = {
                name,
                operation,
                source_remote_id: parseInt(sourceId),
                dest_remote_id: parseInt(destId),
                schedule: schedule || undefined,
                source_path: sourcePath || undefined,
                dest_path: destPath || undefined,
                transfer_method: transferMethod,
                copy_mode: sourceCopyMode,
                excludes: excludePatterns.length > 0 ? excludePatterns : undefined,
                allow_concurrent_runs: allowConcurrentRuns,
                max_concurrent_runs: maxConcurrentRuns,
                use_checksum: useChecksum
            }

            if (editId) {
                await api.updateJob(parseInt(editId), payload)
            } else {
                await api.createJob(payload)
            }
            router.push("/jobs")
        } catch {
            alert("Failed to save job")
        }
    }

    async function testSource() {
        if (!sourceId) return
        setSourceTestStatus('testing')
        setTestErrors(prev => ({ ...prev, source: undefined }))
        try {
            await api.browseRemote(parseInt(sourceId), "")
            setSourceTestStatus('success')
        } catch (e: any) {
            setSourceTestStatus('error')
            setTestErrors(prev => ({ ...prev, source: e.message }))
        }
    }

    async function testDest() {
        if (!destId) return
        setDestTestStatus('testing')
        setTestErrors(prev => ({ ...prev, dest: undefined }))
        try {
            await api.browseRemote(parseInt(destId), "")
            setDestTestStatus('success')
        } catch (e: any) {
            setDestTestStatus('error')
            setTestErrors(prev => ({ ...prev, dest: e.message }))
        }
    }

    async function handleRemoteCreate(data: Omit<Remote, "id">) {
        try {
            const newRemote = await api.createRemote(data)
            const updatedRemotes = await api.getRemotes()
            setRemotes(updatedRemotes)
            const newId = newRemote.id.toString()
            if (createFor === "source") setSourceId(newId)
            if (createFor === "dest") setDestId(newId)
            setIsCreateOpen(false)
        } catch {
            alert("Failed to create target")
        }
    }

    const openCreateDialog = (target: "source" | "dest") => {
        setCreateFor(target)
        setIsCreateOpen(true)
    }

    const addExclude = (pattern: string) => {
        if (!excludePatterns.includes(pattern)) {
            setExcludePatterns([...excludePatterns, pattern])
        }
    }

    const removeExclude = (pattern: string) => {
        setExcludePatterns(excludePatterns.filter(p => p !== pattern))
    }

    const loadSummary = async () => {
        if (!sourceId) return
        setSummaryLoading(true)
        setShowSummary(true)
        try {
            const files = await api.browseRemote(parseInt(sourceId), sourcePath)
            setSummaryFiles(files)
        } catch (e) {
            console.error(e)
            setSummaryFiles([])
        } finally {
            setSummaryLoading(false)
        }
    }

    const nextStep = () => setStep(s => s + 1)
    const prevStep = () => setStep(s => s - 1)

    const sourceRemote = remotes.find(r => r.id.toString() === sourceId)
    const destRemote = remotes.find(r => r.id.toString() === destId)

    const getTransferSummary = () => ({
        from: `${sourceRemote?.name || 'Source'}:/${sourcePath || ''}`,
        to: `${destRemote?.name || 'Dest'}:/${destPath || ''}`,
        mode: sourceCopyMode === 'folder' ? 'Folder + contents' : 'Contents only',
        operation: operation.charAt(0).toUpperCase() + operation.slice(1)
    })

    return (
        <div className="p-6 w-[80%] mx-auto text-white">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{editId ? "Edit Job" : "Create New Job"}</h2>
                <span className="text-sm text-muted-foreground">Step {step} of 2</span>
            </div>

            <Card className="bg-card border-border">
                <CardContent className="pt-4">

                    {/* STEP 1 */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs">Job Name</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Seedbox Sync"
                                        className="h-9"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Operation</Label>
                                    <Select value={operation} onValueChange={setOperation}>
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="copy">Copy</SelectItem>
                                            <SelectItem value="sync">Sync</SelectItem>
                                            <SelectItem value="move">Move</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Method</Label>
                                    <Select value={transferMethod} onValueChange={(v: 'direct' | 'proxy') => setTransferMethod(v)}>
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="direct">Direct</SelectItem>
                                            <SelectItem value="proxy">Proxy</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[9px] text-muted-foreground">
                                        {transferMethod === 'direct' ? 'Source → Destination' : 'Source → grabarr → Destination'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs">Schedule (Optional)</Label>
                                <Select onValueChange={(val) => {
                                    if (val !== "manual") {
                                        const s = schedules.find(sched => sched.id.toString() === val)
                                        if (s) {
                                            const cron = s.schedule_type === "interval"
                                                ? `*/${s.config.minutes} * * * *`
                                                : (s.config.cron || "* * * * *")
                                            setSchedule(cron)
                                        }
                                    } else {
                                        setSchedule(undefined)
                                    }
                                }}>
                                    <SelectTrigger className="h-9"><SelectValue placeholder="Manual" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">Manual</SelectItem>
                                        {schedules.map(s => (
                                            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Concurrency Settings */}
                            <div className="space-y-2 pt-3 border-t">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="allowConcurrent"
                                        checked={allowConcurrentRuns}
                                        onChange={(e) => setAllowConcurrentRuns(e.target.checked)}
                                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary"
                                    />
                                    <Label htmlFor="allowConcurrent" className="text-xs cursor-pointer">
                                        Allow Concurrent Runs
                                    </Label>
                                </div>
                                {allowConcurrentRuns && (
                                    <div className="flex items-center gap-2 ml-7">
                                        <Label className="text-xs text-muted-foreground">Max parallel instances:</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={maxConcurrentRuns}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1;
                                                setMaxConcurrentRuns(Math.min(val, 10));
                                            }}
                                            className="h-7 w-12 text-center no-spinner"
                                        />
                                    </div>
                                )}
                                <p className="text-[9px] text-muted-foreground ml-7">
                                    {allowConcurrentRuns
                                        ? `Up to ${maxConcurrentRuns} instances can run simultaneously`
                                        : "New runs will be skipped if job is already running"}
                                </p>
                            </div>

                            {/* Verification Settings */}
                            <div className="space-y-2 pt-3 border-t">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="useChecksum"
                                        checked={useChecksum}
                                        onChange={(e) => setUseChecksum(e.target.checked)}
                                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary"
                                    />
                                    <Label htmlFor="useChecksum" className="text-xs cursor-pointer">
                                        Use Checksum Verification
                                    </Label>
                                </div>
                                <p className="text-[9px] text-muted-foreground ml-7">
                                    {useChecksum
                                        ? "Files are compared by hash (slower but more accurate)"
                                        : "Files are compared by modification time and size (faster)"}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                                {/* Source */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">Source Target</Label>
                                        {sourceTestStatus === 'testing' && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {sourceTestStatus === 'success' && <CheckCircle className="h-3 w-3 text-primary" />}
                                        {sourceTestStatus === 'error' && <AlertCircle className="h-3 w-3 text-red-400" />}
                                    </div>
                                    <div className="flex gap-1">
                                        <Select value={sourceId} onValueChange={id => { setSourceId(id); setSourceTestStatus('idle'); }}>
                                            <SelectTrigger className={`h-9 ${sourceTestStatus === 'error' ? 'border-red-500' : ''}`}>
                                                <SelectValue placeholder="Select..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {remotes.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => openCreateDialog("source")}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button variant="link" size="sm" className="h-5 px-0 text-[10px] text-muted-foreground" onClick={testSource} disabled={!sourceId}>
                                        Test Connection
                                    </Button>
                                </div>

                                {/* Dest */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">Destination Target</Label>
                                        {destTestStatus === 'testing' && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {destTestStatus === 'success' && <CheckCircle className="h-3 w-3 text-primary" />}
                                        {destTestStatus === 'error' && <AlertCircle className="h-3 w-3 text-red-400" />}
                                    </div>
                                    <div className="flex gap-1">
                                        <Select value={destId} onValueChange={id => { setDestId(id); setDestTestStatus('idle'); }}>
                                            <SelectTrigger className={`h-9 ${destTestStatus === 'error' ? 'border-red-500' : ''}`}>
                                                <SelectValue placeholder="Select..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {remotes.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => openCreateDialog("dest")}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button variant="link" size="sm" className="h-5 px-0 text-[10px] text-muted-foreground" onClick={testDest} disabled={!destId}>
                                        Test Connection
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            {/* File Browsers - Side by Side */}
                            <div className="grid grid-cols-[1fr_32px_1fr] gap-2" style={{ height: '450px' }}>
                                <FileBrowser
                                    remoteId={parseInt(sourceId)}
                                    initialPath={sourcePath}
                                    onSelectPath={(path, mode) => { setSourcePath(path); setSourceCopyMode(mode); }}
                                    onAddExclude={addExclude}
                                    label="Source"
                                />
                                <div className="flex items-center justify-center">
                                    <div className="text-center">
                                        <MoveRight className="h-5 w-5 text-primary mx-auto" />
                                        <span className="text-[9px] text-muted-foreground uppercase">{operation}</span>
                                    </div>
                                </div>
                                <FileBrowser
                                    remoteId={parseInt(destId)}
                                    initialPath={destPath}
                                    onSelectPath={(path, mode) => { setDestPath(path); setDestCopyMode(mode); }}
                                    label="Destination"
                                />
                            </div>

                            {/* Transfer Summary */}
                            <div className="grid grid-cols-4 gap-2 p-2 rounded bg-zinc-800/50 text-[11px]">
                                <div>
                                    <span className="text-muted-foreground">From:</span>
                                    <div className="font-mono text-primary/80 truncate">{getTransferSummary().from}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">To:</span>
                                    <div className="font-mono text-blue-300 truncate">{getTransferSummary().to}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Operation:</span>
                                    <div>{getTransferSummary().operation}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Mode:</span>
                                    <div>{getTransferSummary().mode}</div>
                                </div>
                            </div>

                            {/* Exclude Patterns as Chips */}
                            <div className="p-2 rounded bg-zinc-800/30 border border-border/50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Exclusions</span>
                                    <span className="text-[10px] text-muted-foreground">Right-click files to add</span>
                                </div>
                                {excludePatterns.length === 0 ? (
                                    <div className="text-[11px] text-muted-foreground py-1">No exclusions configured</div>
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {excludePatterns.map((pattern, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-1 px-2 py-0.5 bg-red-900/30 border border-red-800/50 rounded text-[10px] font-mono"
                                            >
                                                <span className="text-red-300">{pattern}</span>
                                                <button
                                                    onClick={() => removeExclude(pattern)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </CardContent>

                {/* Footer */}
                <div className="px-4 py-3 border-t flex justify-between">
                    {step === 1 ? (
                        <Button variant="ghost" size="sm" onClick={() => router.push('/jobs')}>
                            Cancel
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={prevStep}>
                            <ArrowLeft className="mr-1 h-4 w-4" /> Back
                        </Button>
                    )}
                    <div className="flex gap-2">
                        {step === 2 && (
                            <Button variant="outline" size="sm" onClick={loadSummary} disabled={!sourceId}>
                                <FileText className="mr-1 h-4 w-4" /> Job Summary
                            </Button>
                        )}
                        {step < 2 ? (
                            <Button size="sm" onClick={nextStep} disabled={!name || !sourceId || !destId}>
                                Next <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button size="sm" onClick={handleJobCreate} className="bg-primary hover:bg-primary/90">
                                <Save className="mr-1 h-4 w-4" /> {editId ? "Update" : "Create"} Job
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            <Dialog open={showSummary} onOpenChange={setShowSummary}>
                <DialogContent className="max-w-7xl sm:max-w-7xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-zinc-950 border-zinc-800 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle>Job Summary</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Transfer Info */}
                        <div className="grid grid-cols-2 gap-4 p-3 rounded bg-zinc-800/50 text-sm">
                            <div className="overflow-hidden">
                                <div className="text-muted-foreground text-xs mb-1">Source</div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-primary text-sm">{sourceRemote?.name}</span>
                                    <span className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap break-all px-2 py-1.5 bg-zinc-900/80 border border-zinc-800/50 rounded mt-1.5 leading-relaxed">/{sourcePath || ''}</span>
                                </div>
                            </div>
                            <div className="overflow-hidden">
                                <div className="text-muted-foreground text-xs mb-1">Destination</div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-blue-400 text-sm">{destRemote?.name}</span>
                                    <span className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap break-all px-2 py-1.5 bg-zinc-900/80 border border-zinc-800/50 rounded mt-1.5 leading-relaxed">/{destPath || ''}</span>
                                </div>
                            </div>
                            <div>
                                <div className="text-muted-foreground text-xs mb-1">Operation</div>
                                <div className="capitalize">{operation}</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground text-xs mb-1">Method</div>
                                <div className="capitalize">{transferMethod}</div>
                            </div>
                        </div>

                        {/* Files to Transfer */}
                        <div>
                            <div className="text-sm font-medium mb-2">Files & Folders to Transfer</div>
                            {summaryLoading ? (
                                <div className="flex items-center gap-2 p-4 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading files...
                                </div>
                            ) : summaryFiles.length === 0 ? (
                                <div className="p-4 text-muted-foreground text-sm">No files found at source path</div>
                            ) : (
                                <div className="border border-zinc-800 rounded-lg max-h-[400px] overflow-y-auto overflow-x-hidden bg-zinc-900/30">
                                    {summaryFiles.map((f: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 text-sm min-w-0">
                                            {f.IsDir ? <Folder className="h-4 w-4 text-amber-400 flex-shrink-0" /> : <File className="h-4 w-4 text-zinc-400 flex-shrink-0" />}
                                            <span className="truncate flex-1 min-w-0" title={f.Name}>{f.Name}</span>
                                            {!f.IsDir && <span className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right">{(f.Size / 1024 / 1024).toFixed(1)} MB</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Excludes */}
                        {excludePatterns.length > 0 && (
                            <div>
                                <div className="text-sm font-medium mb-2">Exclusions ({excludePatterns.length})</div>
                                <div className="flex flex-wrap gap-1">
                                    {excludePatterns.map((p, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded bg-zinc-700 text-xs font-mono">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <RemoteDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                credentials={credentials}
                onSubmit={handleRemoteCreate}
                mode="create"
            />
        </div>
    )
}
