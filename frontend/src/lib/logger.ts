
import { create } from 'zustand'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
    id: string
    timestamp: Date
    level: LogLevel
    message: string
}

interface LogStore {
    logs: LogEntry[]
    minLevel: LogLevel
    setMinLevel: (level: LogLevel) => void
    addLog: (level: LogLevel, message: string) => void
    clearLogs: () => void
}

export const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
}

export const useLogStore = create<LogStore>((set, get) => ({
    logs: [],
    minLevel: 'info',
    setMinLevel: (level) => set({ minLevel: level }),
    addLog: (level, message) => {
        // Always add log, filtering is done in UI
        set((state) => ({
            logs: [
                {
                    id: Math.random().toString(36).substring(7),
                    timestamp: new Date(),
                    level,
                    message
                },
                ...state.logs
            ].slice(0, 1000)
        }))
    },
    clearLogs: () => set({ logs: [] })
}))

export const logger = {
    debug: (msg: string) => useLogStore.getState().addLog('debug', msg),
    info: (msg: string) => useLogStore.getState().addLog('info', msg),
    warn: (msg: string) => useLogStore.getState().addLog('warn', msg),
    error: (msg: string) => useLogStore.getState().addLog('error', msg),
    fatal: (msg: string) => useLogStore.getState().addLog('fatal', msg),
    // Backward compatibility helper
    success: (msg: string) => useLogStore.getState().addLog('info', `[SUCCESS] ${msg}`),
}
