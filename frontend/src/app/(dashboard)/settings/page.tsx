"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, HardDrive, BookOpen, FileText, Info } from "lucide-react"

export default function SettingsPage() {
    // Format the build timestamp for display
    const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME
    const version = process.env.NEXT_PUBLIC_VERSION || '0.1.0'

    const formatBuildTime = (isoString: string | undefined) => {
        if (!isoString) return 'Unknown'
        try {
            const date = new Date(isoString)
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })
        } catch {
            return isoString
        }
    }

    return (
        <div className="p-8 space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-white">Settings</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link href="/settings/system">
                    <Card className="bg-card border-gray-800 text-card-foreground hover:bg-zinc-800 transition cursor-pointer h-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <HardDrive className="h-5 w-5 text-gray-400" />
                                System
                            </CardTitle>
                            <CardDescription>Backup, restore, and system maintenance.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/settings/security">
                    <Card className="bg-card border-gray-800 text-card-foreground hover:bg-zinc-800 transition cursor-pointer h-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-blue-500" />
                                Security
                            </CardTitle>
                            <CardDescription>Manage API keys and access control.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/settings/api-docs">
                    <Card className="bg-card border-gray-800 text-card-foreground hover:bg-zinc-800 transition cursor-pointer h-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-purple-500" />
                                API Reference
                            </CardTitle>
                            <CardDescription>Interactive API documentation and command builder.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/logs">
                    <Card className="bg-card border-gray-800 text-card-foreground hover:bg-zinc-800 transition cursor-pointer h-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Logs
                            </CardTitle>
                            <CardDescription>View system activity and debug logs.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>
            </div>

            {/* Version Info */}
            <Card className="bg-card border-gray-800 text-card-foreground">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        Version Info
                    </CardTitle>
                    <CardDescription>Current build information for debugging and verification.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between py-2 border-b border-gray-800">
                            <span className="text-muted-foreground">Version</span>
                            <span className="font-mono text-primary">{version}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-800">
                            <span className="text-muted-foreground">Build Time</span>
                            <span className="font-mono text-primary">{formatBuildTime(buildTime)}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <span className="text-muted-foreground">Environment</span>
                            <span className="font-mono text-primary">{process.env.NODE_ENV || 'development'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

