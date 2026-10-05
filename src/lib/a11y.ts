import type { KeyboardEvent } from "react";

/** Para que una fila o tarjeta clicable funcione también como casilla con el teclado:
 *  se llega con Tab y se marca con Espacio o Enter (antes sólo andaba con el mouse). */
export const checkboxProps = (checked: boolean, toggle: () => void) => ({
  role: "checkbox" as const,
  "aria-checked": checked,
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // teclas dentro de un control hijo (ej. "Elegir")
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  },
});
