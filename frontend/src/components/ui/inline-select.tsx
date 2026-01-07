"use client"

import { useState, useEffect } from "react"
import { Check, X, ChevronDown } from "lucide-react"

export interface InlineSelectOption {
    label: string
    value: string
}

interface InlineSelectProps {
    value: string
    options: InlineSelectOption[]
    onSave: (val: string) => Promise<any>
    /** Optional: Display value (defaults to value) */
    displayValue?: string
    /** Optional: Width of the select dropdown */
    width?: string
}

export function InlineSelect({
    value,
    options,
    onSave,
    displayValue,
    width = "w-32"
}: InlineSelectProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [currentValue, setCurrentValue] = useState(() => {
        // Find matching option by label or value
        const match = options.find(o => o.label === value || o.value === value)
        return match?.value || options[0]?.value || ''
    })
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        const match = options.find(o => o.label === value || o.value === value)
        setCurrentValue(match?.value || options[0]?.value || '')
    }, [value, options])

    if (isEditing) {
        return (
            <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="relative">
                    <select
                        value={currentValue}
                        onChange={(e) => setCurrentValue(e.target.value)}
                        className={`bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-primary ${width}`}
                        disabled={isLoading}
                        autoFocus
                    >
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1.5 h-3 w-3 text-zinc-500 pointer-events-none" />
                </div>
                <button
                    onClick={async () => {
                        setIsLoading(true)
                        try {
                            await onSave(currentValue)
                            setIsEditing(false)
                        } finally {
                            setIsLoading(false)
                        }
                    }}
                    className="p-1 hover:bg-primary/10 rounded text-primary transition-colors"
                    disabled={isLoading}
                >
                    <Check className="h-4 w-4" />
                </button>
                <button
                    onClick={() => {
                        const match = options.find(o => o.label === value || o.value === value)
                        setCurrentValue(match?.value || options[0]?.value || '')
                        setIsEditing(false)
                    }}
                    className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"
                    disabled={isLoading}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        )
    }

    return (
        <div
            onDoubleClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-white/5 px-2 py-1 rounded -ml-2 transition-all border border-transparent hover:border-zinc-700/50 capitalize text-sm text-muted-foreground"
            title="Double click to edit"
        >
            {displayValue || value || "—"}
        </div>
    )
}
