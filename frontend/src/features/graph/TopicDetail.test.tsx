import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TopicInfo } from "../../api/types";
import { TopicDetail } from "./TopicDetail";

const TOPIC: TopicInfo = {
  name: "/chatter",
  types: ["std_msgs/msg/String"],
  publishers: ["/talker"],
  subscribers: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopicDetail", () => {
  it("shows the type, publishers and the empty subscriber state", () => {
    render(<TopicDetail topic={TOPIC} />);

    expect(screen.getByText(/std_msgs\/msg\/String/)).toBeInTheDocument();
    expect(screen.getByText("/talker")).toBeInTheDocument();
    expect(screen.getByText("Sin suscriptores")).toBeInTheDocument();
  });

  it("shows the empty publisher state", () => {
    render(<TopicDetail topic={{ ...TOPIC, publishers: [] }} />);

    expect(screen.getByText("Sin editores")).toBeInTheDocument();
  });

  it("measures the frequency on demand", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ available: true, hz: 62.1, window_s: 2.0, reason: null }),
    );
    render(<TopicDetail topic={TOPIC} />);

    fireEvent.click(screen.getByRole("button", { name: "Medir frecuencia" }));

    expect(await screen.findByText("62.1 Hz")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/topics/%2Fchatter/rate?window_s=2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("explains why the frequency is unavailable", async () => {
    stubFetch(jsonResponse({ available: false, hz: null, window_s: 2.0, reason: "no_publishers" }));
    render(<TopicDetail topic={TOPIC} />);

    fireEvent.click(screen.getByRole("button", { name: "Medir frecuencia" }));

    expect(await screen.findByText("No disponible: sin editores")).toBeInTheDocument();
  });

  it("reports an unknown message type", async () => {
    stubFetch(
      jsonResponse({ available: false, hz: null, window_s: 2.0, reason: "type_unavailable" }),
    );
    render(<TopicDetail topic={TOPIC} />);

    fireEvent.click(screen.getByRole("button", { name: "Medir frecuencia" }));

    expect(await screen.findByText("No disponible: tipo desconocido")).toBeInTheDocument();
  });

  it("shows the API error when measuring fails", async () => {
    stubFetch(
      jsonResponse({ code: "topic_not_found", message: "Topic does not exist" }, 404),
    );
    render(<TopicDetail topic={TOPIC} />);

    fireEvent.click(screen.getByRole("button", { name: "Medir frecuencia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Topic does not exist");
  });
});
