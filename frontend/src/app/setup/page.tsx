"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, UserPlus, AlertCircle, CheckCircle2, Globe, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { ALL_TIMEZONES, TIMEZONE_REGIONS } from "@/lib/timezones"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"

export default function SetupPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [username, setUsername] = useState("admin")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [timezone, setTimezone] = useState("America/New_York")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleAccountCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        if (password.length < 8) {
            setError("Password must be at least 8 characters")
            setLoading(false)
            return
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            setLoading(false)
            return
        }

        try {
            const res = await fetch(`${API_BASE}/auth/setup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username, password })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.detail || "Setup failed")
                return
            }

            toast.success("Admin account created!")
            setStep(2) // Move to timezone step
        } catch (err) {
            setError("Failed to connect to server")
        } finally {
            setLoading(false)
        }
    }

    const handleTimezoneSet = async () => {
        setLoading(true)
        setError("")

        try {
            const res = await fetch(`${API_BASE}/system/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ timezone })
            })

            if (!res.ok) {
                // Non-critical, proceed anyway
                console.warn("Failed to save timezone")
            }

            toast.success("Setup complete!")
            router.push("/login")
        } catch (err) {
            // Non-critical, proceed to login anyway
            console.warn("Failed to save timezone:", err)
            router.push("/login")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-card border-zinc-800">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-6 w-32 h-32 relative">
                        <Image
                            src="/logo.svg"
                            alt="Grabarr Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <CardTitle className="text-2xl">Welcome to grabarr</CardTitle>
                    <CardDescription>
                        {step === 1 ? "Create your admin account to get started" : "Set your timezone for consistent scheduling"}
                    </CardDescription>
                    {/* Step indicator */}
                    <div className="flex justify-center gap-2 mt-4">
                        <div className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-zinc-700'}`} />
                        <div className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-zinc-700'}`} />
                    </div>
                </CardHeader>
                <CardContent>
                    {step === 1 ? (
                        <form onSubmit={handleAccountCreate} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="username">Username</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder=""
                                    className="bg-zinc-900 border-zinc-700"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    className="bg-zinc-900 border-zinc-700"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password"
                                    className="bg-zinc-900 border-zinc-700"
                                    required
                                />
                                {password && confirmPassword && password === confirmPassword && (
                                    <div className="flex items-center gap-1 text-xs text-green-500">
                                        <CheckCircle2 className="w-3 h-3" /> Passwords match
                                    </div>
                                )}
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary/90"
                                disabled={loading || password !== confirmPassword}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Creating account...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-4 h-4 mr-2" />
                                        Create Admin Account
                                    </>
                                )}
                            </Button>
                        </form>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Globe className="w-4 h-4" />
                                    Select Timezone
                                </Label>
                                <Select value={timezone} onValueChange={setTimezone}>
                                    <SelectTrigger className="bg-zinc-900 border-zinc-700">
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
                                <p className="text-xs text-zinc-500">
                                    This timezone will be used for scheduling jobs and displaying times.
                                </p>
                            </div>

                            <Button
                                onClick={handleTimezoneSet}
                                className="w-full bg-primary hover:bg-primary/90"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Finishing setup...
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight className="w-4 h-4 mr-2" />
                                        Complete Setup
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
