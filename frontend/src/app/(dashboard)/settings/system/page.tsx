"use client"

import { useEffect, useState } from "react"
import { api, type SystemSettings } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Save, Clock, Database, RefreshCw, Download, Upload, Shield, Globe, Power, AlertTriangle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { setConfiguredTimezone } from "@/lib/dateUtils"
import { ALL_TIMEZONES, TIMEZONE_REGIONS } from "@/lib/timezones"

export default function SystemSettingsPage() {
    const [settings, setSettings] = useState<SystemSettings>({
        failure_cooldown_seconds: 60,
        max_history_entries: 50,
        timezone: "America/New_York",
        default_transfers: 16,
        default_checkers: 32,
        default_buffer_size: 128,
        default_multi_thread_streams: 16,
        default_multi_thread_cutoff: 10,
        sftp_chunk_size: 255,
        sftp_concurrency: 64
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [detectedTimezone, setDetectedTimezone] = useState<string>("")

    useEffect(() => {
        // Detect browser timezone
        setDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    }, [])

    // Backup/Restore state
    const [backupPassword, setBackupPassword] = useState("")
    const [restorePassword, setRestorePassword] = useState("")
    const [backupLoading, setBackupLoading] = useState(false)
    const [restoreLoading, setRestoreLoading] = useState(false)
    const [restoreFile, setRestoreFile] = useState<File | null>(null)
    const [isRestartDialogOpen, setIsRestartDialogOpen] = useState(false)
    const [isRestarting, setIsRestarting] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    async function loadSettings() {
        try {
            setLoading(true)
            const data = await api.getSystemSettings()
            setSettings(data)
            // Cache timezone for use by dateUtils
            if (data.timezone) {
                setConfiguredTimezone(data.timezone)
            }
        } catch (e) {
            console.error("Failed to load settings:", e)
            toast.error("Failed to load system settings")
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        try {
            setSaving(true)
            const updated = await api.updateSystemSettings(settings)
            setSettings(updated)
            // Cache timezone for use by dateUtils
            if (updated.timezone) {
                setConfiguredTimezone(updated.timezone)
            }
            toast.success("System settings saved")
        } catch (e) {
            console.error("Failed to save settings:", e)
            toast.error("Failed to save system settings")
        } finally {
            setSaving(false)
        }
    }

    async function handleBackup() {
        if (!backupPassword) {
            toast.error("Please enter a password for encryption")
            return
        }
        try {
            setBackupLoading(true)
            const response = await api.backupSystem(backupPassword)
            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.detail || "Backup failed")
            }
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `grabarr_backup_${new Date().toISOString().split('T')[0]}.tar.gz.enc`
            a.click()
            URL.revokeObjectURL(url)
            toast.success("Backup downloaded successfully")
            setBackupPassword("")
        } catch (e: any) {
            console.error("Backup failed:", e)
            toast.error(e.message || "Backup failed")
        } finally {
            setBackupLoading(false)
        }
    }

    async function handleRestore() {
        if (!restoreFile || !restorePassword) {
            toast.error("Please select a backup file and enter the password")
            return
        }
        try {
            setRestoreLoading(true)
            const formData = new FormData()
            formData.append("file", restoreFile)
            formData.append("password", restorePassword)
            const response = await api.restoreSystem(formData)
            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.detail || "Restore failed")
            }
            toast.success("Restore successful! Please restart the backend.")
            setRestorePassword("")
            setRestoreFile(null)
        } catch (e: any) {
            console.error("Restore failed:", e)
            toast.error(e.message || "Restore failed")
        } finally {
            setRestoreLoading(false)
        }
    }

    async function handleRestart() {
        try {
            setIsRestarting(true)
            await api.restartSystem()
            toast.success("Restart signal sent. grabarr will be back online shortly.")
            setIsRestartDialogOpen(false)
            // Optionally redirect after some time? For now just wait.
        } catch (e: any) {
            console.error("Restart failed:", e)
            toast.error(e.message || "Failed to initiate restart")
        } finally {
            setIsRestarting(false)
        }
    }

    function handleResetToOptimized() {
        setSettings({
            ...settings,
            default_transfers: 16,
            default_checkers: 32,
            default_buffer_size: 128,
            default_multi_thread_streams: 16,
            default_multi_thread_cutoff: 10,
            sftp_chunk_size: 255,
            sftp_concurrency: 64
        })
        toast.info("Settings reset to optimized values. Click 'Save' to apply.")
    }

    if (loading) {
        return (
            <div className="p-6 text-white">
                <div className="flex items-center gap-2 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading settings...
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 text-white min-h-screen">
            <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-white">System Settings</h2>
                <p className="text-zinc-400 text-sm mt-1">Configure global application behavior, backup and restore.</p>
            </div>

            <div className="grid gap-6 max-w-3xl">
                {/* Job Execution Settings */}
                <Card className="bg-card border-border/50">
                    <CardHeader>
                        <CardTitle className="text-white">Job Execution</CardTitle>
                        <CardDescription>Configure how jobs are executed and retried.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="cooldown" className="text-zinc-400 text-xs mb-1 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Failure Cooldown (seconds)
                                </Label>
                                <Input
                                    id="cooldown"
                                    type="number"
                                    min={0}
                                    max={3600}
                                    value={settings.failure_cooldown_seconds}
                                    onChange={(e) => setSettings({ ...settings, failure_cooldown_seconds: parseInt(e.target.value) || 0 })}
                                    className="bg-zinc-900/50 border-zinc-700 text-white"
                                />
                                <p className="text-xs text-zinc-500 mt-1">Prevents rapid retries of failed jobs</p>
                            </div>
                            <div>
                                <Label htmlFor="maxHistory" className="text-zinc-400 text-xs mb-1 flex items-center gap-1">
                                    <Database className="w-3 h-3" />
                                    Max History Entries
                                </Label>
                                <Input
                                    id="maxHistory"
                                    type="number"
                                    min={10}
                                    max={10000}
                                    value={settings.max_history_entries}
                                    onChange={(e) => setSettings({ ...settings, max_history_entries: parseInt(e.target.value) || 50 })}
                                    className="bg-zinc-900/50 border-zinc-700 text-white"
                                />
                                <p className="text-xs text-zinc-500 mt-1">Auto-prune old activity entries</p>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-primary hover:bg-primary/90 text-white"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Settings
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                {/* Transfer Performance Settings */}
                <Card className="bg-card border-primary/20 shadow-lg shadow-primary/5">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-white">Transfer Performance</CardTitle>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleResetToOptimized}
                                className="text-xs h-8 border-primary/20 hover:bg-primary/10 text-primary"
                            >
                                <RefreshCw className="w-3 h-3 mr-1.5" />
                                Reset to Optimized
                            </Button>
                        </div>
                        <CardDescription>Configure rclone transfer parallelism and buffer settings for maximum speed.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                            {/* Parallel Transfers */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="transfers" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                        Parallel Transfers
                                    </Label>
                                    <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.default_transfers || 16}</span>
                                </div>
                                <Input
                                    id="transfers"
                                    type="range"
                                    min={1}
                                    max={32}
                                    step={1}
                                    value={settings.default_transfers || 16}
                                    onChange={(e) => setSettings({ ...settings, default_transfers: parseInt(e.target.value) })}
                                    className="h-6 accent-primary"
                                />
                                <p className="text-[10px] text-zinc-500">Number of files to transfer simultaneously</p>
                            </div>

                            {/* Parallel Checkers */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="checkers" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                        Parallel Checkers
                                    </Label>
                                    <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.default_checkers || 32}</span>
                                </div>
                                <Input
                                    id="checkers"
                                    type="range"
                                    min={1}
                                    max={64}
                                    step={1}
                                    value={settings.default_checkers || 32}
                                    onChange={(e) => setSettings({ ...settings, default_checkers: parseInt(e.target.value) })}
                                    className="h-6 accent-primary"
                                />
                                <p className="text-[10px] text-zinc-500">Number of parallel checksum/mtime checks</p>
                            </div>

                            {/* Buffer Size */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="buffer" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                        Buffer Size (MB)
                                    </Label>
                                    <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.default_buffer_size || 128} MB</span>
                                </div>
                                <Input
                                    id="buffer"
                                    type="number"
                                    min={16}
                                    max={1024}
                                    value={settings.default_buffer_size || 128}
                                    onChange={(e) => setSettings({ ...settings, default_buffer_size: parseInt(e.target.value) || 16 })}
                                    className="bg-zinc-900/50 border-zinc-700 text-white h-9"
                                />
                                <p className="text-[10px] text-zinc-500">In-memory buffer per file transfer</p>
                            </div>

                            {/* Multi-Thread Streams */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="streams" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                        Multi-Thread Streams
                                    </Label>
                                    <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.default_multi_thread_streams || 16}</span>
                                </div>
                                <Input
                                    id="streams"
                                    type="range"
                                    min={1}
                                    max={32}
                                    step={1}
                                    value={settings.default_multi_thread_streams || 16}
                                    onChange={(e) => setSettings({ ...settings, default_multi_thread_streams: parseInt(e.target.value) })}
                                    className="h-6 accent-primary"
                                />
                                <p className="text-[10px] text-zinc-500">Parallel streams per large file</p>
                            </div>

                            {/* Multi-Thread Cutoff */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="cutoff" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                        Multi-Thread Cutoff (MB)
                                    </Label>
                                    <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.default_multi_thread_cutoff || 10} MB</span>
                                </div>
                                <Input
                                    id="cutoff"
                                    type="number"
                                    min={1}
                                    max={2048}
                                    value={settings.default_multi_thread_cutoff || 10}
                                    onChange={(e) => setSettings({ ...settings, default_multi_thread_cutoff: parseInt(e.target.value) || 1 })}
                                    className="bg-zinc-900/50 border-zinc-700 text-white h-9"
                                />
                                <p className="text-[10px] text-zinc-500">Files larger than this will use multi-threaded transfers</p>
                            </div>
                        </div>

                        {/* SFTP-Specific Settings */}
                        <div className="border-t border-border/30 pt-4">
                            <h4 className="text-sm font-medium text-white mb-4">SFTP Protocol Settings</h4>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {/* SFTP Chunk Size */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="sftpChunk" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                            Chunk Size (KB)
                                        </Label>
                                        <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.sftp_chunk_size || 255} KB</span>
                                    </div>
                                    <Input
                                        id="sftpChunk"
                                        type="range"
                                        min={32}
                                        max={255}
                                        step={1}
                                        value={settings.sftp_chunk_size || 255}
                                        onChange={(e) => setSettings({ ...settings, sftp_chunk_size: parseInt(e.target.value) })}
                                        className="h-6 accent-primary"
                                    />
                                    <p className="text-[10px] text-zinc-500">SFTP packet payload size (max 255KB for OpenSSH)</p>
                                </div>

                                {/* SFTP Concurrency */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="sftpConcurrency" className="text-zinc-400 text-xs flex items-center gap-1.5">
                                            Concurrency
                                        </Label>
                                        <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{settings.sftp_concurrency || 64}</span>
                                    </div>
                                    <Input
                                        id="sftpConcurrency"
                                        type="range"
                                        min={1}
                                        max={128}
                                        step={1}
                                        value={settings.sftp_concurrency || 64}
                                        onChange={(e) => setSettings({ ...settings, sftp_concurrency: parseInt(e.target.value) })}
                                        className="h-6 accent-primary"
                                    />
                                    <p className="text-[10px] text-zinc-500">Outstanding requests per file for SFTP</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-border/30">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Performance Settings
                            </Button>
                        </div>
                    </CardContent>
                </Card>


                {/* Timezone Settings */}
                <Card className="bg-card border-border/50">
                    <CardHeader>
                        <CardTitle className="text-white">Display Timezone</CardTitle>
                        <CardDescription>Configure how dates and times are displayed throughout the app.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="timezone" className="text-zinc-400 text-xs mb-1 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                Timezone
                            </Label>
                            <Select
                                value={settings.timezone || "America/New_York"}
                                onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                            >
                                <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white w-full">
                                    <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-80">
                                    {TIMEZONE_REGIONS.map(region => (
                                        <div key={region}>
                                            <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{region}</div>
                                            {ALL_TIMEZONES.filter(tz => tz.region === region).map((tz) => (
                                                <SelectItem key={tz.value} value={tz.value} className="text-white">
                                                    {tz.label}
                                                </SelectItem>
                                            ))}
                                        </div>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-zinc-500 mt-1">
                                All dates will be displayed in this timezone
                            </p>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-primary hover:bg-primary/90 text-white"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Settings
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Backup/Restore */}
                <Card className="bg-card border-border/50">
                    <CardHeader>
                        <CardTitle className="text-white">Backup & Restore</CardTitle>
                        <CardDescription>Create encrypted backups or restore from a previous backup.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Backup */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <Download className="w-4 h-4 text-primary" />
                                Create Backup
                            </h4>
                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <Label htmlFor="backupPwd" className="text-zinc-400 text-xs mb-1 block">Encryption Password</Label>
                                    <Input
                                        id="backupPwd"
                                        type="password"
                                        value={backupPassword}
                                        onChange={(e) => setBackupPassword(e.target.value)}
                                        placeholder="Enter password"
                                        className="bg-zinc-900/50 border-zinc-700 text-white"
                                    />
                                </div>
                                <Button
                                    onClick={handleBackup}
                                    disabled={backupLoading || !backupPassword}
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    {backupLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                    Download
                                </Button>
                            </div>
                        </div>

                        <div className="border-t border-border/50" />

                        {/* Restore */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <Upload className="w-4 h-4 text-orange-400" />
                                Restore from Backup
                            </h4>
                            <div>
                                <Label htmlFor="restoreFile" className="text-zinc-400 text-xs mb-1 block">Backup File</Label>
                                <Input
                                    id="restoreFile"
                                    type="file"
                                    accept=".enc,.tar.gz.enc"
                                    onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                                    className="bg-zinc-900/50 border-zinc-700 text-white file:bg-zinc-800 file:text-white file:border-0 file:mr-3"
                                />
                            </div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <Label htmlFor="restorePwd" className="text-zinc-400 text-xs mb-1 block">Decryption Password</Label>
                                    <Input
                                        id="restorePwd"
                                        type="password"
                                        value={restorePassword}
                                        onChange={(e) => setRestorePassword(e.target.value)}
                                        placeholder="Enter password"
                                        className="bg-zinc-900/50 border-zinc-700 text-white"
                                    />
                                </div>
                                <Button
                                    onClick={handleRestore}
                                    disabled={restoreLoading || !restoreFile || !restorePassword}
                                    variant="destructive"
                                >
                                    {restoreLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                    Restore
                                </Button>
                            </div>
                            <p className="text-xs text-zinc-500">⚠️ This will overwrite existing data. Restart required after restore.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* System Management */}
                <Card className="bg-card border-red-500/20">
                    <CardHeader>
                        <CardTitle className="text-white">Reload grabarr</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <div className="space-y-1">
                                <h4 className="text-sm font-medium text-white">Restart grabarr</h4>
                                <p className="text-xs text-zinc-400">Restarts both backend and frontend services.</p>
                            </div>
                            <Dialog open={isRestartDialogOpen} onOpenChange={setIsRestartDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="destructive" className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30">
                                        <Power className="w-4 h-4 mr-2" />
                                        Restart
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <AlertTriangle className="w-5 h-5 text-red-500" />
                                            Confirm System Restart
                                        </DialogTitle>
                                        <DialogDescription className="text-zinc-400">
                                            Are you sure you want to restart grabarr? This will terminate all active transfers and the UI will be temporarily unavailable.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter className="gap-2 sm:gap-0">
                                        <Button variant="ghost" onClick={() => setIsRestartDialogOpen(false)} disabled={isRestarting}>
                                            Cancel
                                        </Button>
                                        <Button variant="destructive" onClick={handleRestart} disabled={isRestarting}>
                                            {isRestarting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
                                            Restart Now
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
