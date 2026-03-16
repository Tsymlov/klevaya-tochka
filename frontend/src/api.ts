import type { AuthUser, Spot } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

function buildUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }

  const response = await fetch(buildUrl(path), {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.non_field_errors)
          ? payload.non_field_errors.join(" ")
          : typeof payload === "object" && payload !== null
            ? Object.values(payload)
                .flat()
                .join(" ")
            : "Запрос завершился ошибкой.";
    throw new Error(detail);
  }

  return payload as T;
}

export async function ensureCsrfCookie(): Promise<void> {
  await request<{ detail: string }>("/api/auth/csrf/");
}

export function getCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me/", { signal });
}

export async function registerUser(payload: {
  username: string;
  password: string;
  password_confirm: string;
}): Promise<AuthUser> {
  await ensureCsrfCookie();
  return request<AuthUser>("/api/auth/register/", {
    method: "POST",
    body: payload,
  });
}

export async function loginUser(payload: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  await ensureCsrfCookie();
  return request<AuthUser>("/api/auth/login/", {
    method: "POST",
    body: payload,
  });
}

export async function logoutUser(): Promise<AuthUser> {
  await ensureCsrfCookie();
  return request<AuthUser>("/api/auth/logout/", {
    method: "POST",
  });
}

export function listSpots(bbox: string, signal?: AbortSignal): Promise<Spot[]> {
  return request<Spot[]>(`/api/spots/?bbox=${encodeURIComponent(bbox)}`, {
    signal,
  });
}

export async function createSpot(payload: {
  latitude: number;
  longitude: number;
  description: string;
}): Promise<Spot> {
  await ensureCsrfCookie();
  return request<Spot>("/api/spots/", {
    method: "POST",
    body: payload,
  });
}

export async function updateSpot(
  id: number,
  payload: {
    description: string;
  }
): Promise<Spot> {
  await ensureCsrfCookie();
  return request<Spot>(`/api/spots/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteSpot(id: number): Promise<void> {
  await ensureCsrfCookie();
  await request(`/api/spots/${id}/`, {
    method: "DELETE",
  });
}
