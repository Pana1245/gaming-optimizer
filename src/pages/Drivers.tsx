import { useState } from "react";
import { motion } from "framer-motion";
import { Page, Badge, type Tone } from "../components/ui";
import { IconChip } from "../components/icons";
import { useI18n } from "../lib/i18n";
import { scanDrivers, analyze, openUrl, cmpVer, type Result, type Item, type Status } from "../lib/drivers";

// El resultado queda a nivel de módulo: al volver a la sección se sigue viendo el último escaneo.
let last: Result | null = null;

const ORDER: Status[] = ["missing", "update", "generic", "old", "ok", "installed"];
const TONE: Record<Status, Tone> = { missing: "danger", update: "warn", generic: "warn", old: "warn", ok: "ok", installed: "neutral" };
const ICON: Record<string, string> = { video: "🎮", net: "🌐", audio: "🔊", chipset: "🧩", storage: "💾", bt: "📶", bios: "🖥️", missing: "❓" };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export default function Drivers() {
  const { t, lang } = useI18n();
  const [res, setRes] = useState<Result | null>(last);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const run = async () => {
    setBusy(true); setErr(false);
    try {
      const r = await analyze(await scanDrivers());
      last = r; setRes(r);
    } catch { setErr(true); }
    setBusy(false);
  };

  const locale = lang === "en" ? "en-US" : lang === "pt" ? "pt-BR" : "es-AR";
  const fmtDate = (d: string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { month: "short", year: "numeric" }) : "";
  const verDate = (v: string, d: string) => [v, d && `(${fmtDate(d)})`].filter(Boolean).join(" ");

  const label = (it: Item) => {
    if (it.cat === "net") return t(it.sub === "wifi" ? "drv.cat.wifi" : "drv.cat.lan");
    if (it.cat === "chipset") return t(`drv.cat.chipset.${it.sub ?? "inf"}`);
    return t(`drv.cat.${it.cat}`);
  };
  const detail = (it: Item) => {
    const inst = verDate(it.version, it.date);
    switch (it.status) {
      case "missing": return t("drv.d.missing");
      case "update": return fill(t("drv.d.update"), { inst, latest: verDate(it.latest!.version, it.latest!.date) });
      case "generic": return t("drv.d.generic");
      case "old": return fill(t(it.cat === "bios" ? "drv.d.oldBios" : "drv.d.old"), { inst, year: it.date.slice(0, 4) });
      case "ok":
        if (!it.latest) return inst;
        return fill(t(cmpVer(it.version, it.latest.version) > 0 ? "drv.d.newer" : "drv.d.ok"), { inst, latest: it.latest.version });
      default: return it.latest && it.sub === "inf" ? fill(t("drv.d.inf"), { inst, latest: it.latest.version }) : inst;
    }
  };

  const items = res ? [...res.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) : [];
  const count = (...s: Status[]) => items.filter((i) => s.includes(i.status)).length;

  return (
    <Page tkey="page.drivers" actions={res && (
      <button onClick={run} disabled={busy} className="btn btn-primary px-5">{busy ? t("drv.scanning") : t("drv.again")}</button>
    )}>
      <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
        {err && <p className="text-[13px] text-[#ff5470] mb-3">{t("drv.err")}</p>}

        {!busy && !res && (
          <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center">
            <span className="w-14 h-14 rounded-2xl grid place-items-center bg-accent/[0.08] border border-accent/20 text-accent mb-5 [&_svg]:w-7 [&_svg]:h-7"><IconChip /></span>
            <div className="text-[17px] font-semibold text-text">{t("drv.emptyTitle")}</div>
            <p className="text-[13px] text-text-mute mt-1.5 max-w-[480px] leading-relaxed">{t("drv.intro")}</p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-5 max-w-[520px]">
              {["video", "lan", "audio", "chipset.inf", "storage", "bt", "bios"].map((k) => <Badge key={k}>{t(`drv.cat.${k}`)}</Badge>)}
            </div>
            <button onClick={run} className="btn btn-primary px-6 mt-7">{t("drv.run")}</button>
            <p className="text-[12px] text-text-mute mt-4 max-w-[440px]">{t("drv.noInstall")}</p>
          </div>
        )}

        {busy && !res && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-mute text-[13px]">
            <motion.div className="w-12 h-12 rounded-full border-2 border-accent/30 border-t-accent"
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
            {t("drv.scanningLong")}
          </div>
        )}

        {res && (
          <div className={`transition-opacity ${busy ? "opacity-50" : ""}`}>
            {/* Placa madre + fuente de la comparación */}
            <div className="rounded-xl border border-line bg-surface px-5 py-4 mb-4 flex items-center gap-4">
              <span className="w-10 h-10 rounded-lg grid place-items-center bg-white/[0.04] border border-line text-text-dim shrink-0 [&_svg]:w-5 [&_svg]:h-5"><IconChip /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-text truncate">{res.boardName}</div>
                <div className="text-[12.5px] text-text-mute mt-0.5">
                  {res.osLabel} · {res.compared ? fill(t("drv.srcCompared"), { src: res.boardLink.src }) : fill(t("drv.srcAge"), { src: res.boardLink.src })}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button onClick={() => openUrl(res.boardLink.url)} className="btn btn-ghost">{fill(t("drv.boardPage"), { src: res.boardLink.src })} ↗</button>
                {res.searchLink && <button onClick={() => openUrl(res.searchLink!.url)} className="text-[12px] text-text-mute hover:text-text-dim">{t("drv.notYourModel")}</button>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4 text-[13px]">
              {count("missing") > 0 && <Badge tone="danger">{count("missing")} {t("drv.nMissing")}</Badge>}
              {count("update") > 0 && <Badge tone="warn">{count("update")} {t("drv.nUpdate")}</Badge>}
              {count("old", "generic") > 0 && <Badge tone="warn">{count("old", "generic")} {t("drv.nCheck")}</Badge>}
              <Badge tone="ok">{count("ok", "installed")} {t("drv.nOk")}</Badge>
            </div>

            <div className="space-y-2">
              {items.map((it, i) => {
                const attention = it.status === "missing" || it.status === "update" || it.status === "old" || it.status === "generic";
                return (
                  <motion.div key={it.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                    className={`flex items-center gap-3.5 rounded-xl border px-4 py-3.5 ${attention ? "border-line-2 bg-surface" : "border-line bg-white/[0.012]"}`}>
                    <span className="text-[18px] w-7 text-center shrink-0">{ICON[it.cat]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[12px] text-text-mute shrink-0">{label(it)}</span>
                        <span className={`text-[14px] font-medium truncate ${attention ? "text-text" : "text-text-dim"}`}>{it.cat === "bios" ? res.boardName : it.name}</span>
                      </div>
                      <div className="text-[12.5px] text-text-mute mt-0.5 leading-relaxed">
                        {detail(it)}
                        {it.cat === "bios" && it.status === "update" && <span className="block text-[#f5b454]/90">{t("drv.biosWarn")}</span>}
                      </div>
                    </div>
                    <Badge tone={TONE[it.status]} className="shrink-0">{t(`drv.st.${it.status}`)}</Badge>
                    {it.link && (attention
                      ? <button onClick={() => openUrl(it.link!.url)} className={`btn shrink-0 ${it.status === "update" || it.status === "missing" ? "btn-primary" : "btn-ghost"}`}>
                          {fill(t(it.status === "update" && it.cat !== "bios" ? "drv.btn.get" : "drv.btn.view"), { src: it.link.src })} ↗
                        </button>
                      : <button onClick={() => openUrl(it.link!.url)} className="text-[12.5px] text-text-mute hover:text-text-dim shrink-0 w-[92px] text-right">{t("drv.btn.official")} ↗</button>)}
                  </motion.div>
                );
              })}
            </div>
            <p className="text-[12px] text-text-mute mt-4">{t("drv.noInstall")}</p>
          </div>
        )}
      </div>
    </Page>
  );
}
