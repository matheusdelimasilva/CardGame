import { lazy, Suspense, useSyncExternalStore } from "react";
import { HomeFlow } from "./home/HomeFlow";
import { useLocale } from "./i18n/locale";
import { Room } from "./Room";

const SongLibrary = lazy(() => import("./library/SongLibrary"));
// Development only: the constant is false in production builds, so the gallery is not bundled.
const GameGallery = import.meta.env.DEV
  ? lazy(() => import("./game/dev/Gallery"))
  : null;

const roomCode = (path: string) =>
  /^\/t\/([A-Za-z0-9]{4,8})\/?$/.exec(path)?.[1]?.toUpperCase() ?? null;

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

const subscribe = (onChange: () => void) => {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
};

export function App() {
  const { t } = useLocale();
  // An external store re-reads the path after subscribing, so a redirect made
  // by a screen while it is mounting is not missed.
  const path = useSyncExternalStore(subscribe, () => location.pathname);

  if (/^\/songs\/?$/.test(path))
    return (
      <Suspense
        fallback={
          <p>
            {t("Loading song library…", "Carregando a biblioteca de músicas…")}
          </p>
        }
      >
        <SongLibrary />
      </Suspense>
    );

  if (GameGallery && /^\/dev\/game\/?$/.test(path))
    return (
      <Suspense fallback={<p>Loading gallery…</p>}>
        <GameGallery />
      </Suspense>
    );

  const code = roomCode(path);
  // Home and the host's setup steps are one animated scene; the CRT
  // scanlines only belong on the table.
  return code ? <Room key={code} code={code} /> : <HomeFlow path={path} />;
}
