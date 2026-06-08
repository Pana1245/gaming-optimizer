import { type ReactNode, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  closeText?: string;
}

export default function Modal({
  open, title, children, onClose, onConfirm,
  confirmText = "Aceptar", closeText = "Cancelar",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") (onConfirm ?? onClose)();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onConfirm]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="w-[400px] rounded-xl bg-surface-2 border border-line-2 p-6"
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <h2 className="text-[15px] font-semibold text-text mb-2">{title}</h2>
            <div className="text-text-dim text-[13px] leading-relaxed whitespace-pre-line mb-6">
              {children}
            </div>
            <div className="flex justify-end gap-2.5">
              <button onClick={onClose} className="btn btn-ghost">
                {onConfirm ? closeText : "OK"}
              </button>
              {onConfirm && (
                <button onClick={onConfirm} className="btn btn-primary">
                  {confirmText}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
