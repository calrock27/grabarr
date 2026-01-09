"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

const API_BASE = "/api"

export default function LoginPage() {
    const router = useRouter()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [checkingSetup, setCheckingSetup] = useState(true)

    // Check if setup is complete - redirect to /setup if no admin exists
    useEffect(() => {
        const checkSetupStatus = async () => {
            try {
                const res = await fetch(`${API_BASE}/auth/status`, {
                    credentials: "include"
                })
                const data = await res.json()

                if (!data.setup_complete) {
                    router.push("/setup")
                    return
                }
            } catch (err) {
                // If we can't check status, show login anyway
                console.error("Failed to check setup status:", err)
            } finally {
                setCheckingSetup(false)
            }
        }

        checkSetupStatus()
    }, [router])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username, password })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.detail || "Login failed")
                return
            }

            toast.success("Login successful!")
            router.push("/jobs")
        } catch (err) {
            setError("Failed to connect to server")
        } finally {
            setLoading(false)
        }
    }

    // Show loading state while checking setup status
    if (checkingSetup) {
        return (
            <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
            <Card className="w-full max-w-sm bg-[#0F0F0F] border-none overflow-hidden shadow-2xl">
                <CardContent className="p-8">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-16 h-16 relative">
                                <Image
                                    src="/logo.svg"
                                    alt="Grabarr Logo"
                                    fill
                                    className="object-contain"
                                    priority
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    className="bg-[#2A2A2A] border-zinc-700 text-zinc-200 h-12"
                                    autoComplete="username"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="bg-[#2A2A2A] border-zinc-700 text-zinc-200 h-12"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="remember"
                                    className="border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Label
                                    htmlFor="remember"
                                    className="text-zinc-300 text-sm font-normal cursor-pointer"
                                >
                                    Remember Me
                                </Label>
                            </div>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="text-zinc-500 text-sm hover:text-zinc-400 transition-colors"
                                        >
                                            Forgot your password?
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-[#404040] text-zinc-100 border-zinc-700 p-3">
                                        <p className="text-xs mb-1">Run this command in your shell to reset:</p>
                                        <code className="text-primary-foreground bg-primary/20 px-1 py-0.5 rounded">
                                            python3 -m app.cli reset-password
                                        </code>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/90 text-white font-medium h-12 text-base"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Login"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
