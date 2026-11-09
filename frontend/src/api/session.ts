export const TOKEN_STORAGE_KEY = "ros-studio-token";

export interface TokenHash {
  token: string | null;
  hash: string;
}

export function readTokenFromHash(
  hash: string,
  storage: Storage = sessionStorage,
): TokenHash {
  if (!hash) {
    return { token: null, hash: "" };
  }
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token");
  if (!token) {
    return { token: null, hash };
  }
  storage.setItem(TOKEN_STORAGE_KEY, token);
  params.delete("token");
  const rest = params.toString();
  return { token, hash: rest ? `#${rest}` : "" };
}

export function getToken(storage: Storage = sessionStorage): string | null {
  return storage.getItem(TOKEN_STORAGE_KEY);
}
