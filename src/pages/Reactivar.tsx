import { useState } from "react";
import { motion } from "framer-motion";
import { runPowershell } from "../lib/api";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { useI18n } from "../lib/i18n";

interface Fix {
  id: string;
  emoji: string;
  title: { es: string; en: string };
  desc: { es: string; en: string };
  btn: { es: string; en: string };
  done: { es: string; en: string };
  script: string;
}

// Reactivadores de "1 clic" para el usuario no técnico. Todo texto en claro.
const FIXES: Fix[] = [
  {
    id: "bluetooth",
    emoji: "📶",
    title: { es: "Bluetooth", en: "Bluetooth" },
    desc: {
      es: "¿Se te apagó el Bluetooth después de optimizar? Este botón lo vuelve a prender.",
      en: "Did Bluetooth turn off after optimizing? This button turns it back on.",
    },
    btn: { es: "Reactivar Bluetooth", en: "Re-enable Bluetooth" },
    done: {
      es: "✓ Listo. Andá a Configuración → Bluetooth y prendé el interruptor. Si no aparece, reiniciá la PC.",
      en: "✓ Done. Go to Settings → Bluetooth and flip the switch. If it's missing, restart the PC.",
    },
    script: String.raw`$base='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
foreach($p in 'radios','bluetoothSync'){ $k="$base\$p"; if(!(Test-Path $k)){ New-Item $k -Force | Out-Null }; Set-ItemProperty $k -Name Value -Value 'Allow' -Type String -Force }
foreach($s in 'bthserv','BTAGService'){ Set-Service $s -StartupType Automatic -EA SilentlyContinue; Start-Service $s -EA SilentlyContinue }
Get-PnpDevice -Class Bluetooth -EA SilentlyContinue | Where-Object { $_.Status -ne 'OK' } | Enable-PnpDevice -Confirm:$false -EA SilentlyContinue
Write-Output OK`,
  },
  {
    id: "permisos",
    emoji: "🔐",
    title: { es: "Permisos de las aplicaciones", en: "App permissions" },
    desc: {
      es: "¿Alguna app dejó de funcionar (sin ubicación, contactos, micrófono…)? Devuelve los permisos que se hayan bloqueado.",
      en: "Some app stopped working (no location, contacts, mic…)? This restores the blocked permissions.",
    },
    btn: { es: "Restaurar permisos", en: "Restore permissions" },
    done: {
      es: "✓ Permisos restaurados. Cerrá y volvé a abrir las apps que estaban fallando.",
      en: "✓ Permissions restored. Close and reopen the apps that were failing.",
    },
    script: String.raw`$base='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
$perms=@('location','userAccountInformation','contacts','appointments','phoneCall','phoneCallHistory','email','userDataTasks','chat','radios','bluetoothSync','appDiagnostics','documentsLibrary','picturesLibrary','broadFileSystemAccess','backgroundSpatialPerception','gazeInput','activity','trackerPlugin','graphicsCaptureProgrammatic','graphicsCaptureWithoutBorder','microphone','webcam','videosLibrary')
foreach($p in $perms){ $k="$base\$p"; if(Test-Path $k){ Set-ItemProperty $k -Name Value -Value 'Allow' -Type String -Force -EA SilentlyContinue } }
Write-Output OK`,
  },
  {
    id: "energia",
    emoji: "🔋",
    title: { es: "Plan de energía normal", en: "Normal power plan" },
    desc: {
      es: "¿La PC calienta o consume mucho después de poner Máximo rendimiento? Vuelve al modo Equilibrado de Windows.",
      en: "PC running hot or using lots of power after Maximum performance? Go back to Windows' Balanced mode.",
    },
    btn: { es: "Volver a Equilibrado", en: "Back to Balanced" },
    done: {
      es: "✓ Plan de energía Equilibrado activado.",
      en: "✓ Balanced power plan activated.",
    },
    script: String.raw`powercfg /setactive SCHEME_BALANCED; Write-Output OK`,
  },
  {
    id: "onedrive",
    emoji: "☁️",
    title: { es: "OneDrive y apps de Windows", en: "OneDrive & Windows apps" },
    desc: {
      es: "¿Desapareció OneDrive o alguna app de Windows al quitar bloatware? Intenta reinstalarlas.",
      en: "Did OneDrive or a Windows app disappear when removing bloatware? This tries to reinstall them.",
    },
    btn: { es: "Reinstalar", en: "Reinstall" },
    done: {
      es: "✓ Reinstalación iniciada. OneDrive puede tardar unos minutos; algunas apps podrían necesitar la Microsoft Store.",
      en: "✓ Reinstall started. OneDrive may take a few minutes; some apps might need the Microsoft Store.",
    },
    script: String.raw`$od="$env:SystemRoot\SysWOW64\OneDriveSetup.exe"; if(!(Test-Path $od)){ $od="$env:SystemRoot\System32\OneDriveSetup.exe" }
if(Test-Path $od){ Start-Process $od }
Get-AppxPackage -AllUsers | ForEach-Object { if($_.InstallLocation){ Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\AppXManifest.xml" -EA SilentlyContinue } }
Write-Output OK`,
  },
];

export default function Reactivar() {
  const { lang } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  const run = async (f: Fix) => {
    if (busy) return;
    setBusy(f.id);
    setResult((r) => ({ ...r, [f.id]: "" }));
    try {
      const res = await runPowershell(f.script);
      setResult((r) => ({
        ...r,
        [f.id]: res.ok
          ? f.done[lang]
          : `✗ ${lang === "en" ? "Couldn't do it" : "No se pudo"}: ${(res.output || "").slice(0, 120)}`,
      }));
    } catch (err) {
      setResult((r) => ({ ...r, [f.id]: `✗ ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-y-auto">
      <HudTitle tkey="page.reactivate" />

      <motion.div
        className="space-y-3 max-w-[760px]"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {FIXES.map((f) => {
          const running = busy === f.id;
          const msg = result[f.id];
          const okMsg = msg?.startsWith("✓");
          return (
            <motion.div key={f.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}>
              <NeonCard>
                <div className="flex items-center gap-4">
                  <span className="text-[30px] leading-none shrink-0">{f.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-text">{f.title[lang]}</div>
                    <div className="text-[13px] text-text-dim mt-0.5 leading-snug">{f.desc[lang]}</div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => run(f)}
                    disabled={!!busy}
                    className="shrink-0 px-5 h-10 rounded-lg text-[13px] font-semibold text-[#05140c] bg-accent hover:brightness-110 transition disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    {running ? (lang === "en" ? "Working…" : "Reactivando…") : f.btn[lang]}
                  </motion.button>
                </div>
                {msg && (
                  <div className="text-[13px] mt-3 pt-3 border-t border-white/[0.06]" style={{ color: okMsg ? "#00e676" : "#ff8a65" }}>
                    {msg}
                  </div>
                )}
              </NeonCard>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
