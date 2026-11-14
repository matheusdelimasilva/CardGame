import type { GameInfo, HistoryEntry, SettingValues } from "@cardgame/protocol";
import { KEYS, storage } from "./storage";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = storage.get(KEYS.session);
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

export const api = {
  requestCode: (email: string) => call<{ devCode?: string }>("/api/auth/request", { email }),
  verify: (email: string, code: string) => call<{ token: string; email: string }>("/api/auth/verify", { email, code }),
  me: () => call<{ email: string }>("/api/me"),
  signOut: () => call<object>("/api/auth/signout", {}),
  games: () => call<{ games: GameInfo[] }>("/api/games"),
  createRoom: (gameId: string, settings: SettingValues) => call<{ code: string }>("/api/rooms", { gameId, settings }),
  roomExists: (code: string) => call<{ exists: boolean }>(`/api/rooms/${encodeURIComponent(code)}`),
  history: () => call<{ history: HistoryEntry[] }>("/api/history"),
};
