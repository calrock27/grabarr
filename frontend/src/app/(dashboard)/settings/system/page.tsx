"use client"

import { useEffect, useState } from "react"
import { api, type SystemSettings } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Save, Clock, Database, RefreshCw, Download, Upload, Shield, Globe } from "lucide-react"
import { setConfiguredTimezone } from "@/lib/dateUtils"
import { ALL_TIMEZONES, TIMEZONE_REGIONS } from "@/lib/timezones"

export default function SystemSettingsPage() {
    const [settings, setSettings] = useState<SystemSettings>({
        failure_cooldown_seconds: 60,
        max_history_entries: 50,
        timezone: "America/New_York"
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
            </div>
        </div>
    )
}
