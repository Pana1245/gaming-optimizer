import { useEffect, useState } from "react";
import { getSystemInfo } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function StatusBar() {
  const [info, setInfo] = useState<{ win: string; cpu: string; gpu: string } | null>(null);
  const { lang, setLang } = useI18n();

  useEffect(() => {
    getSystemInfo()
      .then((i) => setInfo({ win: `Windows ${i.win_ver}`, cpu: i.cpu, gpu: i.gpu }))
      .catch(() => {});
  }, []);

  return (
    <div className="h-6 shrink-0 flex items-center justify-between px-3 bg-[#050505] border-t border-line text-[11px] text-text-mute select-none">
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
        <span className="text-text-mute">Gaming Optimizer v2.0.1</span>
      </div>
    </div>
  );
}
