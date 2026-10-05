import { useCallback, useSyncExternalStore } from "react";

// Estado que sobrevive al cambio de sección. Las páginas se desmontan al navegar: una
// tarea larga (aplicar optimizaciones, limpiar) seguía corriendo, pero al volver la página
// arrancaba de cero ("Listo.", botón habilitado) y se podía lanzar otra encima. Con este
// hook el registro, el progreso y el "trabajando" viven a nivel de la app.
const store = new Map<string, unknown>();
const subs = new Map<string, Set<() => void>>();

function setShared<T>(key: string, v: T | ((prev: T) => T)) {
  const prev = store.get(key) as T;
  const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
  if (Object.is(next, prev)) return;
  store.set(key, next);
  subs.get(key)?.forEach((f) => f());
}

/** Como useState, pero compartido por `key` y persistente mientras la app está abierta. */
export function useSharedState<T>(key: string, init: () => T) {
  if (!store.has(key)) store.set(key, init());
  const subscribe = useCallback((cb: () => void) => {
    let set = subs.get(key);
    if (!set) subs.set(key, (set = new Set()));
    set.add(cb);
    return () => { set!.delete(cb); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => store.get(key) as T);
  const set = useCallback((v: T | ((prev: T) => T)) => setShared(key, v), [key]);
  return [value, set] as const;
}
