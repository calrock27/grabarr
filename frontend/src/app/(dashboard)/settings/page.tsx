import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Key, Server, Calendar, Shield, HardDrive, Target, BookOpen } from "lucide-react"

export default function SettingsPage() {
    return (
        <div className="p-8 space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-white">Settings</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            </div>
        </div>
    )
}

