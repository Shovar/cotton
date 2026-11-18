import { expect, test } from "@playwright/test";

const token = process.env.COTTON_TOKEN ?? "test-token";

test("turtlesim, graph, frequency, stop and foxglove", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto(`/#token=${token}`);
  await expect(page.getByRole("navigation", { name: "Secciones" })).toBeVisible();

  await page.getByRole("button", { name: "Procesos", exact: true }).click();
  await page.getByLabel("Comando").fill("ros2 run turtlesim turtlesim_node");
  await page.getByRole("button", { name: "Arrancar" }).click();
  await expect(page.getByText("running")).toBeVisible();

  await page.getByRole("button", { name: "Grafo", exact: true }).click();
  await expect(page.getByRole("button", { name: "/turtlesim" })).toBeVisible();

  await page.getByRole("button", { name: "/turtle1/pose" }).click();
  await expect(page.getByRole("region", { name: "Topic /turtle1/pose" })).toBeVisible();
  await page.getByRole("button", { name: "Medir frecuencia" }).click();
  await expect(page.getByText(/\d+(\.\d+)? Hz/)).toBeVisible();

  await page.getByRole("button", { name: "Procesos", exact: true }).click();
  await page.getByRole("button", { name: "Parar" }).click();
  await expect(page.getByText("exited")).toBeVisible();

  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await page.getByRole("button", { name: "Activar" }).click();
  await expect(page.getByText("Estado: Activo")).toBeVisible();
  await expect(page.getByTitle("Foxglove")).toBeVisible();
});
