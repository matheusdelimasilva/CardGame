import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Store } from "./store";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_WAIT_MS = 30 * 1000;

interface PendingCode {
  code: string;
  expires: number;
  attempts: number;
  sentAt: number;
}

export type SendEmail = (to: string, code: string) => Promise<void>;

export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
    ? email
    : null;
}

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

  constructor(
    private readonly store: Store,
    private readonly sendEmail: SendEmail | null,
  ) {}

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
    if (!entry || now > entry.expires)
      return { error: "That code has expired. Ask for a new one." };
    if (++entry.attempts > MAX_ATTEMPTS) {
      this.pending.delete(email);
      return { error: "Too many wrong tries. Ask for a new code." };
    }
    const given = Buffer.from(String(code).trim().padEnd(6).slice(0, 6));
    if (!timingSafeEqual(given, Buffer.from(entry.code)))
      return { error: "That code is not right." };
    this.pending.delete(email);
    const token = randomBytes(32).toString("hex");
    this.store.data.sessions[token] = email;
    this.store.save();
    return { token };
  }

  emailFor(token: string | undefined | null): string | null {
    if (!token) return null;
    return Object.hasOwn(this.store.data.sessions, token)
      ? this.store.data.sessions[token]!
      : null;
  }

  signOut(token: string): void {
    delete this.store.data.sessions[token];
    this.store.save();
  }
}
