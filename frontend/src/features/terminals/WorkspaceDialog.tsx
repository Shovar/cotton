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
          Pick the folder that contains your colcon workspace. New shells start there.
        </DialogDescription>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!listing?.parent}
            onClick={() => open(listing?.parent ?? undefined)}
          >
            Up
          </Button>
          <p
            className="min-w-0 flex-1 truncate font-mono text-xs"
            title={listing?.path}
          >
            {listing?.path ?? "Loading…"}
          </p>
        </div>
        <ul aria-label="Folders" className="max-h-64 space-y-1 overflow-y-auto">
          {listing?.folders.map((folder) => (
            <li key={folder.path}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-start truncate"
                onClick={() => open(folder.path)}
              >
                {folder.name}
              </Button>
            </li>
          ))}
          {listing && listing.folders.length === 0 && (
            <li className="px-1 text-xs text-muted-foreground">No folders here</li>
          )}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!listing || busy} onClick={() => void create()}>
            Use this folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
