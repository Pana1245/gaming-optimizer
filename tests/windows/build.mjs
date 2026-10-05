// Arma la prueba de fuego: copia src/ a tests/windows/.src (exportando los scripts que las
// páginas tienen como constantes internas) y empaqueta tests/windows/smoke.ts para Node,
// con las APIs de Tauri reemplazadas por tauri-mock.ts (PowerShell real, como el backend).
// Uso: node tests/windows/build.mjs  →  tests/windows/out/smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const copy = path.join(here, ".src");

// Constantes de cada archivo que la prueba necesita (en la app no se exportan).
const EXPORTS = {
  "pages/Optimizaciones.tsx": "BACKUP, ALL_CATEGORIES",
  "pages/RestaurarPage.tsx": "restoreScript",
  "pages/Chequeo.tsx": "SCAN as CHEQUEO_SCAN",
  "pages/Inicio.tsx": "LIST as STARTUP_LIST, toggleScript",
  "pages/Limpieza.tsx": "ITEMS as CLEAN_ITEMS",
  "pages/Red.tsx": "dnsScript, SAVE_DNS_PREV, RESTORE_DNS_PREV, CURRENT_DNS, CONN_TEST, TEST_SCRIPT as DNS_TEST",
  "pages/Reparar.tsx": "ACTIONS as REPAIR_ACTIONS",
  "pages/Desinstalar.tsx": "uninstallScript, scanLeftovers, deleteLeftovers, stillInstalled",
  "pages/AppsPage.tsx": "INSTALLED_NAMES",
  "pages/Reactivar.tsx": "FIXES",
  "lib/uninstall.tsx": "LIST as UNINSTALL_LIST, iconsScript",
  "lib/gameMode.tsx": "GAMER_ON, GAMER_OFF, BG_LOWER, BG_RESTORE, RECOVER",
  "components/AccountWarning.tsx": "CHECK as ACCOUNT_CHECK",
  "lib/powerDedupe.ts": "DEDUPE",
};

fs.rmSync(copy, { recursive: true, force: true });
fs.cpSync(path.join(root, "src"), copy, { recursive: true });
for (const [file, names] of Object.entries(EXPORTS)) {
  const f = path.join(copy, file);
  if (!fs.existsSync(f)) throw new Error(`no existe src/${file}`);
  fs.appendFileSync(f, `\nexport { ${names} };\n`);
}

const mock = path.join(here, "tauri-mock.ts");
const TAURI = [
  "@tauri-apps/api/core", "@tauri-apps/api/event", "@tauri-apps/api/path", "@tauri-apps/api/window",
  "@tauri-apps/api/app", "@tauri-apps/plugin-notification", "@tauri-apps/plugin-process", "@tauri-apps/plugin-updater",
];

await build({
  input: path.join(here, "smoke.ts"),
  platform: "node",
  cwd: root,
  resolve: { alias: Object.fromEntries(TAURI.map((m) => [m, mock])) },
  transform: { define: { "import.meta.env.DEV": "false" }, jsx: "react-jsx" },
  moduleTypes: { ".css": "empty" },
  logLevel: "warn",
  output: { file: path.join(here, "out", "smoke.mjs"), format: "esm", codeSplitting: false },
});
console.log("listo: tests/windows/out/smoke.mjs");
