// Servicios de Windows que Optimizaciones puede deshabilitar, uno por uno, desde el menú
// "Elegir cuáles" (reemplaza a las filas sueltas de SysMain, Búsqueda, Xbox, Registro
// remoto y Cola de impresión). Un ítem puede agrupar varios servicios (Xbox).
//
// RECOMENDADO = no rompe nada que use un jugador típico. Los que rompen algo muestran
// qué. Restaurar los devuelve: el backup guarda su tipo de inicio (SVC_BACKUP_NAMES).
// Defender sigue en su propia fila (necesita pasos aparte por la Protección contra
// alteraciones). DiagTrack/dmwappushservice los maneja "Deshabilitar telemetría".

export type SvcGroup = "perf" | "features" | "gaming";
export interface Svc {
  id: string;
  services: string[];
  name: string; nameEn: string; namePt: string;
  group: SvcGroup;
  rec: boolean;
  warn?: string; warnEn?: string; warnPt?: string;
}

const s = (group: SvcGroup, rec: boolean, services: string | string[], name: string, nameEn: string, namePt: string,
  warn?: string, warnEn?: string, warnPt?: string): Svc => {
  const list = Array.isArray(services) ? services : [services];
  return { id: list[0], services: list, name, nameEn, namePt, group, rec, warn, warnEn, warnPt };
};

export const SVCS: Svc[] = [
  s("perf", true, "SysMain", "SysMain (Superfetch)", "SysMain (Superfetch)", "SysMain (Superfetch)"),
  s("perf", false, "WSearch", "Windows Search (indexado)", "Windows Search (indexing)", "Windows Search (indexação)",
    "la búsqueda del Inicio y del Explorador se vuelve lenta", "Start and File Explorer search gets slow", "a pesquisa do Iniciar e do Explorador fica lenta"),
  s("perf", true, "WerSvc", "Informe de errores de Windows", "Windows Error Reporting", "Relatório de Erros do Windows"),
  s("features", true, "RemoteRegistry", "Registro remoto", "Remote Registry", "Registro Remoto"),
  s("features", false, "Spooler", "Cola de impresión", "Print Spooler", "Spooler de Impressão",
    "no vas a poder imprimir", "you won't be able to print", "você não vai conseguir imprimir"),
  s("features", true, "Fax", "Fax", "Fax", "Fax"),
  s("features", true, "RetailDemo", "Modo demo de tiendas", "Retail Demo", "Modo de demonstração"),
  s("features", true, "MapsBroker", "Mapas descargados", "Downloaded Maps Manager", "Mapas baixados"),
  s("features", true, "WMPNetworkSvc", "Compartir multimedia (Windows Media Player)", "Windows Media Player sharing", "Compartilhamento do Windows Media Player"),
  s("features", true, "wisvc", "Programa Windows Insider", "Windows Insider program", "Programa Windows Insider",
    "si estás en el programa Insider", "if you're in the Insider program", "se você está no programa Insider"),
  s("features", false, "lfsvc", "Geolocalización", "Geolocation", "Geolocalização",
    "ubicación y zona horaria automática", "location and automatic time zone", "localização e fuso horário automático"),
  s("gaming", false, ["XblAuthManager", "XblGameSave", "XboxGipSvc", "XboxNetApiSvc"], "Servicios de Xbox", "Xbox services", "Serviços do Xbox",
    "Game Pass, partidas en la nube y controles de Xbox", "Game Pass, cloud saves and Xbox controllers", "Game Pass, saves na nuvem e controles Xbox"),
];

export const SVCS_RECOMMENDED = SVCS.filter((x) => x.rec).map((x) => x.id);
/** Servicios que el backup de Optimizaciones tiene que guardar para que Restaurar los devuelva. */
export const SVC_BACKUP_NAMES = SVCS.flatMap((x) => x.services);

const psList = (xs: string[]) => "@(" + xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",") + ")";

/** Detiene y deshabilita los servicios elegidos (los que existan en esta PC). Primera línea
 *  = resumen (es la que muestra el registro de Optimizaciones). */
export const svcDisable = (ids: string[]) => String.raw`$ok=0; $tot=0; $bad=@()
foreach($n in ${psList(SVCS.filter((x) => ids.includes(x.id)).flatMap((x) => x.services))}){
  if(-not (Get-Service -Name $n -EA SilentlyContinue)){ continue }
  $tot++
  Stop-Service -Name $n -Force -EA SilentlyContinue
  Set-Service -Name $n -StartupType Disabled -EA SilentlyContinue
  if("$((Get-Service -Name $n -EA SilentlyContinue).StartType)" -eq 'Disabled'){ $ok++ } else { $bad += $n }
}
Write-Output ("Servicios deshabilitados: " + $ok + "/" + $tot)
foreach($b in $bad){ Write-Output ("  ! No se pudo deshabilitar: " + $b) }
if($bad.Count -gt 0){ exit 1 }`;

/** Estado de cada servicio: "Nombre=Disabled|Manual|Automatic|NONE" (NONE = no existe). */
export const SVCS_STATE = String.raw`foreach($n in ${psList(SVC_BACKUP_NAMES)}){
  $sv=Get-Service -Name $n -EA SilentlyContinue
  if($sv){ "$n=$($sv.StartType)" } else { "$n=NONE" }
}`;
