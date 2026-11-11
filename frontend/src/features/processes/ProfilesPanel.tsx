import { useEffect, useState } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { ProcessRecord, Profile } from "../../api/types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción";
}

function profileId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "perfil";
}

export function ProfilesPanel({ processes }: { processes: ProcessRecord[] }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("Perfil");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiGet<Profile[]>("/api/profiles")
      .then((list) => {
        if (!cancelled) {
          setProfiles(list);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const trimmed = name.trim() || "Perfil";
    try {
      await apiSend<Profile>("POST", "/api/profiles", {
        id: profileId(trimmed),
        name: trimmed,
        processes: processes.map((record) => record.spec),
      });
      setProfiles(await apiGet<Profile[]>("/api/profiles"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const start = async (id: string) => {
    try {
      await apiSend("POST", `/api/profiles/${encodeURIComponent(id)}/start`);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section className="profiles-panel" aria-label="Perfiles">
      <h2>Perfiles</h2>
      <div className="profile-save">
        <label>
          Nombre del perfil
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="button" disabled={processes.length === 0} onClick={save}>
          Guardar como perfil
        </button>
      </div>
      {error && <p className="process-error">{error}</p>}
      {profiles.length === 0 ? (
        <p>Sin perfiles</p>
      ) : (
        <ul className="profile-list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <span>{profile.name || profile.id}</span>
              <button type="button" onClick={() => start(profile.id)}>
                Iniciar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
