
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { RemoteForm } from "./RemoteForm"
import { type Remote, type Credential } from "@/lib/api"

interface RemoteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialData?: Remote
    credentials: Credential[]
    onSubmit: (data: Omit<Remote, "id">) => void
    mode?: "create" | "edit"
}

export function RemoteDialog({
    open,
    onOpenChange,
    initialData,
    credentials,
    onSubmit,
    mode = "create"
}: RemoteDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card text-card-foreground border-border sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{mode === "edit" ? "Edit Target" : "New Target"}</DialogTitle>
                    <DialogDescription>
                        Configure a target endpoint for file transfers.
                    </DialogDescription>
                </DialogHeader>
                <RemoteForm
                    initialData={initialData}
                    credentials={credentials}
                    onSubmit={onSubmit}
                    onCancel={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    )
}
