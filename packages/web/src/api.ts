import type { GameInfo, HistoryEntry, SettingValues } from "@cardgame/protocol";
import { translate, type Locale } from "./i18n/locale";
import { KEYS, storage } from "./storage";

class ApiError extends Error {
  constructor(
    message: string,
    readonly messagePtBR?: string,
  ) {
    super(message);
  }
}

export function formatApiError(
  error: unknown,
  locale: Locale,
  fallback: string,
): string {
  return error instanceof ApiError
    ? translate(locale, error.message, error.messagePtBR ?? error.message)
    : fallback;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = storage.get(KEYS.session);
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check your connection.",
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (typeof data?.error === "string")
      throw new ApiError(
        data.error,
        typeof data.errorPtBR === "string" ? data.errorPtBR : undefined,
      );
    throw new ApiError("Something went wrong.", "Algo deu errado.");
  }
  return data as T;
}

export const api = {
  requestCode: (email: string, locale?: Locale) =>
    call<{ devCode?: string }>("/api/auth/request", { email, locale }),
  verify: (email: string, code: string) =>
    call<{ token: string; email: string }>("/api/auth/verify", { email, code }),
  me: () => call<{ email: string }>("/api/me"),
  signOut: () => call<object>("/api/auth/signout", {}),
  games: () => call<{ games: GameInfo[] }>("/api/games"),
  createRoom: (gameId: string, settings: SettingValues) =>
    call<{ code: string }>("/api/rooms", { gameId, settings }),
  roomExists: (code: string) =>
    call<{ exists: boolean }>(`/api/rooms/${encodeURIComponent(code)}`),
  history: () => call<{ history: HistoryEntry[] }>("/api/history"),
};
