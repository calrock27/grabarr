"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { api, type Job } from "@/lib/api"
import { Progress } from "@/components/ui/progress"
import { ArrowRight, Activity, Clock } from "lucide-react"

export default function EmbedJobPage() {
    const params = useParams()
    const id = parseInt(params.id as string)

    const [job, setJob] = useState<Job | null>(null)
    const [stats, setStats] = useState<any>(null)
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        api.getJob(id).then(setJob).catch(console.error)

        const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"}/events`)

        eventSource.onopen = () => setConnected(true)
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === "progress" && data.payload.job_id === id) {
                setStats(data.payload)
            }
            if (data.type === "job_update" && data.payload.job_id === id) {
                if (data.payload.status === "finished") {
                    setStats(null) // Reset or keep last?
                    // Maybe show "Finished"
                }
            }
        }
        eventSource.onerror = () => setConnected(false)

        return () => eventSource.close()
    }, [id])

    if (!job) return <div className="p-4 text-zinc-400 text-sm">Loading job...</div>

    const isRunning = !!stats
    const percentage = stats ? (stats.transfers / (stats.transfers + 1)) * 100 : 0 // Rough estimate if total unknown
    // Actually stats has: bytes, speed, transfers.
    // Rclone core/stats doesn't always give total. We'll use 0 or indefinite if needed.
    // But for UI, let's just show Speed and Bytes.

    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
            <div className="bg-[#111827] border border-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-medium text-white truncate pr-2">{job.name}</h3>
                    <div className={`h-2 w-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-gray-600"}`} />
                </div>

                <div className="p-4 space-y-4">
                    <div className="flex items-center text-sm text-gray-400 justify-between">
                        <span className="flex items-center gap-1">{job.operation.toUpperCase()}</span>
                        {isRunning && (() => {
                            // Get current speed from active transfers (more accurate than overall average)
                            let currentSpeed = 0
                            if (stats?.transferring && Array.isArray(stats.transferring) && stats.transferring.length > 0) {
                                currentSpeed = stats.transferring.reduce((sum: number, t: any) => sum + (t.speedAvg || t.speed || 0), 0)
                            } else if (stats?.speed) {
                                currentSpeed = stats.speed
                            }
                            return currentSpeed > 0 ? (
                                <span className="text-emerald-400 font-mono">
                                    {(currentSpeed / 1024 / 1024).toFixed(1)} MB/s
                                </span>
                            ) : null
                        })()}
                    </div>

                    {isRunning ? (
                        <div className="space-y-2">
                            <Progress value={0} className="h-2 bg-gray-800 [&>div]:bg-emerald-500" />
                            <div className="flex justify-between text-xs text-gray-500 font-mono">
                                <span>{(stats.bytes / 1024 / 1024).toFixed(1)} MB</span>
                                <span>{stats.transfers} files</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-2 text-sm text-gray-500 flex flex-col items-center">
                            <Clock className="w-8 h-8 mb-2 opacity-20" />
                            <span>Idle / Waiting</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
