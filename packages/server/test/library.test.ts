import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
let app: ReturnType<typeof createApp> | undefined;
afterEach(async () => {
  await app?.close();
});
it("streams catalog previews and rejects arbitrary IDs without upstream calls", async () => {
  const upstream = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (String(input).includes("api.deezer.com"))
      return new Response(
        JSON.stringify({
          id: 4046433,
          title: "Riders in the Sky",
          artist: { name: "Vaughn Monroe" },
          preview: "https://cdn.example/preview.mp3?hdnea=exp=9999999999",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    return new Response("preview bytes", {
      headers: { "Content-Type": "audio/mpeg" },
    });
  });
  app = createApp({ dataFile: null, sendEmail: null, fetch: upstream });
  await app.ready;
  await new Promise<void>((resolve) =>
    app!.server.listen(0, "127.0.0.1", resolve),
  );
  const address = app.server.address();
  if (!address || typeof address === "string")
    throw new Error("No server address");
  const url = `http://127.0.0.1:${address.port}/api/library/preview/`;
  expect((await fetch(url + "99999999999999")).status).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
  const response = await fetch(url + "4046433");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("audio/mpeg");
  expect(await response.text()).toBe("preview bytes");
});
