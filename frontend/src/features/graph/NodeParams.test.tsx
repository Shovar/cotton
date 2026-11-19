import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeParams } from "./NodeParams";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(values: unknown, putResponse: () => Response = () => new Response(null, { status: 204 })) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "PUT" ? putResponse() : jsonResponse(values),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function putCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
}

function renderParams() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NodeParams nodeName="/talker" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NodeParams", () => {
  it("saves a boolean as soon as it is toggled", async () => {
    const fetchMock = stubFetch({ use_sim_time: false });
    renderParams();

    fireEvent.click(await screen.findByRole("checkbox", { name: "use_sim_time" }));

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    const [path, init] = putCalls(fetchMock)[0];
    expect(path).toBe("/api/nodes/%2Ftalker/params/use_sim_time");
    expect(JSON.parse(String(init?.body))).toEqual({ value: true });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });

  it("saves numbers, strings and arrays while typing, without a save button", async () => {
    const fetchMock = stubFetch({ retries: 3, frame: "/odom", ids: [1, 2] });
    renderParams();

    fireEvent.change(await screen.findByRole("spinbutton", { name: "retries" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "frame" }), {
      target: { value: "/scan" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "ids" }), {
      target: { value: "[3]" },
    });

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(3), { timeout: 2000 });
    const values = putCalls(fetchMock).map(([, init]) => JSON.parse(String(init?.body)).value);
    expect(values).toEqual(expect.arrayContaining([5, "/scan", [3]]));
  });

  it("saves immediately on Enter", async () => {
    const fetchMock = stubFetch({ frame: "/odom" });
    renderParams();

    const input = await screen.findByRole("textbox", { name: "frame" });
    fireEvent.change(input, { target: { value: "/map" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String(putCalls(fetchMock)[0][1]?.body))).toEqual({ value: "/map" });
  });

  it("rejects a value that does not parse to the parameter type", async () => {
    const fetchMock = stubFetch({ ids: [1, 2], retries: 3 });
    renderParams();

    fireEvent.change(await screen.findByRole("textbox", { name: "ids" }), {
      target: { value: "[1," },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid value");
    expect(putCalls(fetchMock)).toHaveLength(0);
  });

  it("rejects an empty number instead of saving zero", async () => {
    const fetchMock = stubFetch({ retries: 3 });
    renderParams();

    fireEvent.change(await screen.findByRole("spinbutton", { name: "retries" }), {
      target: { value: "" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid value");
    expect(putCalls(fetchMock)).toHaveLength(0);
  });

  it("shows the API error when saving fails", async () => {
    stubFetch(
      { speed: 1.5 },
      () => jsonResponse({ code: "param_not_settable", message: "speed is read-only" }, 409),
    );
    renderParams();

    fireEvent.change(await screen.findByRole("spinbutton", { name: "speed" }), {
      target: { value: "2" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("speed is read-only");
  });

  it("labels each parameter with its kind", async () => {
    stubFetch({ retries: 3, speed: 1.5, frame: "/odom", ids: [1], use_sim_time: true });
    renderParams();

    await screen.findByRole("spinbutton", { name: "retries" });
    const kinds = screen.getAllByText(/^(bool|int|float|string|array)$/).map((cell) => cell.textContent);
    expect(kinds).toEqual(["int", "float", "string", "array", "bool"]);
  });

  it("marks unsupported parameter types as not editable", async () => {
    stubFetch({ weird: null });
    renderParams();

    expect(await screen.findByText("Not editable")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "weird" })).not.toBeInTheDocument();
  });

  it("shows an empty state for a node without parameters", async () => {
    stubFetch({});
    renderParams();

    expect(await screen.findByText("No parameters")).toBeInTheDocument();
    expect(screen.getByText("Changes save as you type")).toBeInTheDocument();
  });
});
