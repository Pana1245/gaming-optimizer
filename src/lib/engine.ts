import { regApply, regUndo, ledgerRead, ledgerWrite } from "./api";
import type { RegOp } from "../engineTweaks";

export interface LedgerEntry {
  id: string;
  tweakId: string;
  name: string;
  key: string;
  prop: string;
  type: "DWord" | "String";
  prior: string;   // "__ABSENT__" o el valor previo
  value: string;   // valor aplicado
  ts: number;
  verified: boolean;
  undone?: boolean;
}

/** Lee el valor previo, aplica y verifica — NATIVO (Rust/winreg), sin PowerShell.
 *  Atómico y sin problemas de escaping/spawn. Devuelve la entrada para el ledger. */
export async function applyOp(op: RegOp): Promise<LedgerEntry> {
  const r = await regApply(op.key, op.prop, op.type, String(op.value));
  if (!r.ok) throw new Error("No se pudo escribir el registro");
  // Si no se leyó el valor previo de un DWord, no persistimos una entrada
  // "reversible" engañosa: deshacerla podría escribir un valor equivocado.
  if (r.prior === "" && op.type === "DWord")
    throw new Error("No se pudo leer el valor previo; se aborta para no dañar el registro al deshacer");
  return {
    id: `${Date.now()}_${op.id}`,
    tweakId: op.id, name: op.name, key: op.key, prop: op.prop, type: op.type,
    prior: r.prior, value: String(op.value), ts: Date.now(),
    verified: r.now === String(op.value),
  };
}

/** Deshace una entrada del ledger — nativo. Si el valor no existía, lo borra. */
export async function undoEntry(e: LedgerEntry): Promise<boolean> {
  return await regUndo(e.key, e.prop, e.type, e.prior);
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  try { return JSON.parse(await ledgerRead()) as LedgerEntry[]; } catch { return []; }
}
export async function saveLedger(l: LedgerEntry[]): Promise<void> {
  await ledgerWrite(JSON.stringify(l));
}
