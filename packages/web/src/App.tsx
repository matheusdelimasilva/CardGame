import { useEffect, useState } from "react";
import { Home } from "./Home";
import { Room } from "./Room";

const roomCode = (path: string) => /^\/t\/([A-Za-z0-9]{4,8})\/?$/.exec(path)?.[1]?.toUpperCase() ?? null;

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const code = roomCode(path);
  return (
    <>
      {code ? <Room key={code} code={code} /> : <Home />}
      <div className="crt" aria-hidden="true" />
    </>
  );
}
