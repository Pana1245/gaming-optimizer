import type { RegOp } from "./engineTweaks";

// Perfiles 1-clic: bundles curados de operaciones del Motor (reversibles desde
// el Historial) + un paso extra de plan de energía (no-registro, se informa aparte).
export interface Profile {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  color: string;
  desc: string;
  descEn: string;
  bullets: string[];
  bulletsEn: string[];
  ops: RegOp[];
  planScript: string; // cambia el plan de energía
  planLabel: string;
  planLabelEn: string;
}

const SYSP = String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`;
const GAMEBAR = String.raw`HKCU:\Software\Microsoft\GameBar`;
const GAMECFG = String.raw`HKCU:\System\GameConfigStore`;
const PERSONALIZE = String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`;
const GFX = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`;

const op = (id: string, name: string, key: string, prop: string, value: number, group: string): RegOp =>
  ({ id, name, desc: "", group, key, prop, type: "DWord", value });

// Terminan con `exit $LASTEXITCODE` (el de powercfg) para que el frontend sepa si
// el plan se aplicó de verdad — powercfg es nativo y su fallo no altera `ok` solo.
const PLAN_MAX = String.raw`$hp=powercfg -list | Select-String 'Ultimate|High performance|Alto rendimiento' | Select-Object -First 1
if($hp -and "$hp" -match '([0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})'){ powercfg /setactive $matches[1]; Write-Output 'Plan: maximo rendimiento' } else { powercfg /setactive SCHEME_MAX; Write-Output 'Plan: alto rendimiento' }
exit $LASTEXITCODE`;
const PLAN_BAL = String.raw`powercfg /setactive SCHEME_BALANCED; Write-Output 'Plan: equilibrado'; exit $LASTEXITCODE`;
const PLAN_SAVE = String.raw`powercfg /setactive SCHEME_MIN; Write-Output 'Plan: ahorro de energia'; exit $LASTEXITCODE`;

export const PROFILES: Profile[] = [
  {
    id: "competitivo", name: "Competitivo", nameEn: "Competitive", emoji: "🏆", color: "#00e676",
    desc: "FPS y latencia al máximo. Para shooters y juego online serio.",
    descEn: "Max FPS and latency. For shooters and serious online play.",
    bullets: ["Plan de energía máximo", "Game Mode ON · Game DVR OFF", "GPU Scheduling (HAGS)", "CPU sin reserva para fondo", "Sin transparencias"],
    bulletsEn: ["Max power plan", "Game Mode ON · Game DVR OFF", "GPU Scheduling (HAGS)", "No CPU reserved for background", "No transparency"],
    ops: [
      op("p_gamemode", "Game Mode de Windows", GAMEBAR, "AutoGameModeEnabled", 1, "Perfil Competitivo"),
      op("p_gamedvr", "Game DVR OFF", GAMECFG, "GameDVR_Enabled", 0, "Perfil Competitivo"),
      op("p_hags", "GPU Scheduling (HAGS)", GFX, "HwSchMode", 2, "Perfil Competitivo"),
      op("p_sysresp0", "SystemResponsiveness = 0", SYSP, "SystemResponsiveness", 0, "Perfil Competitivo"),
      op("p_transp", "Transparencia OFF", PERSONALIZE, "EnableTransparency", 0, "Perfil Competitivo"),
    ],
    planScript: PLAN_MAX, planLabel: "Máximo rendimiento", planLabelEn: "Maximum performance",
  },
  {
    id: "streaming", name: "Streaming", nameEn: "Streaming", emoji: "🎥", color: "#3b9eff",
    desc: "Jugar + transmitir/grabar (OBS). Deja CPU para el encoder.",
    descEn: "Play + stream/record (OBS). Leaves CPU for the encoder.",
    bullets: ["Plan de energía máximo", "Game Mode ON · Game DVR OFF (grabás con OBS)", "GPU Scheduling (HAGS)", "Reserva un poco de CPU para el encoder"],
    bulletsEn: ["Max power plan", "Game Mode ON · Game DVR OFF (record with OBS)", "GPU Scheduling (HAGS)", "Reserves some CPU for the encoder"],
    ops: [
      op("p_gamemode", "Game Mode de Windows", GAMEBAR, "AutoGameModeEnabled", 1, "Perfil Streaming"),
      op("p_gamedvr", "Game DVR OFF", GAMECFG, "GameDVR_Enabled", 0, "Perfil Streaming"),
      op("p_hags", "GPU Scheduling (HAGS)", GFX, "HwSchMode", 2, "Perfil Streaming"),
      op("p_sysresp10", "SystemResponsiveness = 10", SYSP, "SystemResponsiveness", 10, "Perfil Streaming"),
    ],
    planScript: PLAN_MAX, planLabel: "Máximo rendimiento", planLabelEn: "Maximum performance",
  },
  {
    id: "equilibrado", name: "Equilibrado", nameEn: "Balanced", emoji: "⚖️", color: "#c8c8cc",
    desc: "Valores estándar de Windows. Para uso diario o si algo anda raro.",
    descEn: "Windows standard values. For daily use or if something acts up.",
    bullets: ["Plan de energía equilibrado", "SystemResponsiveness = 20 (default)", "Transparencias ON"],
    bulletsEn: ["Balanced power plan", "SystemResponsiveness = 20 (default)", "Transparency ON"],
    ops: [
      op("p_sysresp20", "SystemResponsiveness = 20 (default)", SYSP, "SystemResponsiveness", 20, "Perfil Equilibrado"),
      op("p_transp_on", "Transparencia ON", PERSONALIZE, "EnableTransparency", 1, "Perfil Equilibrado"),
    ],
    planScript: PLAN_BAL, planLabel: "Equilibrado", planLabelEn: "Balanced",
  },
  {
    id: "ahorro", name: "Ahorro", nameEn: "Power Saver", emoji: "🔋", color: "#ffd24a",
    desc: "Notebook o PC encendida todo el día. Menos consumo y calor.",
    descEn: "Laptop or PC on all day. Less power and heat.",
    bullets: ["Plan de ahorro de energía", "SystemResponsiveness = 20 (default)", "Sin transparencias (ahorra GPU)"],
    bulletsEn: ["Power-saver plan", "SystemResponsiveness = 20 (default)", "No transparency (saves GPU)"],
    ops: [
      op("p_sysresp20", "SystemResponsiveness = 20 (default)", SYSP, "SystemResponsiveness", 20, "Perfil Ahorro"),
      op("p_transp", "Transparencia OFF", PERSONALIZE, "EnableTransparency", 0, "Perfil Ahorro"),
    ],
    planScript: PLAN_SAVE, planLabel: "Ahorro de energía", planLabelEn: "Power saver",
  },
];
