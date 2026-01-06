"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api, type Remote, type Schedule, type Credential, type Action, type JobAction } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Save, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Loader2, MoveRight, X, FileText, Folder, File, Zap, Settings2, Target, Clock } from "lucide-react"
import { FileBrowser, type CopyMode } from "@/components/files/FileBrowser"
import { ActionWorkflow } from "@/components/actions/ActionWorkflow"

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
    const [availableActions, setAvailableActions] = useState<Action[]>([])



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
    const [maxConcurrentRuns, setMaxConcurrentRuns] = useState(2)

    // Verification settings
    const [useChecksum, setUseChecksum] = useState(false)

    // Actions (optional)
    const [jobActions, setJobActions] = useState<JobAction[]>([])
    const [showActionsPanel, setShowActionsPanel] = useState(false)

    // Summary Dialog
    const [showSummary, setShowSummary] = useState(false)
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryFiles, setSummaryFiles] = useState<any[]>([])

    useEffect(() => {
        api.getRemotes().then(setRemotes).catch(console.error)
        api.getSchedules().then(setSchedules).catch(console.error)

        api.getCredentials().then(setCredentials).catch(console.error)
        api.getActions().then(setAvailableActions).catch(console.error)

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
                setJobActions((job.actions || []).map((ja: JobAction) => ({
                    ...ja,
                    tempId: ja.tempId || ja.id?.toString() || crypto.randomUUID()
                })))
                // Auto-expand actions panel if job has actions
                if (job.actions && job.actions.length > 0) {
                    setShowActionsPanel(true)
                }
            }).catch(() => {
                alert("Failed to load job")
                router.push("/jobs")
            })
        }
    }, [editId, router])



    const testSource = async () => {
        if (!sourceId) return
        setSourceTestStatus('testing')
        try {
            await api.testRemoteById(parseInt(sourceId))
            setSourceTestStatus('success')
        } catch (e: any) {
            setSourceTestStatus('error')
            setTestErrors(prev => ({ ...prev, source: e.message }))
        }
    }

    const testDest = async () => {
        if (!destId) return
        setDestTestStatus('testing')
        try {
            await api.testRemoteById(parseInt(destId))
            setDestTestStatus('success')
        } catch (e: any) {
            setDestTestStatus('error')
            setTestErrors(prev => ({ ...prev, dest: e.message }))
        }
    }

    const handleJobCreate = async () => {
        // Combine pre and post actions with correct order
        const allActions = jobActions.map((ja, index) => ({
            action_id: ja.action_id,
            trigger: ja.trigger,
            order: index
        }))

        const payload: any = {
            name,
            operation,
            source_remote_id: parseInt(sourceId),
            dest_remote_id: parseInt(destId),
            source_path: sourcePath,
            dest_path: destPath,
            transfer_method: transferMethod,
            copy_mode: sourceCopyMode,
            excludes: excludePatterns,
            allow_concurrent_runs: allowConcurrentRuns,
            max_concurrent_runs: maxConcurrentRuns,
            use_checksum: useChecksum,
            actions: allActions
        }
        if (schedule) payload.schedule = schedule

        try {
            if (editId) {
                await api.updateJob(parseInt(editId), payload)
            } else {
                await api.createJob(payload)
            }
            router.push("/jobs")
        } catch (e) {
            console.error(e)
            alert("Failed to save job")
        }
    }

    const addExclude = (path: string) => {
        if (!excludePatterns.includes(path)) {
            setExcludePatterns([...excludePatterns, path])
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

    // Derived pre/post actions for ActionWorkflow
    const preActions = jobActions.filter(ja => ja.trigger === 'pre')
    const postActions = jobActions.filter(ja => ja.trigger !== 'pre')

    const handlePreActionsChange = (actions: JobAction[]) => {
        const post = jobActions.filter(ja => ja.trigger !== 'pre')
        setJobActions([...actions.map(a => ({ ...a, trigger: 'pre' as const })), ...post])
    }

    const handlePostActionsChange = (actions: JobAction[]) => {
        const pre = jobActions.filter(ja => ja.trigger === 'pre')
        setJobActions([...pre, ...actions.map(a => ({ ...a, trigger: a.trigger || 'post_always' as const }))])
    }

    const addAction = (actionId: string, trigger: 'pre' | 'post_success' | 'post_fail' | 'post_always') => {
        const action = availableActions.find(a => a.id.toString() === actionId)
        if (action) {
            setJobActions([...jobActions, {
                action_id: action.id,
                trigger,
                order: jobActions.length,
                action, // Include full object for UI display
                tempId: crypto.randomUUID()
            }])
        }
    }

    const removeAction = (index: number) => {
        const newActions = [...jobActions]
        newActions.splice(index, 1)
        setJobActions(newActions)
    }

    const updateActionTrigger = (index: number, trigger: any) => {
        const newActions = [...jobActions]
        newActions[index].trigger = trigger
        setJobActions(newActions)
    }

    return (
        <div className="p-6 w-[85%] mx-auto text-white">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{editId ? "Edit Job" : "Create New Job"}</h2>
                <span className="text-sm text-muted-foreground">Step {step} of 2</span>
            </div>

            <Card className="bg-card border-border">
                <CardContent className="pt-6">

                    {/* STEP 1 - Configuration */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in duration-200">

                            {/* Section: Job Identity */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
                                    <Settings2 className="h-3.5 w-3.5" />
                                    Job Configuration
                                </div>
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-2 space-y-1.5">
                                        <Label className="text-xs">Job Name</Label>
                                        <Input
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            placeholder="My Transfer Job"
                                            className="h-9"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-1.5">
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
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Transfer Method</Label>
                                        <Select value={transferMethod} onValueChange={(v: 'direct' | 'proxy') => setTransferMethod(v)}>
                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="direct">Direct</SelectItem>
                                                <SelectItem value="proxy">Proxy</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Targets */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
                                    <Target className="h-3.5 w-3.5" />
                                    Source & Destination
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Source */}
                                    <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/20">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-medium">Source Target</Label>
                                            <div className="flex items-center gap-1.5">
                                                {sourceTestStatus === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                                {sourceTestStatus === 'success' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                                                {sourceTestStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                                            </div>
                                        </div>
                                        <Select value={sourceId} onValueChange={id => { setSourceId(id); setSourceTestStatus('idle'); }}>
                                            <SelectTrigger className={`h-9 ${sourceTestStatus === 'error' ? 'border-red-500' : ''}`}>
                                                <SelectValue placeholder="Select target..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {remotes.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button variant="link" size="sm" className="h-5 px-0 text-[10px] text-muted-foreground" onClick={testSource} disabled={!sourceId}>
                                            Test Connection
                                        </Button>
                                    </div>

                                    {/* Destination */}
                                    <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/20">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-medium">Destination Target</Label>
                                            <div className="flex items-center gap-1.5">
                                                {destTestStatus === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                                {destTestStatus === 'success' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                                                {destTestStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                                            </div>
                                        </div>
                                        <Select value={destId} onValueChange={id => { setDestId(id); setDestTestStatus('idle'); }}>
                                            <SelectTrigger className={`h-9 ${destTestStatus === 'error' ? 'border-red-500' : ''}`}>
                                                <SelectValue placeholder="Select target..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {remotes.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button variant="link" size="sm" className="h-5 px-0 text-[10px] text-muted-foreground" onClick={testDest} disabled={!destId}>
                                            Test Connection
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Schedule & Options */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
                                    <Clock className="h-3.5 w-3.5" />
                                    Schedule & Options
                                </div>

                                {/* Schedule Row */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Schedule</Label>
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
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Manual (On-Demand)" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="manual">Manual (On-Demand)</SelectItem>
                                                {schedules.map(s => (
                                                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Options Row - Toggle Switches */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="allowConcurrent" className="text-xs font-medium cursor-pointer">
                                                Allow Concurrent Runs
                                            </Label>
                                            <p className="text-[10px] text-muted-foreground">
                                                {allowConcurrentRuns
                                                    ? <span className="flex items-center gap-1.5">
                                                        Max instances:
                                                        <Input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            value={maxConcurrentRuns}
                                                            onChange={(e) => {
                                                                const rawVal = e.target.value;
                                                                if (rawVal === '') {
                                                                    setMaxConcurrentRuns('' as any);
                                                                } else {
                                                                    const val = parseInt(rawVal);
                                                                    if (!isNaN(val)) {
                                                                        setMaxConcurrentRuns(val);
                                                                    }
                                                                }
                                                            }}
                                                            onBlur={() => {
                                                                const val = typeof maxConcurrentRuns === 'number' ? maxConcurrentRuns : 2;
                                                                setMaxConcurrentRuns(Math.max(2, Math.min(val, 10)));
                                                            }}
                                                            className="h-6 w-12 text-center text-xs"
                                                        />
                                                    </span>
                                                    : "Skip if already running"}
                                            </p>
                                        </div>
                                        <Switch
                                            id="allowConcurrent"
                                            checked={allowConcurrentRuns}
                                            onCheckedChange={setAllowConcurrentRuns}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="useChecksum" className="text-xs font-medium cursor-pointer">
                                                Checksum Verification
                                            </Label>
                                            <p className="text-[10px] text-muted-foreground">
                                                {useChecksum ? "Compare by hash (slower)" : "Compare by time/size (faster)"}
                                            </p>
                                        </div>
                                        <Switch
                                            id="useChecksum"
                                            checked={useChecksum}
                                            onCheckedChange={setUseChecksum}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2 - Paths & Actions */}
                    {step === 2 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {/* File Browsers - Side by Side */}
                            <div className="grid grid-cols-[1fr_32px_1fr] gap-2" style={{ height: '400px' }}>
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
                                    <div className="font-mono text-primary/80 truncate">{getTransferSummary().to}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Mode:</span>
                                    <div className="font-mono">{getTransferSummary().mode}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Operation:</span>
                                    <div className="font-mono">{getTransferSummary().operation}</div>
                                </div>
                            </div>

                            {/* Excludes */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs">Excludes</Label>
                                    <span className="text-[9px] text-muted-foreground">Right-click files in Source browser to add</span>
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

                            {/* Optional Actions Panel */}
                            {!showActionsPanel ? (
                                <Button
                                    variant="outline"
                                    className="w-full justify-center gap-2 h-10 border-dashed hover:bg-muted/30"
                                    onClick={() => setShowActionsPanel(true)}
                                >
                                    <Zap className="h-4 w-4 text-purple-400" />
                                    <span>Configure Actions</span>
                                    {jobActions.length > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">
                                            {jobActions.length}
                                        </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">(Optional)</span>
                                </Button>
                            ) : (
                                <div className="border border-border rounded-lg p-4 bg-muted/10 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap className="h-4 w-4 text-purple-400" />
                                            <span className="text-sm font-medium">Actions</span>
                                            {jobActions.length > 0 && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">
                                                    {jobActions.length} configured
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-muted-foreground"
                                            onClick={() => setShowActionsPanel(false)}
                                        >
                                            <X className="h-3.5 w-3.5 mr-1" /> Close
                                        </Button>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Drag actions from the library to the timeline.
                                    </div>
                                    <ActionWorkflow
                                        jobName={name}
                                        preActions={preActions}
                                        postActions={postActions}
                                        availableActions={availableActions}
                                        onPreActionsChange={handlePreActionsChange}
                                        onPostActionsChange={handlePostActionsChange}
                                    />
                                </div>
                            )}
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
                            <Button size="sm" onClick={nextStep} disabled={step === 1 ? (!name || !sourceId || !destId) : false}>
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
                            <div>
                                <div className="text-muted-foreground text-xs">Source</div>
                                <div className="font-mono text-primary">{getTransferSummary().from}</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground text-xs">Destination</div>
                                <div className="font-mono text-primary">{getTransferSummary().to}</div>
                            </div>
                        </div>

                        {/* File List */}
                        <div className="max-h-[50vh] overflow-y-auto">
                            {summaryLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {summaryFiles.map((file, i) => (
                                        <div key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-800/50 text-sm">
                                            {file.IsDir ? (
                                                <Folder className="h-4 w-4 text-yellow-400" />
                                            ) : (
                                                <File className="h-4 w-4 text-zinc-400" />
                                            )}
                                            <span className="font-mono truncate">{file.Name}</span>
                                            {!file.IsDir && (
                                                <span className="text-xs text-muted-foreground ml-auto">
                                                    {(file.Size / 1024 / 1024).toFixed(2)} MB
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>


        </div>
    )
}
