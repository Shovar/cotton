import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { apiGet, apiSend } from "../../api/client";
import type { ProcessRecord, Profile } from "../../api/types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

function profileId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "profile";
}

export function ProfilesPanel({ processes }: { processes: ProcessRecord[] }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("Profile");
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
    const trimmed = name.trim() || "Profile";
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
    <section className="profiles-panel" aria-label="Profiles">
      <h2>Profiles</h2>
      <div className="profile-save">
        <label>
          Profile name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Button type="button" size="sm" disabled={processes.length === 0} onClick={save}>
          Save as profile
        </Button>
      </div>
      {error && <p className="process-error">{error}</p>}
      {profiles.length === 0 ? (
        <p>No profiles</p>
      ) : (
        <ul className="profile-list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <div className="profile-heading">
                <span>{profile.name || profile.id}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => start(profile.id)}>
                  Start
                </Button>
              </div>
              {profile.processes.length === 0 ? (
                <p>No processes in this profile</p>
              ) : (
                <ul className="profile-commands">
                  {profile.processes.map((spec) => (
                    <li key={spec.id}>
                      <code>{spec.argv.join(" ")}</code>
                      {spec.cwd && <span className="profile-cwd">cwd {spec.cwd}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
