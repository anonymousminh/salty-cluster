import { useCallback, useEffect, useRef, useState } from "react";

/** Poll `fn` every `ms` while the tab is visible. Simple and robust on conference Wi-Fi. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(undefined);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, ms);
    return () => clearInterval(id);
  }, [ms, refresh, ...deps]);

  return { data, error, refresh };
}

export interface Route {
  path: string;
  params: URLSearchParams;
}

const parse = (): Route => {
  const [path, qs] = (window.location.hash.slice(1) || "/").split("?");
  return { path: path || "/", params: new URLSearchParams(qs) };
};

/** Hash routing, so QR codes work on any static host without server rewrites. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function storage(key: string) {
  return {
    get: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* private mode: the player stays in memory only */
      }
    },
    remove: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const playerStore = storage("salty.player");
