import { useSyncExternalStore } from "react";
import { Home } from "./Home";
import { NewTable } from "./NewTable";
import { Room } from "./Room";

const roomCode = (path: string) => /^\/t\/([A-Za-z0-9]{4,8})\/?$/.exec(path)?.[1]?.toUpperCase() ?? null;

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

const subscribe = (onChange: () => void) => {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
};

export function App() {
  // An external store re-reads the path after subscribing, so a redirect made
  // by a screen while it is mounting is not missed.
  const path = useSyncExternalStore(subscribe, () => location.pathname);

  const code = roomCode(path);
  return (
    <>
      {code ? <Room key={code} code={code} /> : /^\/new\/?$/.test(path) ? <NewTable /> : <Home />}
      <div className="crt" aria-hidden="true" />
    </>
  );
}
