"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
    ColumnDef,
    SortingState,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table"
import { type ListParams } from "@/lib/api"

interface UseServerDataTableProps<TData> {
    fetchFn: (params: ListParams) => Promise<TData[]>
    columns: ColumnDef<TData, any>[]
    defaultSortBy?: string
    defaultSortOrder?: 'asc' | 'desc'
    debounceMs?: number
}

export function useServerDataTable<TData>({
    fetchFn,
    columns,
    defaultSortBy,
    defaultSortOrder = 'asc',
    debounceMs = 300
}: UseServerDataTableProps<TData>) {
    const [data, setData] = useState<TData[]>([])
    const [loading, setLoading] = useState(true)
    const [searchValue, setSearchValue] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [sorting, setSorting] = useState<SortingState>(
        defaultSortBy ? [{ id: defaultSortBy, desc: defaultSortOrder === 'desc' }] : []
    )

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue)
        }, debounceMs)
        return () => clearTimeout(timer)
    }, [searchValue, debounceMs])

    // Build params from current state
    const params = useMemo<ListParams>(() => {
        const p: ListParams = {}
        if (debouncedSearch) p.search = debouncedSearch
        if (sorting.length > 0) {
            p.sort_by = sorting[0].id
            p.sort_order = sorting[0].desc ? 'desc' : 'asc'
        }
        return p
    }, [debouncedSearch, sorting])

    // Fetch data when params change
    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const result = await fetchFn(params)
            setData(result)
        } catch (error) {
            console.error("Failed to fetch data:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }, [fetchFn, params])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Create table instance
    const table = useReactTable({
        data,
        columns,
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualSorting: true, // We handle sorting server-side
        state: {
            sorting,
        },
    })

    const refresh = useCallback(() => {
        fetchData()
    }, [fetchData])

    return {
        table,
        data,
        loading,
        searchValue,
        setSearchValue,
        refresh,
        sorting,
    }
}
