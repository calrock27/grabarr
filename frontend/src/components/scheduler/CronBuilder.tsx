
"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CronBuilderProps {
    value: string
    onChange: (value: string) => void
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
    const [tab, setTab] = useState("minutes")

    // Internal state for builder parts
    const [interval, setInterval] = useState("15")
    const [atMinute, setAtMinute] = useState("0")
    const [atHour, setAtHour] = useState("0")
    const [weekDays, setWeekDays] = useState<string[]>([])

    // Parse initial value to set tab (rough approximation)
    useEffect(() => {
        if (!value || value === "* * * * *") return

        const parts = value.split(" ")
        if (parts.length !== 5) {
            setTab("custom")
            return
        }

        const [m, h, dom, mon, dow] = parts

        // Detect "Every X minutes" pattern: "*/15 * * * *"
        if (m.startsWith("*/") && h === "*" && dom === "*" && mon === "*" && dow === "*") {
            setTab("minutes")
            setInterval(m.replace("*/", ""))
            return
        }

        // Detect "Every Hour at X" pattern: "15 * * * *"
        if (!m.includes("*") && !m.includes("/") && h === "*" && dom === "*" && mon === "*" && dow === "*") {
            setTab("hourly")
            setAtMinute(m)
            return
        }

        // Detect "Every Day at X:Y" pattern: "15 04 * * *"
        if (!m.includes("*") && !h.includes("*") && dom === "*" && mon === "*" && dow === "*") {
            setTab("daily")
            setAtMinute(m)
            setAtHour(h)
            return
        }

        // Detect "Weekly" pattern: "0 0 * * 1,3,5"
        if (!dow.includes("*")) {
            setTab("weekly")
            setAtMinute(m)
            setAtHour(h)
            setWeekDays(dow.split(","))
            return
        }

        setTab("custom")
    }, [value])


    const update = (mode: string, params: any) => {
        let newVal = "* * * * *"
        switch (mode) {
            case "minutes":
                newVal = `*/${params.interval} * * * *`
                break
            case "hourly":
                newVal = `${params.minute} * * * *`
                break
            case "daily":
                newVal = `${params.minute} ${params.hour} * * *`
                break
            case "weekly":
                newVal = `${params.minute} ${params.hour} * * ${params.days.length ? params.days.join(",") : "*"}`
                break
            case "custom":
                newVal = params.value
                break
        }
        onChange(newVal)
    }

    const toggleDay = (day: string) => {
        let newDays = [...weekDays]
        if (newDays.includes(day)) newDays = newDays.filter(d => d !== day)
        else newDays.push(day)
        setWeekDays(newDays)
        update("weekly", { minute: atMinute, hour: atHour, days: newDays })
    }

    const DAYS = [
        { id: "0", label: "Sun" },
        { id: "1", label: "Mon" },
        { id: "2", label: "Tue" },
        { id: "3", label: "Wed" },
        { id: "4", label: "Thu" },
        { id: "5", label: "Fri" },
        { id: "6", label: "Sat" },
    ]

    const handleTabChange = (newTab: string) => {
        setTab(newTab)
        switch (newTab) {
            case "minutes":
                update("minutes", { interval })
                break
            case "hourly":
                update("hourly", { minute: atMinute })
                break
            case "daily":
                update("daily", { hour: atHour, minute: atMinute })
                break
            case "weekly":
                update("weekly", { hour: atHour, minute: atMinute, days: weekDays })
                break
            case "custom":
                // Keep current value when switching to custom
                update("custom", { value })
                break
        }
    }

    return (
        <div className="space-y-4">
            <Tabs value={tab} onValueChange={handleTabChange}>
                <TabsList className="grid grid-cols-5 w-full bg-muted/50">
                    <TabsTrigger value="minutes">Minutes</TabsTrigger>
                    <TabsTrigger value="hourly">Hourly</TabsTrigger>
                    <TabsTrigger value="daily">Daily</TabsTrigger>
                    <TabsTrigger value="weekly">Weekly</TabsTrigger>
                    <TabsTrigger value="custom">Custom</TabsTrigger>
                </TabsList>

                <div className="p-4 border border-border rounded-md mt-2 bg-muted/20">

                    <TabsContent value="minutes" className="space-y-4 mt-0">
                        <div className="flex items-center gap-2">
                            <Label>Run every</Label>
                            <Input
                                type="number"
                                className="w-20 bg-muted/50 border-input"
                                value={interval}
                                onChange={e => {
                                    setInterval(e.target.value)
                                    update("minutes", { interval: e.target.value })
                                }}
                            />
                            <Label>minutes</Label>
                        </div>
                        <div className="text-muted-foreground text-sm">
                            Next run: {new Date(Date.now() + parseInt(interval || "0") * 60000).toLocaleTimeString()}
                        </div>
                    </TabsContent>

                    <TabsContent value="hourly" className="space-y-4 mt-0">
                        <div className="flex items-center gap-2">
                            <Label>Run at minute</Label>
                            <Input
                                type="number"
                                min="0" max="59"
                                className="w-20 bg-muted/50 border-input"
                                value={atMinute}
                                onChange={e => {
                                    setAtMinute(e.target.value)
                                    update("hourly", { minute: e.target.value })
                                }}
                            />
                            <Label>past the hour</Label>
                        </div>
                    </TabsContent>

                    <TabsContent value="daily" className="space-y-4 mt-0">
                        <div className="flex items-center gap-2">
                            <Label>Run at time</Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="number" min="0" max="23" placeholder="HH"
                                    className="w-16 bg-muted/50 border-input"
                                    value={atHour}
                                    onChange={e => {
                                        setAtHour(e.target.value)
                                        update("daily", { hour: e.target.value, minute: atMinute })
                                    }}
                                />
                                <span>:</span>
                                <Input
                                    type="number" min="0" max="59" placeholder="MM"
                                    className="w-16 bg-muted/50 border-input"
                                    value={atMinute}
                                    onChange={e => {
                                        setAtMinute(e.target.value)
                                        update("daily", { hour: atHour, minute: e.target.value })
                                    }}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="weekly" className="space-y-4 mt-0">
                        <div className="flex gap-2 flex-wrap">
                            {DAYS.map(day => (
                                <div key={day.id} className="flex items-center space-x-2 border border-border p-2 rounded bg-card">
                                    <Checkbox id={`day-${day.id}`} checked={weekDays.includes(day.id)} onCheckedChange={() => toggleDay(day.id)} />
                                    <Label htmlFor={`day-${day.id}`}>{day.label}</Label>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                            <Label>At time</Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="number" min="0" max="23"
                                    className="w-16 bg-muted/50 border-input"
                                    value={atHour}
                                    onChange={e => {
                                        setAtHour(e.target.value)
                                        update("weekly", { hour: e.target.value, minute: atMinute, days: weekDays })
                                    }}
                                />
                                <span>:</span>
                                <Input
                                    type="number" min="0" max="59"
                                    className="w-16 bg-muted/50 border-input"
                                    value={atMinute}
                                    onChange={e => {
                                        setAtMinute(e.target.value)
                                        update("weekly", { hour: atHour, minute: e.target.value, days: weekDays })
                                    }}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="custom" className="space-y-4 mt-0">
                        <div className="space-y-2">
                            <Label>Cron Expression</Label>
                            <Input
                                className="bg-muted/50 border-input font-mono"
                                value={value}
                                onChange={e => {
                                    onChange(e.target.value)
                                }}
                            />
                            <p className="text-xs text-muted-foreground">Standard 5-part cron syntax.</p>
                        </div>
                    </TabsContent>

                </div>
            </Tabs>

            <div className="p-2 text-center">
                <code className="bg-muted px-2 py-1 rounded text-sm text-emerald-400">{value}</code>
            </div>
        </div>
    )
}
