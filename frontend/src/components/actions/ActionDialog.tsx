"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ActionForm } from "./ActionForm"
import { Action } from "@/lib/api"

interface ActionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (data: Omit<Action, "id">) => Promise<void>
    initialData?: Action
}

export function ActionDialog({ open, onOpenChange, onSubmit, initialData }: ActionDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-card border-border text-foreground">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Edit Action" : "New Action"}</DialogTitle>
                </DialogHeader>
                <ActionForm
                    initialData={initialData}
                    onSubmit={onSubmit}
                    onCancel={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    )
}
