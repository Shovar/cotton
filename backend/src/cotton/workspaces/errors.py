from __future__ import annotations


class WorkspaceError(ValueError):
    """Base error for workspace and terminal group operations."""


class InvalidWorkspace(WorkspaceError):
    """A workspace name or path does not satisfy the domain rules."""


class WorkspaceNotFound(WorkspaceError):
    """No workspace is known under this id."""


class WorkspaceExists(WorkspaceError):
    """Another workspace already uses this path."""


class GroupNotFound(WorkspaceError):
    """No terminal group is known under this id."""
