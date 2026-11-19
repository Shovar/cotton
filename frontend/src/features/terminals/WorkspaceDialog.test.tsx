import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiSend: vi.fn() }));

vi.mock("../../api/client", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  apiGet: mocks.apiGet,
  apiSend: mocks.apiSend,
}));

import { ApiError } from "../../api/client";
import type { FolderListing } from "../../api/folders";
import { WorkspaceDialog } from "./WorkspaceDialog";

const HOME: FolderListing = {
  path: "/home/me",
  parent: "/home",
  folders: [
    { name: "colcon_ws", path: "/home/me/colcon_ws" },
    { name: "notes", path: "/home/me/notes" },
  ],
};

const CHILD: FolderListing = {
  path: "/home/me/colcon_ws",
  parent: "/home/me",
  folders: [{ name: "src", path: "/home/me/colcon_ws/src" }],
};

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiSend.mockReset();
  mocks.apiGet.mockResolvedValue(HOME);
});

describe("WorkspaceDialog", () => {
  it("lists the folders of the home directory", async () => {
    render(<WorkspaceDialog onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByText("/home/me")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "colcon_ws" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "notes" })).toBeInTheDocument();
  });

  it("navigates into a folder and back up", async () => {
    mocks.apiGet.mockImplementation(async (path: string) =>
      path.includes("colcon_ws") ? CHILD : HOME,
    );
    render(<WorkspaceDialog onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "colcon_ws" }));
    expect(await screen.findByText("/home/me/colcon_ws")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    expect(await screen.findByText("/home/me")).toBeInTheDocument();
  });

  it("creates a workspace named after the picked folder", async () => {
    const created = {
      id: "ws1",
      name: "colcon_ws",
      path: "/home/me/colcon_ws",
      created_at: "2026-11-18T00:00:00Z",
    };
    const onCreated = vi.fn();
    mocks.apiGet.mockImplementation(async (path: string) =>
      path.includes("colcon_ws") ? CHILD : HOME,
    );
    mocks.apiSend.mockResolvedValue(created);
    render(<WorkspaceDialog onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.click(await screen.findByRole("button", { name: "colcon_ws" }));
    await screen.findByText("/home/me/colcon_ws");
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/workspaces", {
        name: "colcon_ws",
        path: "/home/me/colcon_ws",
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("shows the backend error when the folder cannot be listed", async () => {
    mocks.apiGet.mockRejectedValue(
      new ApiError("validation_error", "not an existing directory: /gone", 422),
    );
    render(<WorkspaceDialog onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "not an existing directory",
    );
    expect(screen.getByRole("button", { name: "Use this folder" })).toBeDisabled();
  });
});
