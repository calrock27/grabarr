/**
 * Date formatting utilities that respect the configured timezone setting.
 * Uses the timezone from SystemSettings or falls back to browser auto-detect.
 */

// Get the configured timezone from localStorage (cached from settings)
export function getConfiguredTimezone(): string {
    if (typeof window === 'undefined') return 'UTC'

    const stored = localStorage.getItem('grabarr_timezone')
    if (stored && stored !== 'auto') {
        return stored
    }

    // Auto-detect from browser
    return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Set the configured timezone (called when settings are saved)
export function setConfiguredTimezone(timezone: string): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem('grabarr_timezone', timezone)
    }
}

// Parse a date string that may be missing timezone info (assumes UTC)
export function parseUTCDate(dateStr: string): Date {
    if (!dateStr) return new Date()
    // Append Z if no timezone info present
    const normalized = dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)
        ? dateStr
        : dateStr + 'Z'
    return new Date(normalized)
}

// Format a date for display using the configured timezone
export function formatDate(date: string | Date | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (!date) return "—"

    try {
        const d = typeof date === 'string' ? parseUTCDate(date) : date
        const timezone = getConfiguredTimezone()

        const defaultOptions: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        }

        return d.toLocaleString('en-US', { ...defaultOptions, ...options })
    } catch {
        return "—"
    }
}

// Format a date with seconds
export function formatDateTime(date: string | Date | undefined): string {
    return formatDate(date, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

// Format just the date part
export function formatDateOnly(date: string | Date | undefined): string {
    return formatDate(date, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: undefined,
        minute: undefined,
    })
}
