"use client"

import { useState } from "react"
import {
    DndContext,
    closestCenter,
    rectIntersection,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverEvent,
    DragStartEvent,
    DragOverlay,
    useDroppable,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { GripVertical, Plus, Trash2, Zap, Clock, Terminal, Webhook, Bell, Play, Container, Search } from "lucide-react"
import { Action, JobAction } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ActionWorkflowProps {
    jobName: string
    preActions: JobAction[]
    postActions: JobAction[]
    availableActions: Action[]
    onPreActionsChange: (actions: JobAction[]) => void
    onPostActionsChange: (actions: JobAction[]) => void
}

const ACTION_ICONS: Record<string, any> = {
    webhook: Webhook,
    command: Terminal,
    notification: Bell,
    rclone: Play,
    docker: Container,
    delay: Clock,
}

// Droppable Zone Component
function DroppableZone({ id, children, title, description, isActive }: { id: string, children: React.ReactNode, title: string, description: string, isActive: boolean }) {
    const { setNodeRef, isOver } = useDroppable({ id })

    return (
        <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">{title}</div>
            <div
                ref={setNodeRef}
                className={cn(
                    "space-y-1.5 min-h-[100px] p-3 border-2 border-dashed rounded-md transition-colors duration-200 flex flex-col",
                    isOver ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-border bg-muted/10",
                    isActive && !isOver ? "border-primary/40" : ""
                )}
            >
                {description && (
                    <div className={cn(
                        "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity",
                        isActive ? "opacity-100" : "opacity-0"
                    )}>
                        {/* Subtle hint when dragging */}
                    </div>
                )}
                {children}
            </div>
        </div>
    )
}

// Draggable Sidebar Item (Reduced to useSortable for simplicity since we already had it)
function DraggableSidebarAction({ action }: { action: Action }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        isDragging,
    } = useSortable({
        id: `library-${action.id}`,
        data: {
            type: 'library',
            action: action
        }
    })

    const style = {
        opacity: isDragging ? 0.4 : 1,
    }

    const Icon = ACTION_ICONS[action.type] || Zap

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="flex items-center gap-2 p-2 bg-muted/40 border border-border rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/60 transition-colors group"
        >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
            <div className="p-1 px-1.5 rounded bg-purple-500/10 border border-purple-500/20">
                <Icon className="h-3 w-3 text-purple-400" />
            </div>
            <div className="min-w-0">
                <div className="text-xs font-medium truncate">{action.name}</div>
                <div className="text-[9px] text-muted-foreground uppercase leading-none">{action.type}</div>
            </div>
        </div>
    )
}

// Sortable Timeline Item
function SortableActionCard({ ja, onRemove }: { ja: JobAction; onRemove: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: ja.id?.toString() || ja.tempId || `temp-${ja.action_id}-${ja.trigger}-${ja.order}`,
        data: {
            type: 'timeline',
            ja: ja
        }
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    }

    const Icon = ACTION_ICONS[ja.action?.type || "webhook"] || Zap

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 p-2 bg-card border border-border rounded-md group shadow-sm"
        >
            <button
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="p-1.5 rounded bg-purple-500/20">
                    <Icon className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ja.action?.name || "Unknown Action"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase leading-none">{ja.action?.type}</div>
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={onRemove}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}

// Pure Overlay Component
function ActionOverlay({ ja, isLibrary }: { ja: JobAction | Action; isLibrary?: boolean }) {
    const action = isLibrary ? (ja as Action) : (ja as JobAction).action;
    const Icon = ACTION_ICONS[action?.type || "webhook"] || Zap

    return (
        <div className="flex items-center gap-2 p-3 bg-card border-primary border-2 rounded-md shadow-[0_10px_40px_rgba(0,0,0,0.5)] scale-105 transition-transform ring-4 ring-primary/20 min-w-[200px]">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 rounded bg-purple-500/20">
                    <Icon className="h-4 w-4 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{action?.name || "Unknown"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase leading-none font-bold tracking-wider">{action?.type}</div>
                </div>
            </div>
        </div>
    )
}

export function ActionWorkflow({
    jobName,
    preActions,
    postActions,
    availableActions,
    onPreActionsChange,
    onPostActionsChange,
}: ActionWorkflowProps) {
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeData, setActiveData] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState("")

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const getActionId = (ja: JobAction) => ja.id?.toString() || ja.tempId || `temp-${ja.action_id}-${ja.trigger}-${ja.order}`

    const filteredActions = availableActions.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.type.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event
        setActiveId(active.id as string)
        setActiveData(active.data.current)
    }

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        // If we're dragging a library item over a zone - no intermediate reordering logic needed here
        if (activeData?.type === 'library') {
            return;
        }

        // Logic for reordering/moving existing actions
        const isActiveInPre = preActions.some((a) => getActionId(a) === activeId)
        const isOverInPre = overId === "pre-zone" || preActions.some((a) => getActionId(a) === overId)
        const isActiveInPost = postActions.some((a) => getActionId(a) === activeId)
        const isOverInPost = overId === "post-zone" || postActions.some((a) => getActionId(a) === overId)

        if (isActiveInPre && isOverInPost) {
            const actionToMove = preActions.find((a) => getActionId(a) === activeId)
            if (actionToMove) {
                onPreActionsChange(preActions.filter((a) => getActionId(a) !== activeId))
                onPostActionsChange([...postActions, { ...actionToMove, trigger: 'post_always' as const }])
            }
        } else if (isActiveInPost && isOverInPre) {
            const actionToMove = postActions.find((a) => getActionId(a) === activeId)
            if (actionToMove) {
                onPostActionsChange(postActions.filter((a) => getActionId(a) !== activeId))
                onPreActionsChange([...preActions, { ...actionToMove, trigger: 'pre' as const }])
            }
        }
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        setActiveData(null)

        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        // Case 1: Dropping a new library item into a zone
        if (activeData?.type === 'library') {
            const action = activeData.action
            const isOverInPre = overId === "pre-zone" || preActions.some((a) => getActionId(a) === overId)
            const isOverInPost = overId === "post-zone" || postActions.some((a) => getActionId(a) === overId)

            const newAction: JobAction = {
                action_id: action.id,
                trigger: isOverInPre ? 'pre' : 'post_always',
                order: isOverInPre ? preActions.length : postActions.length,
                action,
                tempId: crypto.randomUUID()
            }

            if (isOverInPre) {
                onPreActionsChange([...preActions, newAction])
            } else if (isOverInPost) {
                onPostActionsChange([...postActions, newAction])
            }
            return
        }

        // Case 2: Reordering existing items
        if (activeId === overId) return

        const preIndex = preActions.findIndex((a) => getActionId(a) === activeId)
        const preOverIndex = preActions.findIndex((a) => getActionId(a) === overId)
        if (preIndex !== -1 && preOverIndex !== -1) {
            onPreActionsChange(arrayMove(preActions, preIndex, preOverIndex))
            return
        }

        const postIndex = postActions.findIndex((a) => getActionId(a) === activeId)
        const postOverIndex = postActions.findIndex((a) => getActionId(a) === overId)
        if (postIndex !== -1 && postOverIndex !== -1) {
            onPostActionsChange(arrayMove(postActions, postIndex, postOverIndex))
            return
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="grid grid-cols-12 gap-4 h-[500px]">
                {/* Available Actions Sidebar */}
                <div className="col-span-4 flex flex-col bg-muted/20 border border-border rounded-lg overflow-hidden">
                    <div className="p-3 border-b border-border bg-muted/40">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Action Library</div>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search actions..."
                                className="pl-8 h-8 text-xs bg-background border-border"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                        <SortableContext
                            id="library"
                            items={filteredActions.map(a => `library-${a.id}`)}
                        >
                            {filteredActions.length === 0 ? (
                                <div className="text-[10px] text-center text-muted-foreground py-4">No actions found</div>
                            ) : (
                                filteredActions.map(action => (
                                    <DraggableSidebarAction key={action.id} action={action} />
                                ))
                            )}
                        </SortableContext>
                    </div>
                </div>

                {/* Job Timeline Timeline */}
                <div className="col-span-8 flex flex-col space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                    {/* Pre-Actions Zone */}
                    <DroppableZone
                        id="pre-zone"
                        title="Pre-Job"
                        description="Drop actions here"
                        isActive={activeData?.type === 'library'}
                    >
                        <SortableContext
                            id="pre-zone"
                            items={preActions.map(getActionId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="w-full space-y-1.5 flex-1">
                                {preActions.length === 0 && (
                                    <div className="h-full min-h-[60px] flex items-center justify-center text-[10px] text-muted-foreground/60 text-center uppercase tracking-widest font-bold">
                                        Drop Pre-Actions Here
                                    </div>
                                )}
                                {preActions.map((ja, index) => (
                                    <SortableActionCard
                                        key={getActionId(ja)}
                                        ja={ja}
                                        onRemove={() => onPreActionsChange(preActions.filter((_, i) => i !== index))}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DroppableZone>

                    {/* Job Card (Fixed) */}
                    <div className="relative py-2 px-1">
                        <div className="absolute left-1/2 -top-4 -bottom-4 w-px bg-border -z-10" />
                        <div className="p-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-2 border-purple-500/50 rounded-lg shadow-inner">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-purple-500/30">
                                    <Zap className="h-4 w-4 text-purple-400" />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold tracking-tight">{jobName || "Untitled Job"}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono uppercase">Primary Transfer Phase</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Post-Actions Zone */}
                    <DroppableZone
                        id="post-zone"
                        title="Post-Job"
                        description="Drop actions here"
                        isActive={activeData?.type === 'library'}
                    >
                        <SortableContext
                            id="post-zone"
                            items={postActions.map(getActionId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="w-full space-y-1.5 flex-1">
                                {postActions.length === 0 && (
                                    <div className="h-full min-h-[60px] flex items-center justify-center text-[10px] text-muted-foreground/60 text-center uppercase tracking-widest font-bold">
                                        Drop Post-Actions Here
                                    </div>
                                )}
                                {postActions.map((ja, index) => (
                                    <SortableActionCard
                                        key={getActionId(ja)}
                                        ja={ja}
                                        onRemove={() => onPostActionsChange(postActions.filter((_, i) => i !== index))}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DroppableZone>
                </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay dropAnimation={null}>
                {activeId ? (
                    <ActionOverlay
                        ja={activeData?.type === 'library' ? activeData.action : activeData?.ja}
                        isLibrary={activeData?.type === 'library'}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}
