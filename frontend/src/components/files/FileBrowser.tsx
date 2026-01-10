"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Folder, File, ChevronRight, Home, ArrowUp, FolderOpen, FileStack, Ban } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FileItem {
    Path: string
    Name: string
    Size: number
    MimeType: string
    ModTime: string
    IsDir: boolean
}

export type CopyMode = 'folder' | 'contents'

interface FileBrowserProps {
    remoteId: number
    initialPath?: string
    onSelectPath: (path: string, copyMode: CopyMode) => void
    onAddExclude?: (pattern: string) => void
    label?: string
}

export function FileBrowser({
    remoteId,
    initialPath = "",
    onSelectPath,
    onAddExclude,
    label = "Path"
}: FileBrowserProps) {
    const [path, setPath] = useState(initialPath)
    const [items, setItems] = useState<FileItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copyMode, setCopyMode] = useState<CopyMode>('folder')
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: FileItem } | null>(null)

    // Session management for SSH connection pooling
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [sessionReady, setSessionReady] = useState(false)
    const sessionRemoteId = useRef<number | null>(null)
    const sessionIdRef = useRef<string | null>(null)

    // Keep ref in sync with state
    useEffect(() => {
        sessionIdRef.current = sessionId
    }, [sessionId])

    // Start session when remoteId changes
    useEffect(() => {
        if (!remoteId) return

        // If we already have a session for this remote, skip
        if (sessionIdRef.current && sessionRemoteId.current === remoteId) return

        let cancelled = false
        const previousSessionId = sessionIdRef.current

        setSessionReady(false)
        setLoading(true)

        async function startSession() {
            try {
                // End previous session if exists
                if (previousSessionId) {
                    await api.endBrowseSession(previousSessionId).catch(() => { })
                }

                const result = await api.startBrowseSession(remoteId)
                if (!cancelled) {
                    console.log("SSH browse session started:", result.session_id)
                    setSessionId(result.session_id)
                    sessionRemoteId.current = remoteId
                    setSessionReady(true)
                }
            } catch (e: any) {
                console.error("Failed to start browse session:", e)
                // Mark as ready anyway - will fall back to legacy browsing
                if (!cancelled) {
                    setSessionReady(true)
                }
            }
        }

        startSession()

        return () => {
            cancelled = true
        }
    }, [remoteId])

    // End session on unmount only
    useEffect(() => {
        return () => {
            if (sessionIdRef.current) {
                api.endBrowseSession(sessionIdRef.current).catch(() => { })
            }
        }
    }, [])

    // Load path when path changes OR when session becomes ready
    useEffect(() => {
        if (remoteId && sessionReady) {
            loadPath(path)
        }
    }, [path, remoteId, sessionReady])

    useEffect(() => {
        onSelectPath(path, copyMode)
    }, [path, copyMode])

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null)
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [])

    async function loadPath(targetPath: string) {
        if (!remoteId) return
        setLoading(true)
        setError(null)
        try {
            // Use session-based browsing if session exists, otherwise fall back to legacy
            let res: FileItem[]
            if (sessionId) {
                console.log("Browsing with SSH session:", sessionId, "path:", targetPath)
                res = await api.browseSession(sessionId, targetPath)
            } else {
                console.log("Browsing with legacy (no session), path:", targetPath)
                res = await api.browseRemote(remoteId, targetPath)
            }
            const sorted = res.sort((a: FileItem, b: FileItem) => {
                if (a.IsDir && !b.IsDir) return -1
                if (!a.IsDir && b.IsDir) return 1
                return a.Name.localeCompare(b.Name)
            })
            setItems(sorted)
        } catch (e: any) {
            setError(e.message || "Failed to load")
        } finally {
            setLoading(false)
        }
    }

    const handleNavigate = (subfolder: string) => {
        setPath(path ? `${path}/${subfolder}` : subfolder)
    }

    const handleUp = () => {
        if (!path) return
        const parts = path.split("/")
        parts.pop()
        setPath(parts.join("/"))
    }

    const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, item })
    }

    const handleExclude = (pattern: string) => {
        if (onAddExclude) {
            onAddExclude(pattern)
        }
        setContextMenu(null)
    }

    const breadcrumbs = path.split("/").filter(Boolean)
    const displayBreadcrumbs = breadcrumbs.slice(-2) // Show last 2 only

    return (
        <div className="flex flex-col border rounded-lg bg-zinc-900/50 h-full overflow-hidden relative">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border/50 shrink-0 bg-zinc-800/50">
                <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 px-2 py-1 mx-2 mt-1 rounded bg-zinc-800/30 text-[11px] shrink-0 overflow-hidden">
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setPath("")} disabled={!path}>
                    <Home className="h-3 w-3" />
                </Button>
                {path && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleUp}>
                        <ArrowUp className="h-3 w-3" />
                    </Button>
                )}
                <span className="text-muted-foreground">/</span>
                {breadcrumbs.length > 2 && <span className="text-muted-foreground">...</span>}
                {displayBreadcrumbs.map((part, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="h-2 w-2 text-muted-foreground shrink-0" />}
                        <span className="truncate max-w-[60px] font-mono">{part}</span>
                    </React.Fragment>
                ))}
            </div>

            {/* File List */}
            <ScrollArea className="flex-1 min-h-0 mx-2 my-1">
                <div className="space-y-px pr-3">
                    {loading && <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">Loading...</div>}
                    {!loading && error && <div className="py-8 text-center text-xs text-red-400">{error}</div>}
                    {!loading && !error && items.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">Empty</div>}

                    {!loading && !error && items.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-800/70 rounded cursor-pointer group"
                            onClick={() => item.IsDir ? handleNavigate(item.Name) : null}
                            onContextMenu={(e) => handleContextMenu(e, item)}
                        >
                            {item.IsDir ? (
                                <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            ) : (
                                <File className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                            )}
                            <span className="flex-1 truncate font-mono text-[10px] overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                                {item.Name}
                            </span>
                            {item.IsDir && <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />}
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Copy Mode Toggle */}
            <div className="px-2 py-1 border-t border-border/50 shrink-0 bg-zinc-800/30">
                <div className="flex gap-px p-px bg-zinc-900 rounded">
                    <button
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] ${copyMode === 'folder' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'
                            }`}
                        onClick={() => setCopyMode('folder')}
                    >
                        <FolderOpen className="h-3 w-3" />
                        Folder
                    </button>
                    <button
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] ${copyMode === 'contents' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'
                            }`}
                        onClick={() => setCopyMode('contents')}
                    >
                        <FileStack className="h-3 w-3" />
                        Contents
                    </button>
                </div>
            </div>

            {/* Selected Path */}
            <div className="px-2 py-1 border-t border-border/50 bg-zinc-800/50 shrink-0">
                <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {copyMode === 'folder' ? `/${path || ''}` : `contents of /${path || ''}`}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && onAddExclude && (
                <div
                    className="fixed z-50 bg-zinc-900 border border-border rounded-md shadow-lg py-1 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-border/50">
                        {contextMenu.item.Name}
                    </div>
                    <button
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-800 flex items-center gap-2"
                        onClick={() => handleExclude(contextMenu.item.Name)}
                    >
                        <Ban className="h-3 w-3 text-red-400" />
                        Exclude "{contextMenu.item.Name}"
                    </button>
                    {!contextMenu.item.IsDir && contextMenu.item.Name.includes('.') && (
                        <button
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-800 flex items-center gap-2"
                            onClick={() => handleExclude(`*.${contextMenu.item.Name.split('.').pop()}`)}
                        >
                            <Ban className="h-3 w-3 text-orange-400" />
                            Exclude *.{contextMenu.item.Name.split('.').pop()} files
                        </button>
                    )}
                    {contextMenu.item.IsDir && (
                        <button
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-800 flex items-center gap-2"
                            onClick={() => handleExclude(`${contextMenu.item.Name}/**`)}
                        >
                            <Ban className="h-3 w-3 text-orange-400" />
                            Exclude folder & contents
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
