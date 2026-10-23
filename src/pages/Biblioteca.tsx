import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import { Page, Badge, Switch, Empty } from "../components/ui";
import { StatusLine } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { useGameMode } from "../lib/gameMode";
import { useSharedState } from "../lib/sharedState";
import { scanGames, iconsFor, launchGame, pickExe, manualGame, steamCover, steamHeader, readGameWin, setGameWin, type Game, type GameWin } from "../lib/games";
import { gameAdapter, type GameAdapter, type GameCfg, type Values, type Preset, type SaveResult } from "../lib/gameSettings";

// Preferencias de la Biblioteca (sólo en esta PC): juegos agregados a mano y ocultos.
const load = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const save = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sólo esta sesión */ } };
const exeName = (g: Game) => g.exePath?.split("\\").pop()?.toLowerCase();

/** Ajustes de Windows para el .exe del juego; cada interruptor lee y escribe el registro real. */
function WinSettings({ g, onClose }: { g: Game; onClose: () => void }) {
  const { t } = useI18n();
  const [st, setSt] = useState<GameWin | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { readGameWin(g.exePath!).then(setSt).catch(() => setSt({ gpu: false, fso: false })); }, [g.exePath]);
  const flip = async (what: keyof GameWin) => {
    if (!st) return;
    setBusy(true);
    await setGameWin(g.exePath!, what, !st[what]).catch(() => false);
    setSt(await readGameWin(g.exePath!).catch(() => st));
    setBusy(false);
  };
  const row = (what: keyof GameWin) => (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-text">{t(`lib.win.${what}`)}</div>
        <div className="text-[12px] text-text-mute mt-0.5">{t(`lib.win.${what}Desc`)}</div>
      </div>
      <Switch size="sm" on={!!st?.[what]} onChange={() => flip(what)} disabled={!st || busy} label={t(`lib.win.${what}`)} />
    </div>
  );
  const adapter = gameAdapter(g);
  return (
    <Modal open wide={!!adapter} title={`${t("lib.win.title")} — ${g.name}`} onClose={onClose}>
      <div className="whitespace-normal">
        <div className="text-[11px] uppercase tracking-wider text-text-mute mb-1">Windows</div>
        <div className="divide-y divide-line">{row("gpu")}{row("fso")}</div>
        <p className="text-[11.5px] text-text-mute mt-2">{t("lib.win.note")}</p>
        {adapter && <GameOptions a={adapter} game={g.name} />}
      </div>
    </Modal>
  );
}

/** Opciones de video del juego (sus archivos de configuración, con el juego cerrado). */
function GameOptions({ a, game }: { a: GameAdapter; game: string }) {
  const { t } = useI18n();
  const tx = (s: string) => (s.startsWith("lib.") ? t(s) : s);
  const [c, setC] = useState<GameCfg<unknown> | null | undefined>(undefined);
  const [v, setV] = useState<Values>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => a.load().then((x) => { setC(x); if (x) setV(x.values); }).catch(() => setC(null));
  // Se lee al abrir (y al cambiar de juego); reload no cambia entre renders de forma relevante.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [a]);
  if (c === undefined) return <p className="text-[12px] text-text-mute mt-5">{t("lib.go.loading").replace("{g}", game)}</p>;
  if (c === null) return <p className="text-[12px] text-text-mute mt-5">{t("lib.go.none").replace("{g}", game)}</p>;
  // Sólo se guarda lo que cambió (en VALORANT una opción que falta queda "predeterminada").
  const diff = Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== "" && x !== c.values[k]));
  const changed = Object.keys(diff).length > 0;
  const run = async (fn: () => Promise<SaveResult>, okMsg: string) => {
    setBusy(true);
    const r = await fn().catch(() => "error" as const);
    setMsg(r === "ok" ? `✓ ${okMsg}` : r === "running" ? `✗ ${t("lib.go.running").replace("{g}", game)}` : r === "changed" ? `✗ ${t("lib.go.changed")}` : `✗ ${t("lib.go.error")}`);
    if (r === "ok" || r === "changed") await reload();
    setBusy(false);
  };
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="text-[11px] uppercase tracking-wider text-text-mute">{t("lib.go.game")}</div>
        <div className="text-[11.5px] text-text-mute truncate">{t(`lib.${a.id}.account`).replace("{n}", c.who)}</div>
      </div>
      {c.running && <p className="text-[12px] text-[#ffb547] mb-2">{t("lib.go.running").replace("{g}", game)}</p>}
      <div className="flex gap-2 mb-3">
        {(["low", "mid", "high"] as Preset[]).map((p) => (
          <button key={p} onClick={() => setV((x) => ({ ...x, ...a.presets[p] }))} disabled={busy} className="btn btn-ghost h-8 flex-1 text-[12.5px]">{t(`lib.go.preset.${p}`)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {a.fields.filter((f) => !f.nvidiaOnly || c.nvidia).map((f) => {
          const cur = v[f.key] ?? "";
          const known = f.opts.some(([o]) => o === cur);
          return (
            <label key={f.key} className="flex flex-col gap-1 min-w-0">
              <span className="text-[12px] text-text-dim">{t(`lib.${a.id}.f.${f.key.split("::").pop()}`)}</span>
              <select value={cur} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} disabled={busy}
                className="h-8 rounded-md bg-white/[0.04] border border-line text-[12.5px] text-text px-2 outline-none focus:border-accent">
                {cur === "" && <option value="">{t("lib.go.default")}</option>}
                {cur !== "" && !known && <option value={cur}>{cur}</option>}
                {f.opts.map(([o, l]) => <option key={o} value={o}>{tx(l)}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => run(() => a.save(c.raw, diff), t("lib.go.saved"))} disabled={busy || !changed} className="btn btn-primary h-8 text-[12.5px]">{t("lib.go.save")}</button>
        {changed && <button onClick={() => setV(c.values)} disabled={busy} className="btn btn-ghost h-8 text-[12.5px]">{t("lib.go.discard")}</button>}
        {msg && <span className="text-[12px] text-text-dim min-w-0">{msg}</span>}
        {c.hasBackup && <button onClick={() => run(() => a.restore(c.raw), t("lib.go.restored"))} disabled={busy} className="btn btn-ghost h-8 text-[12.5px] ml-auto shrink-0">{t("lib.go.restore")}</button>}
      </div>
      <p className="text-[11.5px] text-text-mute mt-2">{t(a.id === "val" ? "lib.val.note" : "lib.go.note")}</p>
    </div>
  );
}

/** Portada: la vertical de Steam, si falla la horizontal; si no, el ícono del .exe o la inicial. */
function Cover({ g }: { g: Game }) {
  const urls = g.appId ? [steamCover(g.appId), steamHeader(g.appId)] : [];
  const [i, setI] = useState(0);
  if (i < urls.length) {
    return <img src={urls[i]} alt="" loading="lazy" onError={() => setI(i + 1)}
      className={`absolute inset-0 w-full h-full ${i === 0 ? "object-cover" : "object-contain bg-black/40"}`} />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.06] to-white/[0.01]">
      {g.icon ? <img src={`data:image/png;base64,${g.icon}`} alt="" className="w-14 h-14 [image-rendering:auto]" />
        : <span className="text-[34px] font-semibold text-text-mute">{g.name.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

export default function Biblioteca() {
  const { t } = useI18n();
  const { games: gmGames, addGame, removeGame } = useGameMode();
  const [found, setFound] = useSharedState<Game[] | null>("lib_found", () => null);
  const [manual, setManual] = useState<Game[]>(() => load("lib_manual").map(manualGame));
  const [hidden, setHidden] = useState<string[]>(() => load("lib_hidden"));
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [winFor, setWinFor] = useState<Game | null>(null);

  const rescan = async () => { setBusy(true); setFound(await scanGames().catch(() => [])); setBusy(false); };
  // Se escanea una vez por sesión (tarda unos segundos); "Actualizar" vuelve a buscar.
  useEffect(() => {
    if (found !== null) return;
    let alive = true;
    scanGames().catch(() => []).then((l) => { if (alive) setFound(l); });
    return () => { alive = false; };
  }, [found, setFound]);
  // Los agregados a mano se guardan por ruta; el ícono se saca de nuevo al abrir.
  useEffect(() => {
    iconsFor(load("lib_manual")).then((m) => setManual((cur) => cur.map((g) => (m[g.exePath!] ? { ...g, icon: m[g.exePath!] } : g))));
  }, []);

  const all = [...(found ?? []), ...manual.filter((m) => !(found ?? []).some((f) => f.exePath?.toLowerCase() === m.exePath?.toLowerCase()))]
    .sort((a, b) => a.name.localeCompare(b.name));
  const visible = all.filter((g) => showHidden || !hidden.includes(g.id));
  const hiddenCount = all.filter((g) => hidden.includes(g.id)).length;

  const play = async (g: Game) => {
    setStatus(`${t("lib.launching")} ${g.name}…`);
    try { await launchGame(g); setStatus(`✓ ${t("lib.launched")} ${g.name}`); }
    catch { setStatus(`✗ ${t("lib.launchFail")} ${g.name}`); }
  };
  const add = async () => {
    const p = await pickExe();
    if (!p) return;
    const paths = load("lib_manual");
    if (!paths.some((x) => x.toLowerCase() === p.toLowerCase())) save("lib_manual", [...paths, p]);
    const g = manualGame(p);
    setManual((cur) => (cur.some((x) => x.id === g.id) ? cur : [...cur, g]));
    iconsFor([p]).then((m) => m[p] && setManual((cur) => cur.map((x) => (x.id === g.id ? { ...x, icon: m[p] } : x))));
  };
  const toggleHidden = (g: Game) => {
    if (g.source === "Manual") {
      save("lib_manual", load("lib_manual").filter((x) => x.toLowerCase() !== g.exePath!.toLowerCase()));
      setManual((cur) => cur.filter((x) => x.id !== g.id));
      return;
    }
    const n = hidden.includes(g.id) ? hidden.filter((x) => x !== g.id) : [...hidden, g.id];
    setHidden(n); save("lib_hidden", n);
  };

  return (
    <Page tkey="page.library" actions={<>
      {hiddenCount > 0 && (
        <button onClick={() => setShowHidden((v) => !v)} className="btn btn-ghost">
          {showHidden ? t("lib.hideHidden") : t("lib.showHidden").replace("{n}", String(hiddenCount))}
        </button>
      )}
      <button onClick={add} className="btn btn-ghost">{t("lib.add")}</button>
      <button onClick={rescan} disabled={busy} className="btn btn-ghost">{t("common.refresh")}</button>
    </>}>
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 pb-2">
        {found === null || (busy && !all.length) ? (
          <Empty loading>{t("lib.scanning")}</Empty>
        ) : !visible.length ? (
          <Empty>{t("lib.none")}</Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
            {visible.map((g) => {
              const exe = exeName(g);
              const watched = !!exe && gmGames.includes(exe);
              const isHidden = hidden.includes(g.id);
              return (
                <div key={g.id} className={`group rounded-xl border border-line bg-white/[0.02] overflow-hidden flex flex-col ${isHidden ? "opacity-50" : ""}`}>
                  <div className="relative aspect-[2/3] bg-black/30">
                    <Cover g={g} />
                    <button onClick={() => toggleHidden(g)} title={g.source === "Manual" ? t("lib.remove") : isHidden ? t("lib.unhide") : t("lib.hide")}
                      aria-label={g.source === "Manual" ? t("lib.remove") : isHidden ? t("lib.unhide") : t("lib.hide")}
                      className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/60 text-text-dim hover:text-text opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                      {isHidden ? "↺" : "✕"}
                    </button>
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-text truncate" title={g.name}>{g.name}</div>
                      <Badge className="mt-1">{g.source === "Manual" ? t("lib.manual") : g.source}</Badge>
                    </div>
                    {exe && (
                      <label className="flex items-center justify-between gap-2 text-[11.5px] text-text-mute" title={exe}>
                        Auto Game-Mode
                        <Switch size="sm" on={watched} onChange={() => (watched ? removeGame(exe) : addGame(exe))} label={`Auto Game-Mode: ${g.name}`} />
                      </label>
                    )}
                    <div className="flex gap-1.5 mt-auto">
                      <button onClick={() => play(g)} className="btn btn-primary h-8 flex-1 text-[12.5px]">{t("lib.play")}</button>
                      {g.exePath && (
                        <button onClick={() => setWinFor(g)} title={t("lib.win.title")} aria-label={`${t("lib.win.title")}: ${g.name}`}
                          className="btn btn-ghost h-8 w-9 px-0 text-[15px]">⚙</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StatusLine working={false} text={status} />
      {winFor && <WinSettings g={winFor} onClose={() => setWinFor(null)} />}
    </Page>
  );
}
