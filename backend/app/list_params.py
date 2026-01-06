"""
Reusable list query parameters and utilities for server-side search/sort.
"""
from typing import Optional, List, Type
from sqlalchemy import or_
from sqlalchemy.future import select


def apply_search_filter(query, model, search: Optional[str], searchable_columns: List[str]):
    """
    Apply a case-insensitive search filter across multiple columns.
    
    Args:
        query: SQLAlchemy select query
        model: SQLAlchemy model class
        search: Search term (optional)
        searchable_columns: List of column names to search
    
    Returns:
        Modified query with search filter applied
    """
    if not search or not searchable_columns:
        return query
    
    search_term = f"%{search}%"
    conditions = []
    
    for col_name in searchable_columns:
        if hasattr(model, col_name):
            column = getattr(model, col_name)
            # Use ilike for case-insensitive search
            conditions.append(column.ilike(search_term))
    
    if conditions:
        query = query.where(or_(*conditions))
    
    return query


def apply_sort(query, model, sort_by: Optional[str], sort_order: str = "asc"):
    """
    Apply sorting to a query.
    
    Args:
        query: SQLAlchemy select query
        model: SQLAlchemy model class
        sort_by: Column name to sort by (optional)
        sort_order: 'asc' or 'desc'
    
    Returns:
        Modified query with sorting applied
    """
    if not sort_by or not hasattr(model, sort_by):
        return query
    
    column = getattr(model, sort_by)
    
    if sort_order.lower() == "desc":
        query = query.order_by(column.desc())
    else:
        query = query.order_by(column.asc())
    
    return query


def apply_list_params(
    query,
    model,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    searchable_columns: List[str] = None
):
    """
    Apply search and sort to a query in one call.
    
    Args:
        query: SQLAlchemy select query
        model: SQLAlchemy model class
        search: Search term (optional)
        sort_by: Column name to sort by (optional)
        sort_order: 'asc' or 'desc'
        searchable_columns: List of column names to search
    
    Returns:
        Modified query with search and sort applied
    """
    if searchable_columns:
        query = apply_search_filter(query, model, search, searchable_columns)
    
    query = apply_sort(query, model, sort_by, sort_order)
    
    return query
