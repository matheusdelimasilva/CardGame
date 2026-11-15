import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Store } from "./store";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_WAIT_MS = 30 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IP_WINDOW_MS = 10 * 60 * 1000;

interface PendingCode {
  code: string;
  expires: number;
  attempts: number;
  sentAt: number;
}

export type SendEmail = (to: string, code: string) => Promise<void>;

/** Sends through Resend when a key is configured. */
export function resendSender(apiKey: string, from: string): SendEmail {
  return async (to, code) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `${code} is your CardGame sign-in code`,
        text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) throw new Error(`Email provider answered ${res.status}`);
  };
}

export class Auth {
  private pending = new Map<string, PendingCode>();
  private requests = new Map<string, { count: number; expires: number }>();

  constructor(
    private readonly store: Store,
    private readonly sendEmail: SendEmail | null,
  ) {}

  allowRequest(ip: string, now = Date.now()): boolean {
    let entry = this.requests.get(ip);
    if (!entry || now >= entry.expires) {
      entry = { count: 0, expires: now + IP_WINDOW_MS };
      this.requests.set(ip, entry);
    }
    return ++entry.count <= 5;
  }

  prune(now = Date.now()): void {
    for (const [email, entry] of this.pending) {
      if (now >= entry.expires) this.pending.delete(email);
    }
    for (const [ip, entry] of this.requests) {
      if (now >= entry.expires) this.requests.delete(ip);
    }
    for (const [token, session] of Object.entries(this.store.data.sessions)) {
      if (now - session.lastUsed >= SESSION_TTL_MS) {
        delete this.store.data.sessions[token];
        this.store.save({ sessions: [token] });
      }
    }
  }

  /** Without an email sender (local development) the code is returned to the caller. */
  async requestCode(
    email: string,
    now = Date.now(),
  ): Promise<{ error?: string; devCode?: string }> {
    const previous = this.pending.get(email);
    if (previous && now - previous.sentAt < RESEND_WAIT_MS) {
      return {
        error: "A code was just sent. Wait a moment before asking for another.",
      };
    }
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    this.pending.set(email, {
      code,
      expires: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
    });
    if (!this.sendEmail) return { devCode: code };
    try {
      await this.sendEmail(email, code);
    } catch (err) {
      console.error("Sending the sign-in email failed:", err);
      this.pending.delete(email);
      return { error: "We could not send the email. Try again." };
    }
    return {};
  }

  verify(
    email: string,
    code: string,
    now = Date.now(),
  ): { token?: string; error?: string } {
    const entry = this.pending.get(email);
    if (!entry || now >= entry.expires) {
      this.pending.delete(email);
      return { error: "That code has expired. Ask for a new one." };
    }
    if (++entry.attempts > MAX_ATTEMPTS) {
      this.pending.delete(email);
      return { error: "Too many wrong tries. Ask for a new code." };
    }
    if (!/^\d{6}$/.test(code)) return { error: "That code is not right." };
    const given = Buffer.from(code);
    if (!timingSafeEqual(given, Buffer.from(entry.code)))
      return { error: "That code is not right." };
    this.pending.delete(email);
    const token = randomBytes(32).toString("hex");
    this.store.data.sessions[token] = { email, lastUsed: now };
    this.store.save({ sessions: [token] });
    return { token };
  }

  emailFor(token: string | undefined | null, now = Date.now()): string | null {
    if (!token) return null;
    if (!Object.hasOwn(this.store.data.sessions, token)) return null;
    const session = this.store.data.sessions[token]!;
    if (now - session.lastUsed >= SESSION_TTL_MS) {
      delete this.store.data.sessions[token];
      this.store.save({ sessions: [token] });
      return null;
    }
    session.lastUsed = now;
    this.store.save({ sessions: [token] });
    return session.email;
  }

  signOut(token: string): void {
    delete this.store.data.sessions[token];
    this.store.save({ sessions: [token] });
  }
}
