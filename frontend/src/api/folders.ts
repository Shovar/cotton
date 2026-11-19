import { apiGet } from "./client";

export interface FolderEntry {
  name: string;
  path: string;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: FolderEntry[];
}

export function listFolders(path?: string): Promise<FolderListing> {
  return apiGet<FolderListing>(
    path ? `/api/folders?path=${encodeURIComponent(path)}` : "/api/folders",
  );
}
