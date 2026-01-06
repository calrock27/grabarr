"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Layers, Activity, Settings, HardDrive, Target, Calendar, Key, LogOut, Zap, LayoutGrid } from "lucide-react"
import { api } from "@/lib/api"
import Image from "next/image"
import { toast } from "sonner"

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()

    const handleLogout = async () => {
        try {
            await api.logout()
            toast.success("Logged out successfully")
            router.push("/login")
        } catch (error) {
            toast.error("Logout failed")
        }
    }

    const routes = [
        {
            label: "Jobs",
            icon: Layers,
            href: "/jobs",
        },
        {
            label: "Activity",
            icon: Activity,
            href: "/activity",
        },
        {
            label: "Targets",
            icon: Target,
            href: "/targets",
        },
        {
            label: "Actions",
            icon: Zap,
            href: "/actions",
        },
        {
            label: "Schedules",
            icon: Calendar,
            href: "/schedules",
        },
        {
            label: "Credentials",
            icon: Key,
            href: "/credentials",
        },
        {
            label: "Widgets",
            icon: LayoutGrid,
            href: "/widgets",
        },
    ]


    const isSettingsActive = pathname.startsWith("/settings") || pathname.startsWith("/logs")

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-sidebar text-sidebar-foreground">
            <div className="px-3 py-2 flex-1">
                <Link href="/jobs" className="flex items-center pl-3 mb-14">
                    <div className="relative w-16 h-16 mr-4">
                        <Image
                            src="/logo.svg"
                            alt="Logo"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-bold">
                        grabarr
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            href={route.href}
                            key={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer transition-all duration-200 border-l-[3px]",
                                pathname === route.href
                                    ? "text-primary border-primary bg-white/5"
                                    : "text-zinc-400 border-transparent hover:text-primary hover:border-transparent"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3 transition-colors",
                                    pathname === route.href ? "text-primary" : "text-zinc-400 group-hover:text-primary"
                                )} />
                                {route.label}
                            </div>
                        </Link>
                    ))}

                    {/* Settings Group */}
                    <div className={cn(
                        "transition-all duration-200 border-l-[3px]",
                        isSettingsActive
                            ? "border-primary"
                            : "border-transparent"
                    )}>
                        {/* Parent Settings Item */}
                        <Link
                            href="/settings"
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer transition-all duration-200",
                                isSettingsActive
                                    ? "text-primary bg-white/5"
                                    : "text-zinc-400 hover:text-primary"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <Settings className={cn("h-5 w-5 mr-3 transition-colors",
                                    isSettingsActive ? "text-primary" : "text-zinc-400 group-hover:text-primary"
                                )} />
                                Settings
                            </div>
                        </Link>

                        {/* Expandable Children */}
                        {isSettingsActive && (
                            <div className="bg-white/5 pb-2">
                                <Link
                                    href="/settings/system"
                                    className={cn(
                                        "group flex items-center pl-11 pr-2 py-2 text-sm font-medium hover:text-white",
                                        pathname === "/settings/system" ? "text-primary" : "text-zinc-400"
                                    )}
                                >
                                    System
                                </Link>
                                <Link
                                    href="/settings/security"
                                    className={cn(
                                        "group flex items-center pl-11 pr-2 py-2 text-sm font-medium hover:text-white",
                                        pathname === "/settings/security" ? "text-primary" : "text-zinc-400"
                                    )}
                                >
                                    Security
                                </Link>
                                <Link
                                    href="/settings/api-docs"
                                    className={cn(
                                        "group flex items-center pl-11 pr-2 py-2 text-sm font-medium hover:text-white",
                                        pathname === "/settings/api-docs" ? "text-primary" : "text-zinc-400"
                                    )}
                                >
                                    API Reference
                                </Link>
                                <Link
                                    href="/logs"
                                    className={cn(
                                        "group flex items-center pl-11 pr-2 py-2 text-sm font-medium hover:text-white",
                                        pathname === "/logs" ? "text-primary" : "text-zinc-400"
                                    )}
                                >
                                    Logs
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Logout Button */}
            <div className="px-3 py-4 border-t border-zinc-800">
                <Button
                    variant="ghost"
                    className="w-full justify-start text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                    onClick={handleLogout}
                >
                    <LogOut className="w-5 h-5 mr-3" />
                    Logout
                </Button>
            </div>
        </div >
    )
}
