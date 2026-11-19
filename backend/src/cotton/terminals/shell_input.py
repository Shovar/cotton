from __future__ import annotations


def compose_initial_input(startup: str | None, body: str | None) -> str | None:
    """Build the text written into a fresh shell once, without a trailing newline.

    A saved body runs only after the startup line succeeded, so a broken
    environment never gets the body executed against it.
    """
    if startup and body:
        return f"{startup} && {{\n{body}\n}}"
    return startup or body or None
