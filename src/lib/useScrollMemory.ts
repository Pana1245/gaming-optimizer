import { useEffect, useRef } from "react";

const store = new Map<string, number>();

/** Recuerda y restaura el scroll de un contenedor entre cambios de página. */
export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = store.get(key) ?? 0;
    const onScroll = () => store.set(key, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [key]);
  return ref;
}
