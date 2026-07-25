import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getSystemInfo } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useUpdater, type UpdStatus } from "../lib/updater";

export default function StatusBar() {
  const [info, setInfo] = useState<{ win: string; cpu: string; gpu: string } | null>(null);
  const [ver, setVer] = useState("");
  const [checkMsg, setCheckMsg] = useState<UpdStatus | null>(null);
  const { lang, setLang, t } = useI18n();
  const { status, checkNow } = useUpdater();

  useEffect(() => {
    getSystemInfo()
      .then((i) => setInfo({ win: `Windows ${i.win_ver}`, cpu: i.cpu, gpu: i.gpu }))
      .catch(() => {});
    getVersion().then(setVer).catch(() => {});
  }, []);

  // Chequeo manual: muestra el resultado unos segundos (si hay update, el modal aparece solo).
  const onCheck = async () => {
    const s = await checkNow();
    if (s === "none" || s === "error") {
      setCheckMsg(s);
      setTimeout(() => setCheckMsg(null), 4000);
    }
  };

  return (
    <div className="h-6 shrink-0 flex items-center justify-between px-3 bg-[#050505] border-t border-line text-[12px] text-text-mute select-none">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        <span className="truncate">
          {info ? [info.win, info.cpu, info.gpu].filter(Boolean).join("  ·  ") : "Cargando…"}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1">
          {(["es", "en"] as const).map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              {i === 1 && <span className="text-text-mute/50">/</span>}
              <button onClick={() => setLang(l)}
                className={`uppercase transition ${lang === l ? "text-accent font-medium" : "text-text-mute hover:text-text-dim"}`}>
                {l}
              </button>
            </span>
          ))}
        </div>
        {checkMsg === "none" && <span className="text-accent">{t("update.upToDate")}</span>}
        {checkMsg === "error" && <span className="text-[#ff8a65]">{t("update.error")}</span>}
        <button
          onClick={onCheck}
          disabled={status === "checking"}
          className="hover:text-text-dim transition disabled:opacity-60"
        >
          {status === "checking" ? t("update.checking") : t("update.check")}
        </button>
        <span className="text-text-mute/50">·</span>
        <span className="text-text-mute">Gaming Optimizer{ver ? ` v${ver}` : ""}</span>
      </div>
    </div>
  );
}
