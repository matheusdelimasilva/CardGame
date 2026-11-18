/** localStorage that never throws (private windows, blocked storage). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Nothing to do: the app still works for this visit.
    }
  },
};

export const KEYS = {
  session: "cg:session",
  email: "cg:email",
  name: "cg:name",
  locale: "cg:locale",
  member: (code: string) => `cg:member:${code}`,
};
