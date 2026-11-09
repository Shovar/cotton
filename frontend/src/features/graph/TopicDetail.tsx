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
      setError(caught instanceof Error ? caught.message : "No se pudo medir la frecuencia");
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <section className="topic-detail" aria-label={`Topic ${topic.name}`}>
      <h2>{topic.name}</h2>
      <p>Tipo: {topic.types.join(", ") || "desconocido"}</p>
      <h3>Editores</h3>
      {topic.publishers.length === 0 ? (
        <p>Sin editores</p>
      ) : (
        <ul>
          {topic.publishers.map((publisher) => (
            <li key={publisher}>{publisher}</li>
          ))}
        </ul>
      )}
      <h3>Suscriptores</h3>
      {topic.subscribers.length === 0 ? (
        <p>Sin suscriptores</p>
      ) : (
        <ul>
          {topic.subscribers.map((subscriber) => (
            <li key={subscriber}>{subscriber}</li>
          ))}
        </ul>
      )}
      <button type="button" disabled={measuring} onClick={() => void measure()}>
        {measuring ? "Midiendo…" : "Medir frecuencia"}
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
    return "No disponible: sin editores";
  }
  if (rate.reason === "type_unavailable") {
    return "No disponible: tipo desconocido";
  }
  return "Frecuencia no disponible";
}
