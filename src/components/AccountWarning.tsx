import { useEffect, useState } from "react";
import { runPowershell } from "../lib/api";
import { useI18n } from "../lib/i18n";

// Si la app se abrió con OTRA cuenta de administrador (cuenta estándar + contraseña
// de un admin en el UAC), todo lo "de usuario" (HKCU, temporales, inicio, tema, mouse…)
// se aplica a esa otra cuenta y no a la de quien usa la PC — sin ningún error visible.
// Se compara la cuenta de la app con la dueña del escritorio (explorer.exe).
const CHECK = String.raw`$me=[Security.Principal.WindowsIdentity]::GetCurrent()
$ex=Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA SilentlyContinue | Select-Object -First 1
if(-not $ex){ 'SAME'; exit 0 }
$o=Invoke-CimMethod -InputObject $ex -MethodName GetOwnerSid -EA SilentlyContinue
if(-not $o -or -not $o.Sid -or $o.Sid -eq $me.User.Value){ 'SAME'; exit 0 }
$desk=try{ (New-Object Security.Principal.SecurityIdentifier($o.Sid)).Translate([Security.Principal.NTAccount]).Value }catch{ $o.Sid }
'OTHER|' + $me.Name + '|' + $desk`;

export default function AccountWarning() {
  const { t } = useI18n();
  const [info, setInfo] = useState<{ app: string; desk: string } | null>(null);

  useEffect(() => {
    runPowershell(CHECK).then((r) => {
      const m = r.output.trim().split("\n").pop()?.match(/^OTHER\|(.*)\|(.*)$/);
      if (m) setInfo({ app: m[1].trim(), desk: m[2].trim() });
    }).catch(() => {});
  }, []);

  if (!info) return null;
  return (
    <div className="mx-6 mt-1 mb-2 rounded-lg border border-[#f5b454]/35 bg-[#f5b454]/[0.07] px-4 py-2.5 flex items-start gap-3 text-[12.5px]">
      <span className="text-[#f5b454] font-bold mt-px">!</span>
      <p className="flex-1 text-text-dim leading-relaxed">
        {t("acct.warn").replace("{app}", info.app).replace("{desk}", info.desk)}
      </p>
      <button onClick={() => setInfo(null)} className="text-text-mute hover:text-text shrink-0" aria-label={t("acct.dismiss")}>✕</button>
    </div>
  );
}
