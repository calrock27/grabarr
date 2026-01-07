import { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"

interface PageHeaderProps {
    title: string
    description: string
    /** Optional action button */
    actionLabel?: string
    actionHref?: string
    onAction?: () => void
    /** Optional icon to display next to action button */
    actionIcon?: ReactNode
    /** Additional content to render in the header (e.g., right-aligned items) */
    children?: ReactNode
}

export function PageHeader({
    title,
    description,
    actionLabel,
    actionHref,
    onAction,
    actionIcon = <Plus className="mr-2 h-4 w-4" />,
    children
}: PageHeaderProps) {
    const renderAction = () => {
        if (!actionLabel) return null

        const buttonContent = (
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-6">
                {actionIcon} {actionLabel}
            </Button>
        )

        if (actionHref) {
            return <Link href={actionHref}>{buttonContent}</Link>
        }

        if (onAction) {
            return <div onClick={onAction}>{buttonContent}</div>
        }

        return buttonContent
    }

    return (
        <div className="flex justify-between items-center mb-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
                <p className="text-zinc-400 text-sm mt-1">{description}</p>
            </div>
            <div className="flex items-center gap-4">
                {children}
                {renderAction()}
            </div>
        </div>
    )
}
