"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [authenticated, setAuthenticated] = useState(false)

    useEffect(() => {
        const checkAuth = async () => {
            try {
                // First check if setup is complete
                const status = await api.checkAuthStatus()

                if (!status.setup_complete) {
                    router.push("/setup")
                    return
                }

                // Then check if user is authenticated
                await api.getMe()
                setAuthenticated(true)
            } catch (error) {
                // Not authenticated - will be redirected by fetchAPI 401 handler
                router.push("/login")
            } finally {
                setLoading(false)
            }
        }

        checkAuth()
    }, [router])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-zinc-500 text-sm">Loading...</span>
                </div>
            </div>
        )
    }

    if (!authenticated) {
        return null
    }

    return (
        <div className="flex h-full text-white">
            <div className="hidden md:flex w-72 flex-col fixed inset-y-0 z-50">
                <Sidebar />
            </div>
            <main className="flex-1 md:pl-72 h-full overflow-y-auto bg-background">
                {children}
            </main>
        </div>
    );
}
