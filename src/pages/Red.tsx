import { useEffect, useRef, useState } from "react";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { runPowershell } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { IndeterminateBar } from "../components/Feedback";

interface Dns { id: string; name: string; nameEn?: string; primary: string; secondary: string; note: string; noteEn: string; }

// Lista curada de resolutores públicos confiables.
const DNS_LIST: Dns[] = [
  { id: "cloudflare", name: "Cloudflare", primary: "1.1.1.1", secondary: "1.0.0.1", note: "El más rápido en general", noteEn: "Fastest overall" },
  { id: "cloudflare-sec", name: "Cloudflare Seguro", nameEn: "Cloudflare Secure", primary: "1.1.1.2", secondary: "1.0.0.2", note: "Bloquea malware", noteEn: "Blocks malware" },
  { id: "google", name: "Google", primary: "8.8.8.8", secondary: "8.8.4.4", note: "Muy estable y conocido", noteEn: "Very stable and well-known" },
  { id: "quad9", name: "Quad9", primary: "9.9.9.9", secondary: "149.112.112.112", note: "Bloquea sitios maliciosos", noteEn: "Blocks malicious sites" },
  { id: "opendns", name: "OpenDNS (Cisco)", primary: "208.67.222.222", secondary: "208.67.220.220", note: "Con filtros opcionales", noteEn: "With optional filters" },
  { id: "adguard", name: "AdGuard", primary: "94.140.14.14", secondary: "94.140.15.15", note: "Bloquea publicidad y rastreadores", noteEn: "Blocks ads and trackers" },
  { id: "adguard-clean", name: "AdGuard sin filtro", nameEn: "AdGuard no filter", primary: "94.140.14.140", secondary: "94.140.14.141", note: "Sin bloqueos", noteEn: "No blocking" },
  { id: "quad9-open", name: "Quad9 sin filtro", nameEn: "Quad9 no filter", primary: "9.9.9.10", secondary: "149.112.112.10", note: "Sin bloqueos", noteEn: "No blocking" },
  { id: "comodo", name: "Comodo Secure", primary: "8.26.56.26", secondary: "8.20.247.20", note: "Enfocado en seguridad", noteEn: "Security-focused" },
  { id: "level3", name: "Level3", primary: "4.2.2.1", secondary: "4.2.2.2", note: "Clásico, suele ser rápido", noteEn: "Classic, usually fast" },
  { id: "dnswatch", name: "DNS.Watch", primary: "84.200.69.80", secondary: "84.200.70.40", note: "Sin censura ni logs", noteEn: "No censorship or logs" },
  { id: "controld", name: "Control D", primary: "76.76.2.0", secondary: "76.76.10.0", note: "Personalizable", noteEn: "Customizable" },
];

const ipsArg = DNS_LIST.map((d) => `'${d.primary}'`).join(",");
// Mide el tiempo REAL de resolución DNS (no ICMP ping): resuelve dominios contra
// cada servidor y promedia. El ping no mide la resolución y castiga a los DNS que
// simplemente bloquean ICMP.
const TEST_SCRIPT = String.raw`$hosts=@(${ipsArg})
$names=@('www.google.com','www.wikipedia.org')
$out=foreach($h in $hosts){
  $sum=0.0; $c=0
  foreach($n in $names){
    try{
      $ms=(Measure-Command { Resolve-DnsName -Server $h -Name $n -Type A -DnsOnly -QuickTimeout -EA Stop }).TotalMilliseconds
      $sum+=$ms; $c++
    }catch{}
  }
  if($c -gt 0){ [pscustomobject]@{h=$h;ms=[int][math]::Round($sum/$c,0)} } else { [pscustomobject]@{h=$h;ms=-1} }
}
$j=@($out)|ConvertTo-Json -Compress; if($j[0] -ne '['){ $j="[$j]" }; Write-Output $j`;

const dnsScript = (servers: string[] | null) => servers
  ? String.raw`Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses ${servers.map((s) => `'${s}'`).join(",")} }
Clear-DnsClientCache
Write-Output 'DNS aplicado'`
  : String.raw`Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses }
Clear-DnsClientCache
Write-Output 'DNS automatico restaurado'`;

const CURRENT_DNS = String.raw`$d=Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | Select-Object -First 1
if($d){ Write-Output ($d.ServerAddresses -join ', ') } else { Write-Output 'Automatico' }`;

const color = (ms: number) => (ms < 30 ? "#00e676" : ms < 70 ? "#ffd24a" : "#ff8a65");

export default function Red() {
  const { t, lang } = useI18n();
  const [results, setResults] = useState<Record<string, number | null>>({});
  const [testing, setTesting] = useState(false);
  const [current, setCurrent] = useState("…");
  const [applying, setApplying] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshCurrent = () =>
    runPowershell(CURRENT_DNS).then((r) => {
      if (!mounted.current) return;
      const out = r.output.trim();
      setCurrent(!out || out === "Automatico" ? t("net.auto") : out);
    }).catch(() => {});

  const runTest = async () => {
    setTesting(true);
    setResults({});
    const r = await runPowershell(TEST_SCRIPT);
    if (!mounted.current) return;
    try {
      const arr = JSON.parse(r.output.trim() || "[]") as { h: string; ms: number }[];
      const map: Record<string, number | null> = {};
      arr.forEach((x) => (map[x.h] = x.ms >= 0 ? x.ms : null));
      setResults(map);
    } catch {
      setMsg(`${t("net.measureErr")} ${r.output.slice(0, 160)}`);
    }
    setTesting(false);
  };

  useEffect(() => {
    mounted.current = true;
    refreshCurrent();
    runTest();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async (d: Dns | null) => {
    setApplying(d ? d.id : "auto");
    setMsg(null);
    try {
      const r = await runPowershell(dnsScript(d ? [d.primary, d.secondary] : null));
      if (!mounted.current) return;
      const label = d ? (lang === "en" ? (d.nameEn ?? d.name) : d.name) : t("net.autoDns");
      setMsg(r.ok ? `✓ ${label} ${t("net.applied")}` : `✗ ${r.output}`);
      await refreshCurrent();
    } catch (err) {
      if (mounted.current) setMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (mounted.current) setApplying(null);
    }
  };

  // Ordenar: con latencia primero (asc), sin respuesta / sin medir al final.
  const ranked = [...DNS_LIST].sort((a, b) => {
    const va = results[a.primary], vb = results[b.primary];
    const na = va === undefined || va === null, nb = vb === undefined || vb === null;
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return (va as number) - (vb as number);
  });
  const fastest = ranked.find((d) => typeof results[d.primary] === "number")?.id;

  return (
    <div className="h-full flex flex-col px-8 py-7 overflow-hidden">
      <HudTitle tkey="page.network" />

      <div className="flex items-center justify-between mb-3">
        <div className="text-[13.5px] text-text-mute">
          {t("net.current")} <span className="font-mono text-text-dim">{current}</span>
        </div>
        <button onClick={runTest} disabled={testing} className="btn btn-primary">
          {testing ? t("net.testing") : t("net.retest")}
        </button>
      </div>

      {testing && <IndeterminateBar />}

      <div className="flex-1 overflow-y-auto -mr-2 pr-2 mt-1">
        <div className="space-y-2">
          {ranked.map((d) => {
            const ms = results[d.primary];
            const best = d.id === fastest;
            return (
              <NeonCard key={d.id} className={best ? "" : ""}>
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-text">{lang === "en" ? (d.nameEn ?? d.name) : d.name}</span>
                      {best && <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#00e67622", color: "#00e676" }}>{t("net.fastest")}</span>}
                    </div>
                    <div className="text-[12px] font-mono text-text-dim mt-0.5">{d.primary} · {d.secondary}</div>
                    <div className="text-[11.5px] text-text-mute mt-0.5">{lang === "en" ? d.noteEn : d.note}</div>
                  </div>

                  <div className="w-20 text-right shrink-0">
                    {ms === undefined ? (
                      <span className="text-text-mute text-[13px]">{testing ? "…" : "—"}</span>
                    ) : ms === null ? (
                      <span className="text-[#ff5470] text-[12px]">{t("net.noresp")}</span>
                    ) : (
                      <span className="font-mono font-bold text-[17px]" style={{ color: color(ms) }}>{ms}<span className="text-[11px] font-normal"> ms</span></span>
                    )}
                  </div>

                  <button onClick={() => apply(d)} disabled={applying !== null}
                    className="btn btn-ghost shrink-0 w-[84px]">
                    {applying === d.id ? "…" : t("common.apply")}
                  </button>
                </div>
              </NeonCard>
            );
          })}

          {/* Volver al DNS del router */}
          <div className="flex items-center justify-between pt-1 pl-1">
            <span className="text-[13px] text-text-mute">{t("net.backQuestion")}</span>
            <button onClick={() => apply(null)} disabled={applying !== null} className="btn btn-ghost w-[84px]">
              {applying === "auto" ? "…" : t("net.auto")}
            </button>
          </div>
        </div>
      </div>

      {msg && <p className="text-[13px] mt-2 shrink-0" style={{ color: msg.startsWith("✓") ? "#00e676" : "#ff5470" }}>{msg}</p>}
    </div>
  );
}
