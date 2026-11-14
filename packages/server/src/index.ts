import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { resendSender } from "./auth";

const port = Number(process.env.PORT ?? 3001);
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "CardGame <onboarding@resend.dev>";
// Defaults are relative to the repository root, wherever the server is started from.
const root = fileURLToPath(new URL("../../..", import.meta.url));
const staticDir = resolve(process.env.STATIC_DIR ?? `${root}/packages/web/dist`);

if (!apiKey && process.env.NODE_ENV === "production") {
  console.error("RESEND_API_KEY is required in production: without it sign-in codes are shown to anyone.");
  process.exit(1);
}

const app = createApp({
  dataFile: resolve(process.env.DATA_FILE ?? `${root}/data/db.json`),
  sendEmail: apiKey ? resendSender(apiKey, from) : null,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
});

try {
  await app.ready;
} catch (err) {
  await app.close().catch(() => {});
  throw err;
}

app.server.listen(port, () => {
  console.log(`CardGame server on http://localhost:${port}`);
  if (!apiKey) console.log("No RESEND_API_KEY set: sign-in codes are returned by the API (development mode).");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(
      () => process.exit(0),
      (err) => {
        console.error("Flushing server data failed:", err);
        process.exit(1);
      },
    );
  });
}
