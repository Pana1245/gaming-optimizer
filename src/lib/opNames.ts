import { ENGINE_TWEAKS, type RegOp } from "../engineTweaks";
import { GPU_OPS } from "./gpu";
import { PROFILES } from "../profiles";
import type { LedgerEntry } from "./engine";
import { pick, type Lang } from "./i18n";

// Nombre/descripción de una operación del Motor en el idioma actual.
export const opName = (op: Pick<RegOp, "name" | "nameEn" | "namePt">, lang: Lang) =>
  pick(lang, op.name, op.nameEn || undefined, op.namePt || undefined);
export const opDesc = (op: Pick<RegOp, "desc" | "descEn" | "descPt">, lang: Lang) =>
  pick(lang, op.desc, op.descEn || undefined, op.descPt || undefined);

// El historial guarda el nombre en español (así se escribió): en inglés lo buscamos
// por el id del tweak entre todas las operaciones conocidas.
const BY_ID = new Map<string, RegOp>(
  [...ENGINE_TWEAKS, ...GPU_OPS, ...PROFILES.flatMap((p) => p.ops)].map((o) => [o.id, o]),
);
export const ledgerName = (e: Pick<LedgerEntry, "tweakId" | "name">, lang: Lang) => {
  const op = BY_ID.get(e.tweakId);
  return op ? opName(op, lang) : e.name;
};
