import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app";
import { resendSender } from "./auth";

const port = Number(process.env.PORT ?? 3001);
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "CardGame <onboarding@resend.dev>";
const staticDir = resolve(process.env.STATIC_DIR ?? "packages/web/dist");

if (!apiKey && process.env.NODE_ENV === "production") {
  console.error("RESEND_API_KEY is required in production: without it sign-in codes are shown to anyone.");
  process.exit(1);
}

const app = createApp({
  dataFile: resolve(process.env.DATA_FILE ?? "data/db.json"),
  sendEmail: apiKey ? resendSender(apiKey, from) : null,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
});

app.server.listen(port, () => {
  console.log(`CardGame server on http://localhost:${port}`);
  if (!apiKey) console.log("No RESEND_API_KEY set: sign-in codes are returned by the API (development mode).");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.close();
    process.exit(0);
  });
}
