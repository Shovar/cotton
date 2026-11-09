import { getToken } from "./session";

export type HttpMethod = "POST" | "PUT" | "DELETE";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isErrorEnvelope(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (isErrorEnvelope(body)) {
      return new ApiError(body.code, body.message, response.status);
    }
  } catch {
    // Non-JSON error bodies fall back to the HTTP status below.
  }
  return new ApiError("internal_error", response.statusText || "Request failed", response.status);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let payload: string | undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const response = await fetch(path, { method, headers, body: payload });
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiSend<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body);
}
