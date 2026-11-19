import { expect, test } from "@playwright/test";

const token = process.env.COTTON_TOKEN ?? "test-token";

test("turtlesim, graph, frequency, close terminal and foxglove", async ({
  page,
  request,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  let terminalId: string | null = null;

  try {
    const created = await request.post("/api/terminals", {
      headers: { Authorization: `Bearer ${token}` },
      data: { command: "ros2 run turtlesim turtlesim_node" },
    });
    expect(created.status()).toBe(201);
    terminalId = ((await created.json()) as { spec: { id: string } }).spec.id;

    await page.goto(`/#token=${token}`);
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();

    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await expect(page.getByRole("button", { name: "/turtlesim" })).toBeVisible();

    await page.getByRole("button", { name: "/turtle1/pose" }).click();
    await expect(page.getByRole("region", { name: "Topic /turtle1/pose" })).toBeVisible();
    await page.getByRole("button", { name: "Measure rate" }).click();
    await expect(page.getByText(/\d+(\.\d+)? Hz/)).toBeVisible();

    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("State: Active")).toBeVisible();
    await expect(page.getByTitle("Foxglove")).toBeVisible();
  } finally {
    if (terminalId) {
      await request.delete(`/api/terminals/${encodeURIComponent(terminalId)}?force=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
});
