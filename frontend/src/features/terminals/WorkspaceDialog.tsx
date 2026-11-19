import { ArrowUp, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { listFolders, type FolderListing } from "../../api/folders";
import type { Workspace } from "../../api/types";
import { createWorkspace } from "./workspacesApi";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace";
}

function folderCount(listing: FolderListing): string {
  const { length } = listing.folders;
  return `${length} ${length === 1 ? "folder" : "folders"}`;
}

export function WorkspaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listFolders()
      .then((loaded) => {
        if (active) {
          setListing(loaded);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const open = (path?: string) => {
    setError(null);
    listFolders(path)
      .then(setListing)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  };

  const create = async () => {
    if (!listing) {
      return;
    }
    setBusy(true);
    try {
      onCreated(await createWorkspace(folderName(listing.path), listing.path));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const currentName = listing ? folderName(listing.path) : null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Add workspace</DialogTitle>
        <DialogDescription>
          Choose the folder that contains your colcon workspace. New shells start there.
        </DialogDescription>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background py-1 pr-2 pl-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
            disabled={!listing?.parent}
            onClick={() => open(listing?.parent ?? undefined)}
          >
            <ArrowUp aria-hidden="true" />
            Up
          </Button>
          <FolderOpen aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <p
            className="min-w-0 flex-1 truncate font-mono text-xs"
            title={listing?.path}
          >
            {listing?.path ?? (error ? "Folder unavailable" : "Loading…")}
          </p>
          {listing && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {folderCount(listing)}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Folders
          </p>
          <ul
            aria-label="Folders"
            aria-busy={!listing}
            className="max-h-64 space-y-0.5 overflow-y-auto pr-1"
          >
            {!listing && !error && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                Loading folders…
              </li>
            )}
            {listing?.folders.map((folder) => {
              const hidden = folder.name.startsWith(".");
              return (
                <li key={folder.path}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="group h-8 w-full justify-start gap-2 px-2 text-sm font-normal"
                    onClick={() => open(folder.path)}
                  >
                    <Folder aria-hidden="true" className="text-muted-foreground" />
                    <span
                      className={`min-w-0 flex-1 truncate text-left ${
                        hidden ? "text-muted-foreground" : ""
                      }`}
                    >
                      {folder.name}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </Button>
                </li>
              );
            })}
            {listing && listing.folders.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                No subfolders. You can still add this folder.
              </li>
            )}
          </ul>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!listing || busy} onClick={() => void create()}>
            {busy ? "Adding…" : currentName ? `Add ${currentName}` : "Add workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
