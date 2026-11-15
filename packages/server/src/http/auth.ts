import {
  clientIp,
  readBody,
  requestCodeSchema,
  verifyCodeSchema,
} from "../http";
import { json, sessionEmail, type HttpContext, type Route } from "./context";

/** Sign-in, sign-out and session routes, including the per-IP request limit. */
export function authRoutes({ auth }: HttpContext): Route[] {
  return [
    {
      method: "POST",
      path: "/api/auth/request",
      async handler(req, res) {
        if (!auth.allowRequest(clientIp(req))) {
          req.resume();
          return json(res, 429, {
            error: "Too many sign-in requests. Try again later.",
          });
        }
        const { email } = await readBody(req, requestCodeSchema);
        const result = await auth.requestCode(email);
        json(res, result.error ? 429 : 200, result);
      },
    },
    {
      method: "POST",
      path: "/api/auth/verify",
      async handler(req, res) {
        const { email, code } = await readBody(req, verifyCodeSchema);
        const result = auth.verify(email, code);
        json(
          res,
          result.error ? 400 : 200,
          result.error ? result : { ...result, email },
        );
      },
    },
    {
      method: "GET",
      path: "/api/me",
      handler(req, res) {
        const email = sessionEmail(req, auth);
        if (email) json(res, 200, { email });
        else json(res, 401, { error: "Not signed in." });
      },
    },
    {
      method: "POST",
      path: "/api/auth/signout",
      handler(req, res) {
        const header = req.headers.authorization ?? "";
        if (header.startsWith("Bearer ")) auth.signOut(header.slice(7));
        json(res, 200, {});
      },
    },
  ];
}
