import { runPowershell, ledgerRead, ledgerWrite } from "./api";
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

const valExpr = (type: "DWord" | "String", v: string | number) =>
  type === "DWord" ? String(Number(v)) : `'${String(v).replace(/'/g, "''")}'`;

export function buildApply(op: RegOp): string {
  const v = valExpr(op.type, op.value);
  return `$key='${op.key}'; $name='${op.prop}'
$prior = (Get-ItemProperty -Path $key -Name $name -EA SilentlyContinue).$name
if($null -eq $prior){ Write-Output 'PRIOR=__ABSENT__' } else { Write-Output ('PRIOR=' + $prior) }
if(!(Test-Path $key)){ New-Item $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name $name -Value ${v} -Type ${op.type} -Force
$now = (Get-ItemProperty -Path $key -Name $name -EA SilentlyContinue).$name
Write-Output ('NOW=' + $now)`;
}

export function buildUndo(e: LedgerEntry): string {
  if (e.prior === "__ABSENT__")
    return `Remove-ItemProperty -Path '${e.key}' -Name '${e.prop}' -Force -EA SilentlyContinue; Write-Output OK`;
  const v = valExpr(e.type, e.prior);
  return `$key='${e.key}'; $name='${e.prop}'
if(!(Test-Path $key)){ New-Item $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name $name -Value ${v} -Type ${e.type} -Force
Write-Output OK`;
}

function parse(output: string): { prior: string; now: string } {
  let prior = "", now = "";
  for (const line of output.split("\n")) {
    const t = line.trim();
    if (t.startsWith("PRIOR=")) prior = t.slice(6);
    else if (t.startsWith("NOW=")) now = t.slice(4);
  }
  return { prior, now };
}

/** Lee el valor previo, aplica, y verifica. Devuelve el registro para el ledger. */
export async function applyOp(op: RegOp): Promise<LedgerEntry> {
  const r = await runPowershell(buildApply(op));
  const { prior, now } = parse(r.output);
  return {
    id: `${Date.now()}_${op.id}`,
    tweakId: op.id, name: op.name, key: op.key, prop: op.prop, type: op.type,
    prior, value: String(op.value), ts: Date.now(),
    verified: now === String(op.value),
  };
}

export async function undoEntry(e: LedgerEntry): Promise<boolean> {
  const r = await runPowershell(buildUndo(e));
  return r.ok;
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  try { return JSON.parse(await ledgerRead()) as LedgerEntry[]; } catch { return []; }
}
export async function saveLedger(l: LedgerEntry[]): Promise<void> {
  await ledgerWrite(JSON.stringify(l));
}
