import type { IncomingMessage } from "node:http";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const requestCodeSchema = z.object({
  email,
  locale: z.enum(["en", "pt-BR"]).optional(),
});
export const verifyCodeSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/),
});
export const createRoomSchema = z.object({
  gameId: z.string().min(1),
  settings: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
});

export async function readBody<T>(
  req: IncomingMessage,
  schema: z.ZodType<T>,
): Promise<T> {
  const body = await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 10_000) {
        chunks.length = 0;
        reject(new HttpError(413, "Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (bytes > 10_000) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Malformed JSON."));
      }
    });
    req.on("error", () =>
      reject(new HttpError(400, "Could not read request body.")),
    );
    req.on("aborted", () => reject(new HttpError(400, "Request aborted.")));
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Invalid request body.");
  return result.data;
}

export function clientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers["x-forwarded-for"];
    const address = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(",")[0]
      ?.trim();
    if (address) return address;
  }
  return req.socket.remoteAddress ?? "unknown";
}
