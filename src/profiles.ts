import type { RegOp } from "./engineTweaks";
import { MAX_PLAN } from "./lib/powerDedupe";
import type { Preset } from "./lib/gameSettings";

// Perfiles 1-clic: bundles curados de operaciones del Motor (reversibles desde
// el Historial) + un paso extra de plan de energía (no-registro, se informa aparte).
export interface Profile {
  id: string;
  name: string;
  nameEn: string;
  namePt: string;
  emoji: string;
  color: string;
  desc: string;
  descEn: string;
  descPt: string;
  bullets: string[];
  bulletsEn: string[];
  bulletsPt: string[];
  ops: RegOp[];
  planScript: string; // cambia el plan de energía
  planLabel: string;
  planLabelEn: string;
  planLabelPt: string;
  gmPro: boolean;     // Auto Game-Mode: Power (baja las apps de fondo elegidas) o Lite
  games?: { preset?: Preset; fps?: string }; // opciones de video de los juegos (si el usuario lo marca); fps "max" = sin límite
}

const SYSP = String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`;
const GAMEBAR = String.raw`HKCU:\Software\Microsoft\GameBar`;
const GAMECFG = String.raw`HKCU:\System\GameConfigStore`;
const PERSONALIZE = String.raw`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`;
const GFX = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`;

// Nombres en inglés de las ops de perfil que no son iguales en ambos idiomas.
const OP_EN: Record<string, string> = {"Game Mode de Windows": "Windows Game Mode", "Transparencia OFF": "Transparency OFF", "Transparencia ON": "Transparency ON"};
const OP_PT: Record<string, string> = {"Game Mode de Windows": "Modo de Jogo do Windows", "Transparencia OFF": "Transparência OFF", "Transparencia ON": "Transparência ON"};
const op = (id: string, name: string, key: string, prop: string, value: number, group: string): RegOp =>
  ({ id, name, nameEn: OP_EN[name] ?? name, namePt: OP_PT[name] ?? OP_EN[name] ?? name, desc: "", group, key, prop, type: "DWord", value });

// Terminan con `exit $LASTEXITCODE` (el de powercfg) para que el frontend sepa si
// el plan se aplicó de verdad — powercfg es nativo y su fallo no altera `ok` solo.
const PLAN_MAX = String.raw`${MAX_PLAN}
$pc=$LASTEXITCODE; Write-Output 'Plan: maximo rendimiento'
exit $pc`;
// Rango de núcleos de Core Parking (versiones viejas lo dejaban fijo en 100% para todos los planes).
const CP_RANGE = String.raw`$cpr='HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583'; if((Get-ItemProperty $cpr -Name ValueMin -EA SilentlyContinue).ValueMin -eq 100){ Set-ItemProperty $cpr -Name ValueMin -Value 0 -Type DWord -Force -EA SilentlyContinue }`;
const PLAN_BAL = String.raw`${CP_RANGE}
powercfg /setactive SCHEME_BALANCED; Write-Output 'Plan: equilibrado'; exit $LASTEXITCODE`;
const PLAN_SAVE = String.raw`${CP_RANGE}
powercfg /setactive a1841308-3541-4fab-bc81-f71556f20b4a; Write-Output 'Plan: ahorro de energia'; exit $LASTEXITCODE`;

export const PROFILES: Profile[] = [
  {
    id: "competitivo", name: "Competitivo", nameEn: "Competitive", namePt: "Competitivo", emoji: "🏆", color: "#00e676",
    desc: "FPS y latencia al máximo. Para shooters y juego online serio.",
    descEn: "Max FPS and latency. For shooters and serious online play.",
    descPt: "FPS e latência no máximo. Para shooters e jogo online sério.",
    bullets: ["Plan de energía máximo", "Game Mode ON · Game DVR OFF", "GPU Scheduling (HAGS)", "CPU sin reserva para fondo", "Sin transparencias", "Auto Game-Mode: Power (baja tus apps de fondo)", "Juegos: Máximo FPS, sin límite de FPS (opcional)"],
    bulletsEn: ["Max power plan", "Game Mode ON · Game DVR OFF", "GPU Scheduling (HAGS)", "No CPU reserved for background", "No transparency", "Auto Game-Mode: Power (lowers your background apps)", "Games: Max FPS, no FPS limit (optional)"],
    bulletsPt: ["Plano de energia máximo", "Game Mode ON · Game DVR OFF", "GPU Scheduling (HAGS)", "Sem reserva de CPU para segundo plano", "Sem transparências", "Auto Game-Mode: Power (reduz seus apps em segundo plano)", "Jogos: Máximo FPS, sem limite de FPS (opcional)"],
    ops: [
      op("p_gamemode", "Game Mode de Windows", GAMEBAR, "AutoGameModeEnabled", 1, "Perfil Competitivo"),
      op("p_gamedvr", "Game DVR OFF", GAMECFG, "GameDVR_Enabled", 0, "Perfil Competitivo"),
      op("p_hags", "GPU Scheduling (HAGS)", GFX, "HwSchMode", 2, "Perfil Competitivo"),
      op("p_sysresp0", "SystemResponsiveness = 0", SYSP, "SystemResponsiveness", 0, "Perfil Competitivo"),
      op("p_transp", "Transparencia OFF", PERSONALIZE, "EnableTransparency", 0, "Perfil Competitivo"),
    ],
    planScript: PLAN_MAX, planLabel: "Máximo rendimiento", planLabelEn: "Maximum performance", planLabelPt: "Desempenho máximo",
    gmPro: true, games: { preset: "low", fps: "max" },
  },
  {
    id: "streaming", name: "Streaming", nameEn: "Streaming", namePt: "Streaming", emoji: "🎥", color: "#3b9eff",
    desc: "Jugar + transmitir/grabar (OBS). Deja CPU para el encoder.",
    descEn: "Play + stream/record (OBS). Leaves CPU for the encoder.",
    descPt: "Jogar + transmitir/gravar (OBS). Deixa CPU para o encoder.",
    bullets: ["Plan de energía máximo", "Game Mode ON · Game DVR OFF (grabás con OBS)", "GPU Scheduling (HAGS)", "Reserva un poco de CPU para el encoder", "Auto Game-Mode: Lite (no frena al OBS)", "Juegos: Equilibrado (opcional)"],
    bulletsEn: ["Max power plan", "Game Mode ON · Game DVR OFF (record with OBS)", "GPU Scheduling (HAGS)", "Reserves some CPU for the encoder", "Auto Game-Mode: Lite (doesn't slow OBS down)", "Games: Balanced (optional)"],
    bulletsPt: ["Plano de energia máximo", "Game Mode ON · Game DVR OFF (grave com o OBS)", "GPU Scheduling (HAGS)", "Reserva um pouco de CPU para o encoder", "Auto Game-Mode: Lite (não atrapalha o OBS)", "Jogos: Equilibrado (opcional)"],
    ops: [
      op("p_gamemode", "Game Mode de Windows", GAMEBAR, "AutoGameModeEnabled", 1, "Perfil Streaming"),
      op("p_gamedvr", "Game DVR OFF", GAMECFG, "GameDVR_Enabled", 0, "Perfil Streaming"),
      op("p_hags", "GPU Scheduling (HAGS)", GFX, "HwSchMode", 2, "Perfil Streaming"),
      op("p_sysresp10", "SystemResponsiveness = 10", SYSP, "SystemResponsiveness", 10, "Perfil Streaming"),
    ],
    planScript: PLAN_MAX, planLabel: "Máximo rendimiento", planLabelEn: "Maximum performance", planLabelPt: "Desempenho máximo",
    gmPro: false, games: { preset: "mid" },
  },
  {
    id: "equilibrado", name: "Equilibrado", nameEn: "Balanced", namePt: "Equilibrado", emoji: "⚖️", color: "#c8c8cc",
    desc: "Valores estándar de Windows. Para uso diario o si algo anda raro.",
    descEn: "Windows standard values. For daily use or if something acts up.",
    descPt: "Valores padrão do Windows. Para o dia a dia ou se algo estiver estranho.",
    bullets: ["Plan de energía equilibrado", "SystemResponsiveness = 20 (default)", "Transparencias ON", "Auto Game-Mode: Lite", "No cambia tus juegos"],
    bulletsEn: ["Balanced power plan", "SystemResponsiveness = 20 (default)", "Transparency ON", "Auto Game-Mode: Lite", "Leaves your games as they are"],
    bulletsPt: ["Plano de energia equilibrado", "SystemResponsiveness = 20 (padrão)", "Transparências ON", "Auto Game-Mode: Lite", "Não muda seus jogos"],
    ops: [
      op("p_sysresp20", "SystemResponsiveness = 20 (default)", SYSP, "SystemResponsiveness", 20, "Perfil Equilibrado"),
      op("p_transp_on", "Transparencia ON", PERSONALIZE, "EnableTransparency", 1, "Perfil Equilibrado"),
    ],
    planScript: PLAN_BAL, planLabel: "Equilibrado", planLabelEn: "Balanced", planLabelPt: "Equilibrado",
    gmPro: false,
  },
  {
    id: "ahorro", name: "Ahorro", nameEn: "Power Saver", namePt: "Economia", emoji: "🔋", color: "#ffd24a",
    desc: "Notebook o PC encendida todo el día. Menos consumo y calor.",
    descEn: "Laptop or PC on all day. Less power and heat.",
    descPt: "Notebook ou PC ligado o dia todo. Menos consumo e calor.",
    bullets: ["Plan de ahorro de energía", "SystemResponsiveness = 20 (default)", "Sin transparencias (ahorra GPU)", "Auto Game-Mode: Lite", "Juegos: Máximo FPS + límite de 60 FPS (opcional): menos consumo y calor"],
    bulletsEn: ["Power-saver plan", "SystemResponsiveness = 20 (default)", "No transparency (saves GPU)", "Auto Game-Mode: Lite", "Games: Max FPS + 60 FPS limit (optional): less power and heat"],
    bulletsPt: ["Plano de economia de energia", "SystemResponsiveness = 20 (padrão)", "Sem transparências (economiza GPU)", "Auto Game-Mode: Lite", "Jogos: Máximo FPS + limite de 60 FPS (opcional): menos consumo e calor"],
    ops: [
      op("p_sysresp20", "SystemResponsiveness = 20 (default)", SYSP, "SystemResponsiveness", 20, "Perfil Ahorro"),
      op("p_transp", "Transparencia OFF", PERSONALIZE, "EnableTransparency", 0, "Perfil Ahorro"),
    ],
    planScript: PLAN_SAVE, planLabel: "Ahorro de energía", planLabelEn: "Power saver", planLabelPt: "Economia de energia",
    gmPro: false, games: { preset: "low", fps: "60" },
  },
];
