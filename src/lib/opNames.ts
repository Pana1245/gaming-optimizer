import { ENGINE_TWEAKS, type RegOp } from "../engineTweaks";
import { GPU_OPS } from "./gpu";
import { PROFILES } from "../profiles";
import type { LedgerEntry } from "./engine";

// Nombre/descripción de una operación del Motor en el idioma actual.
export const opName = (op: Pick<RegOp, "name" | "nameEn">, lang: string) =>
  (lang === "en" && op.nameEn) || op.name;
export const opDesc = (op: Pick<RegOp, "desc" | "descEn">, lang: string) =>
  (lang === "en" && op.descEn) || op.desc;

// El historial guarda el nombre en español (así se escribió): en inglés lo buscamos
// por el id del tweak entre todas las operaciones conocidas.
const BY_ID = new Map<string, RegOp>(
  [...ENGINE_TWEAKS, ...GPU_OPS, ...PROFILES.flatMap((p) => p.ops)].map((o) => [o.id, o]),
);
export const ledgerName = (e: Pick<LedgerEntry, "tweakId" | "name">, lang: string) => {
  const op = BY_ID.get(e.tweakId);
  return op ? opName(op, lang) : e.name;
};
