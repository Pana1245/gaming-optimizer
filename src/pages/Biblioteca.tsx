import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import { Page, Badge, Switch, Empty } from "../components/ui";
import { StatusLine } from "../components/Feedback";
import { useI18n } from "../lib/i18n";
import { useGameMode } from "../lib/gameMode";
import { useSharedState } from "../lib/sharedState";
import { scanGames, iconsFor, launchGame, pickExe, manualGame, steamCover, steamHeader, readGameWin, setGameWin, type Game, type GameWin } from "../lib/games";

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
  return (
    <Modal open title={`${t("lib.win.title")} — ${g.name}`} onClose={onClose}>
      <div className="whitespace-normal divide-y divide-line">{row("gpu")}{row("fso")}</div>
      <p className="text-[11.5px] text-text-mute mt-3 whitespace-normal">{t("lib.win.note")}</p>
    </Modal>
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
                    {g.exePath && (
                      <button onClick={() => setWinFor(g)} title={t("lib.win.title")} aria-label={`${t("lib.win.title")}: ${g.name}`}
                        className="absolute top-2 left-2 w-7 h-7 rounded-md bg-black/60 text-text-dim hover:text-text opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                        ⚙
                      </button>
                    )}
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
                    <button onClick={() => play(g)} className="btn btn-primary h-8 mt-auto text-[12.5px]">{t("lib.play")}</button>
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
