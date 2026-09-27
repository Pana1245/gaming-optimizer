import { useEffect, useRef, useState } from "react";
import NeonCard, { HudTitle } from "../components/NeonCard";
import { runPowershell } from "../lib/api";
import { useI18n, pick } from "../lib/i18n";
import { trLog } from "../lib/logI18n";
import { IndeterminateBar } from "../components/Feedback";
import SpeedTest from "../components/SpeedTest";

interface Dns { id: string; name: string; nameEn?: string; namePt?: string; primary: string; secondary: string; note: string; noteEn: string; notePt: string; }

// Lista curada de resolutores públicos confiables.
const DNS_LIST: Dns[] = [
  { id: "cloudflare", name: "Cloudflare", primary: "1.1.1.1", secondary: "1.0.0.1", note: "El más rápido en general", noteEn: "Fastest overall", notePt: "O mais rápido em geral" },
  { id: "cloudflare-sec", name: "Cloudflare Seguro", nameEn: "Cloudflare Secure", namePt: "Cloudflare Seguro", primary: "1.1.1.2", secondary: "1.0.0.2", note: "Bloquea malware", noteEn: "Blocks malware", notePt: "Bloqueia malware" },
  { id: "google", name: "Google", primary: "8.8.8.8", secondary: "8.8.4.4", note: "Muy estable y conocido", noteEn: "Very stable and well-known", notePt: "Muito estável e conhecido" },
  { id: "quad9", name: "Quad9", primary: "9.9.9.9", secondary: "149.112.112.112", note: "Bloquea sitios maliciosos", noteEn: "Blocks malicious sites", notePt: "Bloqueia sites maliciosos" },
  { id: "opendns", name: "OpenDNS (Cisco)", primary: "208.67.222.222", secondary: "208.67.220.220", note: "Con filtros opcionales", noteEn: "With optional filters", notePt: "Com filtros opcionais" },
  { id: "adguard", name: "AdGuard", primary: "94.140.14.14", secondary: "94.140.15.15", note: "Bloquea publicidad y rastreadores", noteEn: "Blocks ads and trackers", notePt: "Bloqueia anúncios e rastreadores" },
  { id: "adguard-clean", name: "AdGuard sin filtro", nameEn: "AdGuard no filter", namePt: "AdGuard sem filtro", primary: "94.140.14.140", secondary: "94.140.14.141", note: "Sin bloqueos", noteEn: "No blocking", notePt: "Sem bloqueios" },
  { id: "quad9-open", name: "Quad9 sin filtro", nameEn: "Quad9 no filter", namePt: "Quad9 sem filtro", primary: "9.9.9.10", secondary: "149.112.112.10", note: "Sin bloqueos", noteEn: "No blocking", notePt: "Sem bloqueios" },
  { id: "comodo", name: "Comodo Secure", primary: "8.26.56.26", secondary: "8.20.247.20", note: "Enfocado en seguridad", noteEn: "Security-focused", notePt: "Focado em segurança" },
  { id: "level3", name: "Level3", primary: "4.2.2.1", secondary: "4.2.2.2", note: "Clásico, suele ser rápido", noteEn: "Classic, usually fast", notePt: "Clássico, costuma ser rápido" },
  { id: "dnswatch", name: "DNS.Watch", primary: "84.200.69.80", secondary: "84.200.70.40", note: "Sin censura ni logs", noteEn: "No censorship or logs", notePt: "Sem censura nem logs" },
  { id: "controld", name: "Control D", primary: "76.76.2.0", secondary: "76.76.10.0", note: "Personalizable", noteEn: "Customizable", notePt: "Personalizável" },
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

// Guarda el DNS MANUAL previo del usuario (por interfaz), una sola vez, para
// poder devolvérselo. Lee NameServer del registro (vacío = DHCP → nada que guardar).
const SAVE_DNS_PREV = String.raw`$store='HKCU:\Software\GamingOptimizer'; if(!(Test-Path $store)){ New-Item $store -Force | Out-Null }
if((Get-ItemProperty $store -Name DnsPrev -EA SilentlyContinue).DnsPrev){ Write-Output 'HASSAVED'; return }
$saved=@()
Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object {
  $ns=(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$($_.InterfaceGuid)" -Name NameServer -EA SilentlyContinue).NameServer
  if($ns){ $addrs=(($ns -split '[,\s]+') | Where-Object { $_ }) -join ','; if($addrs){ $saved += ($_.ifIndex.ToString()+'='+$addrs) } }
}
if($saved.Count -gt 0){ Set-ItemProperty $store -Name DnsPrev -Value ($saved -join ';') -Force; Write-Output 'SAVED' } else { Write-Output 'NONE' }`;

const RESTORE_DNS_PREV = String.raw`$store='HKCU:\Software\GamingOptimizer'
$raw=(Get-ItemProperty $store -Name DnsPrev -EA SilentlyContinue).DnsPrev
if(-not $raw){ Write-Output 'NONE'; return }
foreach($pair in ($raw -split ';')){ $kv=$pair -split '=',2; if($kv.Count -eq 2){ try{ Set-DnsClientServerAddress -InterfaceIndex ([int]$kv[0]) -ServerAddresses ($kv[1] -split ',') -EA Stop }catch{} } }
Clear-DnsClientCache
Remove-ItemProperty $store -Name DnsPrev -Force -EA SilentlyContinue
Write-Output 'DNS anterior restaurado'`;

const CHECK_DNS_SAVED = String.raw`if((Get-ItemProperty 'HKCU:\Software\GamingOptimizer' -Name DnsPrev -EA SilentlyContinue).DnsPrev){ Write-Output 'YES' } else { Write-Output 'NO' }`;

// Test de conexión para jugar: 50 rondas de ping a internet (1.1.1.1 + 8.8.8.8) y al
// router. Comparar ambos dice DÓNDE está el problema: si el router ya pierde/varía, es
// la red local (Wi-Fi, cable); si sólo falla internet, es el proveedor. ~10 s.
const CONN_TEST = String.raw`$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$gw = if($r){ "$($r.NextHop)" } else { '' }
$ad = if($r){ Get-NetAdapter -InterfaceIndex $r.ifIndex -EA SilentlyContinue } else { $null }
$wifi = [bool]($ad -and ("$($ad.PhysicalMediaType) $($ad.MediaType) $($ad.InterfaceDescription)" -match '802\.11|Wireless|Wi-?Fi'))
$link = if($ad){ "$($ad.LinkSpeed)" } else { '' }
$hasGw = [bool]($gw -and $gw -ne '0.0.0.0')
$p = New-Object System.Net.NetworkInformation.Ping
function Try-Ping($h){ try { $x = $p.Send($h, 800); if($x.Status -eq 'Success'){ return [int]$x.RoundtripTime } } catch {}; return -1 }
# Internet: 1.1.1.1 y 8.8.8.8 en cada ronda. Los DNS publicos descartan pings sueltos
# cuando reciben muchos; contar perdida solo si AMBOS fallan evita culpar al proveedor
# por eso. Ping/jitter salen de la mejor respuesta de cada ronda.
$net = New-Object System.Collections.Generic.List[int]; $netLost = 0
$gwOk = New-Object System.Collections.Generic.List[int]; $gwLost = 0
for($i=0; $i -lt 50; $i++){
  $a = Try-Ping '1.1.1.1'; $b = Try-Ping '8.8.8.8'
  $best = @(@($a, $b) | Where-Object { $_ -ge 0 } | Sort-Object)
  if($best.Count -gt 0){ $net.Add($best[0]) } else { $netLost++ }
  if($hasGw){ $g = Try-Ping $gw; if($g -ge 0){ $gwOk.Add($g) } else { $gwLost++ } }
  Start-Sleep -Milliseconds 120
}
function Stat($v, $lost){
  $n = $v.Count; $sent = $n + $lost
  if($n -eq 0){ return [ordered]@{ ok=$false; loss=100 } }
  $j = 0; for($k=1; $k -lt $n; $k++){ $j += [math]::Abs($v[$k] - $v[$k-1]) }
  $m = $v | Measure-Object -Average -Minimum -Maximum
  [ordered]@{ ok=$true; avg=[math]::Round($m.Average,1); min=[int]$m.Minimum; max=[int]$m.Maximum
    jitter= if($n -gt 1){ [math]::Round($j/($n-1),1) } else { 0 }; loss=[math]::Round(100*$lost/$sent,1) }
}
$o = [ordered]@{ wifi=$wifi; link=$link; net=(Stat $net $netLost) }
if($hasGw){ $o.gw = (Stat $gwOk $gwLost) }
$o | ConvertTo-Json -Compress -Depth 3`;

interface ConnStat { ok: boolean; avg?: number; min?: number; max?: number; jitter?: number; loss: number; }
interface ConnRes { wifi: boolean; link: string; net: ConnStat; gw?: ConnStat; }

const verdictOf = (s: ConnStat) =>
  !s.ok ? "bad"
    : s.loss === 0 && (s.jitter ?? 0) < 5 ? "excellent"
    : s.loss <= 2 && (s.jitter ?? 0) < 15 ? "good"
    : s.loss <= 5 && (s.jitter ?? 0) < 30 ? "fair" : "bad";
const VERDICT_COLOR: Record<string, string> = { excellent: "#00e676", good: "#7ee787", fair: "#ffd24a", bad: "#ff5470" };

// Fuera de ConnTest: definida adentro se recreaba (y remontaba) en cada render.
const ConnRow = ({ label, s, noResp }: { label: string; s?: ConnStat; noResp: string }) => (
  <div className="grid grid-cols-[88px_repeat(4,1fr)] items-baseline gap-2 text-[13px]">
    <span className="text-text-mute">{label}</span>
    {!s || !s.ok ? (
      <span className="col-span-4 text-text-mute text-[12px]">{noResp}</span>
    ) : (
      <>
        <span><span className="font-mono font-semibold text-text">{s.avg}</span><span className="text-text-mute text-[11px]"> ms</span></span>
        <span><span className="font-mono font-semibold" style={{ color: (s.jitter ?? 0) < 5 ? "#00e676" : (s.jitter ?? 0) < 15 ? "#ffd24a" : "#ff5470" }}>{s.jitter}</span><span className="text-text-mute text-[11px]"> ms</span></span>
        <span className="font-mono font-semibold" style={{ color: s.loss === 0 ? "#00e676" : s.loss <= 2 ? "#ffd24a" : "#ff5470" }}>{s.loss}%</span>
        <span><span className="font-mono text-text-dim">{s.max}</span><span className="text-text-mute text-[11px]"> ms</span></span>
      </>
    )}
  </div>
);

function ConnTest() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ConnRes | null>(null);
  const [err, setErr] = useState(false);

  const run = async () => {
    setBusy(true); setErr(false);
    try {
      const r = await runPowershell(CONN_TEST);
      setRes(JSON.parse(r.output.trim().split("\n").pop() || ""));
    } catch { setErr(true); setRes(null); }
    setBusy(false);
  };

  const tips: string[] = [];
  if (res) {
    const gwBad = res.gw?.ok && (res.gw.loss > 0 || (res.gw.jitter ?? 0) > 5);
    const netBad = verdictOf(res.net) === "fair" || verdictOf(res.net) === "bad";
    if (gwBad) tips.push(t(res.wifi ? "net.ct.tipLocalWifi" : "net.ct.tipLocalCable"));
    else if (netBad && res.gw?.ok) tips.push(t("net.ct.tipIsp"));
    if (res.wifi && !gwBad) tips.push(t("net.ct.tipWifi"));
    if (!res.wifi && /^(10|100) Mbps$/.test(res.link)) tips.push(t("net.ct.tipSlowLink").replace("{link}", res.link));
  }


  const v = res ? verdictOf(res.net) : null;
  return (
    <NeonCard className="mb-4 shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-text">{t("net.ct.title")}</span>
            {v && <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${VERDICT_COLOR[v]}22`, color: VERDICT_COLOR[v] }}>{t(`net.ct.v.${v}`)}</span>}
          </div>
          <div className="text-[12.5px] text-text-mute mt-0.5">
            {res ? `${res.wifi ? "Wi-Fi" : t("net.ct.cable")}${res.link ? ` · ${res.link}` : ""}` : t("net.ct.desc")}
          </div>
        </div>
        <button onClick={run} disabled={busy} className="btn btn-primary shrink-0">
          {busy ? t("net.ct.running") : res ? t("net.ct.again") : t("net.ct.run")}
        </button>
      </div>
      {busy && <div className="mt-3"><IndeterminateBar /></div>}
      {err && <p className="text-[12.5px] mt-3" style={{ color: "#ff5470" }}>{t("net.ct.fail")}</p>}
      {res && !busy && (
        <div className="mt-3.5 space-y-1.5">
          <div className="grid grid-cols-[88px_repeat(4,1fr)] gap-2 text-[11px] uppercase tracking-wider text-text-mute">
            <span />
            <span>{t("net.ct.ping")}</span><span>{t("net.ct.jitter")}</span><span>{t("net.ct.loss")}</span><span>{t("net.ct.max")}</span>
          </div>
          <ConnRow label={t("net.ct.internet")} s={res.net} noResp={t("net.ct.noresp")} />
          <ConnRow label={t("net.ct.router")} s={res.gw} noResp={t("net.ct.noresp")} />
          {tips.map((tip) => <p key={tip} className="text-[12.5px] text-text-dim pt-1.5">▸ {tip}</p>)}
        </div>
      )}
    </NeonCard>
  );
}

const color = (ms: number) => (ms < 30 ? "#00e676" : ms < 70 ? "#ffd24a" : "#ff8a65");

export default function Red() {
  const { t, lang } = useI18n();
  const [results, setResults] = useState<Record<string, number | null>>({});
  const [testing, setTesting] = useState(false);
  const [current, setCurrent] = useState("…");
  const [applying, setApplying] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
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
    runPowershell(CHECK_DNS_SAVED).then((r) => mounted.current && setHasSaved(r.output.trim() === "YES")).catch(() => {});
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = async (d: Dns | null) => {
    setApplying(d ? d.id : "auto");
    setMsg(null);
    try {
      // Al aplicar un preset, guardar (una vez) el DNS manual que el usuario tenía,
      // para poder devolvérselo con "Restaurar los míos".
      if (d) { const s = await runPowershell(SAVE_DNS_PREV); if (s.output.includes("SAVED")) setHasSaved(true); }
      const r = await runPowershell(dnsScript(d ? [d.primary, d.secondary] : null));
      if (!mounted.current) return;
      const label = d ? pick(lang, d.name, d.nameEn, d.namePt) : t("net.autoDns");
      setMsg(r.ok ? `✓ ${label} ${t("net.applied")}` : `✗ ${r.output}`);
      await refreshCurrent();
    } catch (err) {
      if (mounted.current) setMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (mounted.current) setApplying(null);
    }
  };

  const restorePrev = async () => {
    setApplying("prev");
    setMsg(null);
    try {
      const r = await runPowershell(RESTORE_DNS_PREV);
      if (!mounted.current) return;
      setMsg(/restaurado/i.test(r.output)
        ? `✓ ${t("net.restoredPrev")}`
        : `✗ ${r.output}`);
      setHasSaved(false);
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

      <ConnTest />
      <SpeedTest />

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
                      <span className="text-[13.5px] font-semibold text-text">{pick(lang, d.name, d.nameEn, d.namePt)}</span>
                      {best && <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#00e67622", color: "#00e676" }}>{t("net.fastest")}</span>}
                    </div>
                    <div className="text-[12px] font-mono text-text-dim mt-0.5">{d.primary} · {d.secondary}</div>
                    <div className="text-[11.5px] text-text-mute mt-0.5">{pick(lang, d.note, d.noteEn, d.notePt)}</div>
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

          {/* Volver al DNS del router / restaurar los del usuario */}
          <div className="flex items-center justify-between pt-1 pl-1">
            <span className="text-[13px] text-text-mute">{t("net.backQuestion")}</span>
            <div className="flex gap-2">
              {hasSaved && (
                <button onClick={restorePrev} disabled={applying !== null} className="btn btn-ghost">
                  {applying === "prev" ? "…" : t("net.restoreMine")}
                </button>
              )}
              <button onClick={() => apply(null)} disabled={applying !== null} className="btn btn-ghost w-[84px]">
                {applying === "auto" ? "…" : t("net.auto")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {msg && <p className="text-[13px] mt-2 shrink-0" style={{ color: msg.startsWith("✓") ? "#00e676" : "#ff5470" }}>{trLog(msg, lang)}</p>}
    </div>
  );
}
