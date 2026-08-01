import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../lib/i18n";

/** Pantalla de precarga: logo con anillo giratorio + glow, título con degradado
 *  y barra de progreso. Llama onDone() al terminar la animación. */
export default function Splash({ onDone }: { onDone: () => void }) {
  const { lang } = useI18n();
  const [pct, setPct] = useState(0);
  const loadingTxt = lang === "en" ? "Loading" : "Cargando";

  useEffect(() => {
    // Progreso simulado suave hasta 100%, luego cierra.
    const start = performance.now();
    const DUR = 1900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / DUR, 1);
      // easeOutCubic
      setPct(Math.round((1 - Math.pow(1 - p, 3)) * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(onDone, 320);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#050506" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      {/* glow de fondo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 42%, rgba(0,230,118,0.16), transparent 70%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
          backgroundSize: "auto, 26px 26px",
        }}
      />

      {/* logo + anillo */}
      <div className="relative flex items-center justify-center mb-8">
        {/* halo pulsante */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 150, height: 150, background: "radial-gradient(circle, rgba(0,230,118,0.28), transparent 68%)" }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
        />
        {/* anillo giratorio (conic gradient enmascarado) */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 116, height: 116,
            background: "conic-gradient(from 0deg, transparent 0deg, #00e676 90deg, #19ff8c 180deg, transparent 300deg)",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
        />
        {/* logo */}
        <motion.img
          src="/wolf.png"
          alt="Gaming Optimizer"
          className="relative w-[78px] h-[78px]"
          style={{ filter: "drop-shadow(0 0 14px rgba(0,230,118,0.55))" }}
          initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        />
      </div>

      {/* título */}
      <motion.h1
        className="relative text-[26px] font-bold tracking-tight"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
      >
        <span style={{ color: "#ededed" }}>Gaming </span>
        <span
          style={{
            background: "linear-gradient(120deg, #19ff8c, #00e676 50%, #3b9eff)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Optimizer
        </span>
      </motion.h1>

      {/* barra de progreso */}
      <motion.div
        className="relative mt-7 w-[220px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: "#1a1a1e" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #00e676, #19ff8c)",
              boxShadow: "0 0 10px rgba(0,230,118,0.7)",
              transition: "width 90ms linear",
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[11px]" style={{ color: "#5a5a60" }}>
          <span>{loadingTxt}…</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
