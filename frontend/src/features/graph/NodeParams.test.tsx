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

function stubFetch(values: unknown, putResponse: () => Response) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "PUT" ? putResponse() : jsonResponse(values),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
  it("saves a boolean parameter", async () => {
    const fetchMock = stubFetch({ use_sim_time: false }, () => new Response(null, { status: 204 }));
    renderParams();

    fireEvent.click(await screen.findByRole("checkbox", { name: "use_sim_time" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar use_sim_time" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nodes/%2Ftalker/params/use_sim_time",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ value: true }) }),
      ),
    );
  });

  it("converts numbers, strings and arrays to the declared type", async () => {
    const fetchMock = stubFetch(
      { retries: 3, frame: "/odom", ids: [1, 2] },
      () => new Response(null, { status: 204 }),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Guardar retries" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar ids" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/nodes/%2Ftalker/params/ids",
        expect.objectContaining({ body: JSON.stringify({ value: [3] }) }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nodes/%2Ftalker/params/retries",
      expect.objectContaining({ body: JSON.stringify({ value: 5 }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nodes/%2Ftalker/params/frame",
      expect.objectContaining({ body: JSON.stringify({ value: "/scan" }) }),
    );
  });

  it("rejects an array that is not valid JSON", async () => {
    const fetchMock = stubFetch({ ids: [1, 2] }, () => new Response(null, { status: 204 }));
    renderParams();

    fireEvent.change(await screen.findByRole("textbox", { name: "ids" }), {
      target: { value: "[1," },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ids" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Valor no válido");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
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
    fireEvent.click(screen.getByRole("button", { name: "Guardar speed" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("speed is read-only");
  });

  it("marks unsupported parameter types as not editable", async () => {
    stubFetch({ weird: null }, () => new Response(null, { status: 204 }));
    renderParams();

    expect(await screen.findByText("No editable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar weird" })).not.toBeInTheDocument();
  });

  it("shows an empty state for a node without parameters", async () => {
    stubFetch({}, () => new Response(null, { status: 204 }));
    renderParams();

    expect(await screen.findByText("Sin parámetros")).toBeInTheDocument();
  });
});
