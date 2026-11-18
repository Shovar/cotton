import { expect, test } from "@playwright/test";

const token = process.env.COTTON_TOKEN ?? "test-token";

test("terminals support interactive sessions, groups, splits, and restore", async ({
  page,
  request,
}) => {
  const createdIds: string[] = [];
  const terminalOutput: string[] = [];
  let confirmationMessage = "";

  page.on("dialog", async (dialog) => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => {
      const event = JSON.parse(String(frame.payload)) as {
        type?: string;
        data?: { data?: string };
      };
      if (event.type === "terminal.output" && typeof event.data?.data === "string") {
        terminalOutput.push(Buffer.from(event.data.data, "base64").toString("utf8"));
      }
    });
  });

  try {
    await page.goto(`/#token=${token}`);
    await page.getByRole("button", { name: "Terminals" }).click();
    await expect(
      page.getByRole("heading", { name: "Terminals" }),
    ).toBeVisible();

    await page.getByLabel("New group").fill("E2E");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.getByRole("button", { name: "E2E", exact: true }).click();

    const shellResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/terminals" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "New shell" }).click();
    const shellResponse = await shellResponsePromise;
    const shellRecord = (await shellResponse.json()) as { spec: { id: string } };
    const shellId = shellRecord.spec.id;
    createdIds.push(shellId);
    const shellRow = page
      .locator('ul[aria-label="Terminal sessions"] li')
      .filter({ has: page.getByRole("button", { name: shellId, exact: true }) });
    await expect(shellRow).toHaveAttribute("data-state", "running");

    const shellTab = page.getByRole("tab", { name: shellId, exact: true });
    const shellPanel = page.getByRole("application", {
      name: `Terminal ${shellId}`,
    });
    await shellPanel.click();
    await page.keyboard.type("printf 'COTTON_SHELL_MARKER\\n'");
    await page.keyboard.press("Enter");
    await expect.poll(() => terminalOutput.join("")).toContain("COTTON_SHELL_MARKER");

    const commandResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/terminals" &&
        response.request().method() === "POST",
    );
    await page.getByLabel("Command").fill("/bin/echo COTTON_COMMAND_MARKER");
    await page.getByRole("button", { name: "Run command" }).click();
    const commandResponse = await commandResponsePromise;
    const commandRecord = (await commandResponse.json()) as {
      spec: { id: string };
    };
    const commandId = commandRecord.spec.id;
    createdIds.push(commandId);
    const commandRow = page
      .locator('ul[aria-label="Terminal sessions"] li')
      .filter({ has: page.getByRole("button", { name: commandId, exact: true }) });
    await expect(commandRow).toHaveAttribute("data-state", "exited");
    await expect.poll(() => terminalOutput.join("")).toContain("COTTON_COMMAND_MARKER");
    const commandTab = page.getByRole("tab", {
      name: commandId,
      exact: true,
    });
    await expect(commandTab).toBeVisible();

    await shellTab.click();
    const shellBounds = await shellPanel.boundingBox();
    if (!shellBounds) {
      throw new Error("The interactive shell panel is not visible");
    }
    const commandPanel = page.getByRole("application", {
      name: `Terminal ${commandId}`,
    });
    const commandTabBounds = await commandTab.boundingBox();
    if (!commandTabBounds) {
      throw new Error("The command tab is not visible");
    }
    await page.mouse.move(
      commandTabBounds.x + commandTabBounds.width / 2,
      commandTabBounds.y + commandTabBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      shellBounds.x + shellBounds.width - 8,
      shellBounds.y + shellBounds.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(shellPanel).toBeVisible();
    await expect(commandPanel).toBeVisible();

    const sash = page.locator(".dv-sash.dv-enabled").first();
    const shellBefore = await shellPanel.boundingBox();
    const commandBefore = await commandPanel.boundingBox();
    const sashBounds = await sash.boundingBox();
    if (!shellBefore || !commandBefore || !sashBounds) {
      throw new Error("The split terminal panes or divider are not visible");
    }
    await page.mouse.move(
      sashBounds.x + sashBounds.width / 2,
      sashBounds.y + sashBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      sashBounds.x + sashBounds.width / 2 + 60,
      sashBounds.y + sashBounds.height / 2,
    );
    await page.mouse.up();

    await expect.poll(async () => (await shellPanel.boundingBox())?.width).not.toBe(
      shellBefore.width,
    );
    const shellAfter = await shellPanel.boundingBox();
    const commandAfter = await commandPanel.boundingBox();
    if (!shellAfter || !commandAfter) {
      throw new Error("A terminal pane disappeared after resizing");
    }
    expect(Math.abs(commandAfter.width - commandBefore.width)).toBeGreaterThan(10);

    await commandTab.click();
    await page.getByRole("button", { name: "Minimize terminal" }).click();
    await expect(commandTab).toHaveCount(0);
    await page.getByRole("button", { name: `Restore ${commandId}` }).click();
    await expect(commandTab).toBeVisible();

    const closeCommandPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/terminals/${commandId}` &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: `Close ${commandId}` }).click();
    await closeCommandPromise;
    await expect(commandRow).toHaveAttribute("data-state", "exited");

    await shellTab.click();
    await shellPanel.click();
    await page.keyboard.type("printf 'COTTON_BUSY_MARKER\\n'; sleep 60");
    await page.keyboard.press("Enter");
    await expect.poll(() => terminalOutput.join("")).toContain("COTTON_BUSY_MARKER");
    await page.getByRole("button", { name: `Close ${shellId}` }).click();
    await expect(shellRow).toHaveAttribute("data-state", "exited");
    expect(confirmationMessage).toContain(shellId);
  } finally {
    for (const id of createdIds) {
      const response = await request.delete(
        `/api/terminals/${encodeURIComponent(id)}?force=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect([200, 404]).toContain(response.status());
    }
  }
});
