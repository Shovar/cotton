import { useState } from "react";

import { apiGet } from "../../api/client";
import type { RateResult, TopicInfo } from "../../api/types";

export function TopicDetail({ topic }: { topic: TopicInfo }) {
  const [rate, setRate] = useState<RateResult | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const measure = async () => {
    setMeasuring(true);
    setError(null);
    try {
      setRate(
        await apiGet<RateResult>(
          `/api/topics/${encodeURIComponent(topic.name)}/rate?window_s=2`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not measure the rate");
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <section className="topic-detail" aria-label={`Topic ${topic.name}`}>
      <h2>{topic.name}</h2>
      <p>Type: {topic.types.join(", ") || "unknown"}</p>
      <h3>Publishers</h3>
      {topic.publishers.length === 0 ? (
        <p>No publishers</p>
      ) : (
        <ul>
          {topic.publishers.map((publisher) => (
            <li key={publisher}>{publisher}</li>
          ))}
        </ul>
      )}
      <h3>Subscribers</h3>
      {topic.subscribers.length === 0 ? (
        <p>No subscribers</p>
      ) : (
        <ul>
          {topic.subscribers.map((subscriber) => (
            <li key={subscriber}>{subscriber}</li>
          ))}
        </ul>
      )}
      <button type="button" disabled={measuring} onClick={() => void measure()}>
        {measuring ? "Measuring…" : "Measure rate"}
      </button>
      {rate && <p>{rateLabel(rate)}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function rateLabel(rate: RateResult): string {
  if (rate.available) {
    return `${rate.hz} Hz`;
  }
  if (rate.reason === "no_publishers") {
    return "Unavailable: no publishers";
  }
  if (rate.reason === "type_unavailable") {
    return "Unavailable: unknown type";
  }
  return "Rate unavailable";
}
