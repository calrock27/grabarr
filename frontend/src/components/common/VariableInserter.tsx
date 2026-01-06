"use client"

import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Braces, Copy, Plus } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const VARIABLES = [
    { name: "job.id", desc: "Job ID" },
    { name: "job.name", desc: "Job Name" },
    { name: "source.name", desc: "Source Name" },
    { name: "dest.name", desc: "Destination Name" },
    { name: "stats.status", desc: "Status (success/failed)" },
    { name: "stats.error", desc: "Error Message (if failed)" },
    { name: "stats.transferred_files", desc: "Number of files transferred" },
    { name: "stats.total_bytes", desc: "Total bytes transferred" },
    { name: "stats.speed", desc: "Average transfer speed" },
    { name: "stats.duration", desc: "Duration in seconds" },
]

interface VariableInserterProps {
    onInsert: (variable: string) => void
    className?: string
}

export function VariableInserter({ onInsert, className }: VariableInserterProps) {
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1", className)}>
                    <Braces className="h-3 w-3" />
                    Insert Variable
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[300px] bg-card border-border text-foreground" align="start">
                <Command className="bg-transparent">
                    <CommandInput placeholder="Search variables..." className="h-8 text-xs" />
                    <CommandEmpty className="py-2 text-xs text-muted-foreground text-center">No variables found.</CommandEmpty>
                    <CommandGroup className="max-h-[300px] overflow-auto">
                        {VARIABLES.map(v => (
                            <CommandItem
                                key={v.name}
                                onSelect={() => {
                                    onInsert(`{{ ${v.name} }}`)
                                    setOpen(false)
                                }}
                                className="flex flex-col items-start gap-0.5 cursor-pointer aria-selected:bg-muted/50"
                            >
                                <span className="text-xs font-mono font-medium">{v.name}</span>
                                <span className="text-[10px] text-muted-foreground">{v.desc}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
