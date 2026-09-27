import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HudTitle } from "../components/NeonCard";
import { useI18n } from "../lib/i18n";

type L = { es: string; en: string; pt: string };
interface Item { id: string; icon: string; title: L; desc: L; points: { es: string[]; en: string[]; pt: string[] }; }

const GUIDE: Item[] = [
  {
    id: "intro", icon: "🛡️",
    title: { es: "Antes de empezar (importante)", en: "Before you start (important)", pt: "Antes de começar (importante)" },
    desc: { es: "Cómo trabaja la app en general.", en: "How the app works in general.", pt: "Como o app funciona em geral." },
    points: {
      es: [
        "Corre como administrador (te pide permiso UAC al abrir) — lo necesita para tocar el sistema.",
        "Antes de aplicar optimizaciones crea un backup del registro + un punto de restauración automático.",
        "Funciona en Windows 10 y 11; los tweaks que son solo de W11 aparecen con la etiqueta [W11].",
        "Cada tweak tiene un punto de color: 🟢 seguro · 🟡 avanzado (modifica ajustes más sensibles).",
        "Atajos: Ctrl+K abre el buscador de secciones. En la barra inferior elegís el color de acento y el idioma (ES/EN/PT).",
      ],
      en: [
        "It runs as administrator (it asks for UAC permission on launch) — it needs that to change system settings.",
        "Before applying optimizations it creates a registry backup + an automatic restore point.",
        "Works on Windows 10 and 11; tweaks that are Windows 11-only show the [W11] tag.",
        "Each tweak has a colored dot: 🟢 safe · 🟡 advanced (changes more sensitive settings).",
        "Shortcuts: Ctrl+K opens the section search. In the bottom bar you pick the accent color and the language (ES/EN/PT).",
      ],
      pt: [
        "Roda como administrador (pede permissão do UAC ao abrir) — precisa disso para mexer no sistema.",
        "Antes de aplicar otimizações, cria um backup do registro + um ponto de restauração automático.",
        "Funciona no Windows 10 e 11; os tweaks exclusivos do W11 aparecem com a etiqueta [W11].",
        "Cada tweak tem um ponto colorido: 🟢 seguro · 🟡 avançado (mexe em configurações mais sensíveis).",
        "Atalhos: Ctrl+K abre a busca de seções. Na barra inferior você escolhe a cor de destaque e o idioma (ES/EN/PT).",
      ],
    },
  },
  {
    id: "panel", icon: "📊",
    title: { es: "Panel", en: "Dashboard", pt: "Painel" },
    desc: { es: "Tu PC de un vistazo: puntaje, temperaturas y RAM.", en: "Your PC at a glance: score, temperatures and RAM.", pt: "Seu PC num relance: pontuação, temperaturas e RAM." },
    points: {
      es: [
        "El puntaje se calcula LEYENDO el registro real: cuántos tweaks clave (Gaming + Privacidad) están aplicados.",
        "Temperaturas reales de CPU y GPU, leídas de los sensores del hardware.",
        "Gráfico en vivo de uso de CPU y RAM, más el uso del SSD.",
        "RAM Booster: libera la memoria standby (archivos cacheados) — útil antes de abrir un juego pesado.",
        "También muestra el estado del Auto Game-Mode.",
      ],
      en: [
        "The score is calculated by READING the actual registry: how many key tweaks (Gaming + Privacy) are applied.",
        "Real CPU and GPU temperatures, read from the hardware sensors.",
        "Live graph of CPU and RAM usage, plus SSD usage.",
        "RAM Booster: frees standby memory (cached files) — useful before launching a heavy game.",
        "It also shows the Auto Game-Mode status.",
      ],
      pt: [
        "A pontuação é calculada LENDO o registro real: quantos tweaks principais (Gaming + Privacidade) estão aplicados.",
        "Temperaturas reais de CPU e GPU, lidas dos sensores do hardware.",
        "Gráfico ao vivo do uso de CPU e RAM, mais o uso do SSD.",
        "RAM Booster: libera a memória em espera (arquivos em cache) — útil antes de abrir um jogo pesado.",
        "Também mostra o estado do Auto Game-Mode.",
      ],
    },
  },
  {
    id: "profiles", icon: "📚",
    title: { es: "Perfiles", en: "Profiles", pt: "Perfis" },
    desc: { es: "Configuraciones completas con un solo clic.", en: "Complete setups with a single click.", pt: "Configurações completas com um só clique." },
    points: {
      es: [
        "Competitivo: FPS y latencia al máximo (plan máximo, HAGS, CPU sin reserva, sin transparencias).",
        "Streaming: igual de rápido pero dejando CPU para el encoder de OBS.",
        "Equilibrado: valores estándar de Windows — usalo si algo anda raro.",
        "Ahorro: para notebooks o PCs encendidas todo el día.",
        "Todos los cambios pasan por el Motor: quedan en el Historial y se pueden deshacer.",
      ],
      en: [
        "Competitive: max FPS and lowest latency (max power plan, HAGS, no CPU reserve, no transparency).",
        "Streaming: just as fast, but leaves CPU for the OBS encoder.",
        "Balanced: standard Windows values — use it if something acts up.",
        "Power Saver: for laptops or PCs that stay on all day.",
        "Every change goes through the Change Engine: it's logged in the History and can be undone.",
      ],
      pt: [
        "Competitivo: FPS e latência no máximo (plano máximo, HAGS, sem reserva de CPU, sem transparências).",
        "Streaming: tão rápido quanto, mas deixa CPU para o encoder do OBS.",
        "Equilibrado: valores padrão do Windows — use se algo estiver estranho.",
        "Economia: para notebooks ou PCs ligados o dia todo.",
        "Todas as mudanças passam pelo Motor: ficam no Histórico e podem ser desfeitas.",
      ],
    },
  },
  {
    id: "opt", icon: "🚀",
    title: { es: "Optimizaciones", en: "Optimizations", pt: "Otimizações" },
    desc: { es: "Aplica tweaks para mejorar rendimiento, red y privacidad.", en: "Applies tweaks to improve performance, network and privacy.", pt: "Aplica tweaks para melhorar desempenho, rede e privacidade." },
    points: {
      es: [
        "Elegís los tweaks (vienen agrupados: Gaming, Red, Bloatware, Privacidad, Visual, Servicios, WinUtil…).",
        "“Modo Gamer” selecciona solo los tweaks críticos de rendimiento.",
        "La limpieza de bloatware está acá. Nunca toca Xbox / Game Pass, la Microsoft Store ni tus juegos (Minecraft, Roblox).",
        "Pasá el mouse sobre un tweak para ver qué hace exactamente (tooltip).",
        "Al terminar te ofrece reiniciar para aplicar todos los cambios.",
      ],
      en: [
        "You pick the tweaks (grouped: Gaming, Network, Bloatware, Privacy, Visual, Services, WinUtil…).",
        "“Gamer Mode” selects only the critical performance tweaks.",
        "Bloatware removal lives here. It never touches Xbox / Game Pass, the Microsoft Store or your games (Minecraft, Roblox).",
        "Hover over a tweak to see exactly what it does (tooltip).",
        "When it finishes it offers to restart so every change takes effect.",
      ],
      pt: [
        "Você escolhe os tweaks (agrupados: Gaming, Rede, Bloatware, Privacidade, Visual, Serviços, WinUtil…).",
        "“Modo Gamer” seleciona só os tweaks críticos de desempenho.",
        "A remoção de bloatware fica aqui. Nunca mexe no Xbox / Game Pass, na Microsoft Store nem nos seus jogos (Minecraft, Roblox).",
        "Passe o mouse sobre um tweak para ver exatamente o que ele faz (tooltip).",
        "Ao terminar, oferece reiniciar para aplicar todas as mudanças.",
      ],
    },
  },
  {
    id: "gpu", icon: "🖥️",
    title: { es: "Gráficos", en: "Graphics", pt: "Gráficos" },
    desc: { es: "Tu placa de video: detección, monitor y ajustes.", en: "Your graphics card: detection, monitor and tweaks.", pt: "Sua placa de vídeo: detecção, monitor e ajustes." },
    points: {
      es: [
        "Detecta todas tus placas (NVIDIA, AMD e integradas) con su VRAM real.",
        "Monitor en vivo para NVIDIA: temperatura, uso, frecuencia, consumo y VRAM.",
        "Ajustes avanzados: TDR (evita reinicios del driver bajo carga) y MPO (arregla parpadeos/stutter).",
        "Máximo rendimiento para NVIDIA y AMD, con botón para restaurar.",
        "HAGS y Game DVR están en Optimizaciones → Gaming Performance.",
      ],
      en: [
        "Detects all your graphics cards (NVIDIA, AMD and integrated) with their real VRAM.",
        "Live monitor for NVIDIA: temperature, usage, clock, power draw and VRAM.",
        "Advanced tweaks: TDR (prevents driver resets under load) and MPO (fixes flicker/stutter).",
        "Maximum performance for NVIDIA and AMD, with a restore button.",
        "HAGS and Game DVR are in Optimizations → Gaming Performance.",
      ],
      pt: [
        "Detecta todas as suas placas (NVIDIA, AMD e integradas) com a VRAM real.",
        "Monitor ao vivo para NVIDIA: temperatura, uso, clock, consumo e VRAM.",
        "Ajustes avançados: TDR (evita reinícios do driver sob carga) e MPO (corrige piscadas/stutter).",
        "Desempenho máximo para NVIDIA e AMD, com botão para restaurar.",
        "HAGS e Game DVR ficam em Otimizações → Desempenho em Jogos.",
      ],
    },
  },
  {
    id: "engine", icon: "🛡️",
    title: { es: "Motor de Cambios", en: "Change Engine", pt: "Motor de Mudanças" },
    desc: { es: "La forma más segura de aplicar tweaks: auditada y reversible.", en: "The safest way to apply tweaks: audited and reversible.", pt: "O jeito mais seguro de aplicar tweaks: auditado e reversível." },
    points: {
      es: [
        "Por cada cambio: LEE el valor previo → lo APLICA → RE-LEE para VERIFICAR que realmente quedó.",
        "Todo queda en un historial persistente (sobrevive reinicios).",
        "En la pestaña Historial podés DESHACER cada cambio uno por uno, volviendo al valor exacto que tenías.",
        "Rendimiento: desactivar VBS / Integridad de memoria. En Windows 11 vienen activas y cuestan FPS; apagarlas baja la protección contra drivers maliciosos. Requiere reiniciar — en Sistema ves si quedaron activas.",
        "También tiene ajustes que no están en Optimizaciones (Explorador, Privacidad, Sistema).",
      ],
      en: [
        "For each change it READS the previous value → APPLIES it → RE-READS it to VERIFY it actually stuck.",
        "Everything goes into a persistent history (survives restarts).",
        "In the History tab you can UNDO each change one by one, back to the exact value you had.",
        "Performance: disable VBS / Memory Integrity. They're on by default in Windows 11 and cost FPS; turning them off lowers protection against malicious drivers. Needs a restart — System shows whether they're still on.",
        "It also has tweaks that aren't in Optimizations (File Explorer, Privacy, System).",
      ],
      pt: [
        "Para cada mudança: LÊ o valor anterior → APLICA → RELÊ para VERIFICAR que realmente ficou.",
        "Tudo vai para um histórico persistente (sobrevive a reinícios).",
        "Na aba Histórico você pode DESFAZER cada mudança uma por uma, voltando ao valor exato que tinha.",
        "Desempenho: desativar VBS / Integridade de memória. No Windows 11 vêm ativas e custam FPS; desligá-las reduz a proteção contra drivers maliciosos. Precisa reiniciar — em Sistema você vê se continuam ativas.",
        "Também tem ajustes que não estão em Otimizações (Explorador, Privacidade, Sistema).",
      ],
    },
  },
  {
    id: "gamemode", icon: "🎮",
    title: { es: "Auto Game-Mode", en: "Auto Game-Mode", pt: "Auto Game-Mode" },
    desc: { es: "Activa el modo gamer solo cuando abrís un juego.", en: "Turns on gamer mode only when you launch a game.", pt: "Ativa o modo gamer só quando você abre um jogo." },
    points: {
      es: [
        "Un servicio en segundo plano vigila los procesos cada 3 segundos (funciona estés en la sección que estés).",
        "Detecta un juego de tu lista → guarda tu plan actual, activa el plan máximo + responsiveness gamer y te notifica.",
        "Modo Pro ⚡: además pone el juego en prioridad Alta, baja apps de fondo (Spotify, Chrome…) y libera RAM standby.",
        "Cerrás el juego → restaura TU plan anterior y las prioridades, y te avisa.",
        "“Detectar instalados” escanea Steam, Epic y Riot y llena la lista solo. También podés agregar .exe a mano.",
      ],
      en: [
        "A background service checks running processes every 3 seconds (it works whichever section you're in).",
        "It detects a game from your list → saves your current plan, enables the max plan + gamer responsiveness and notifies you.",
        "Pro Mode ⚡: also sets the game to High priority, lowers background apps (Spotify, Chrome…) and frees standby RAM.",
        "You close the game → it restores YOUR previous plan and priorities, and lets you know.",
        "“Detect installed” scans Steam, Epic and Riot and fills in the list for you. You can also add .exe files by hand.",
      ],
      pt: [
        "Um serviço em segundo plano verifica os processos a cada 3 segundos (funciona em qualquer seção).",
        "Detecta um jogo da sua lista → salva seu plano atual, ativa o plano máximo + responsividade gamer e te avisa.",
        "Modo Pro ⚡: também coloca o jogo em prioridade Alta, reduz apps em segundo plano (Spotify, Chrome…) e libera a RAM em espera.",
        "Você fecha o jogo → ele restaura o SEU plano anterior e as prioridades, e te avisa.",
        "“Detectar instalados” procura na Steam, Epic e Riot e preenche a lista sozinho. Você também pode adicionar .exe manualmente.",
      ],
    },
  },
  {
    id: "network", icon: "🌐",
    title: { es: "Red", en: "Network", pt: "Rede" },
    desc: { es: "Test de conexión para jugar y DNS más rápido.", en: "Gaming connection test and faster DNS.", pt: "Teste de conexão para jogar e DNS mais rápido." },
    points: {
      es: [
        "Test de conexión: mide ping, jitter y pérdida de paquetes hacia internet Y hacia tu router, así sabés si el lag viene de tu Wi-Fi/red o de tu proveedor.",
        "Jitter = cuánto varía el ping; con más de 15 ms se sienten tirones aunque el ping sea bajo. Cualquier pérdida de paquetes se nota en la partida.",
        "También avisa si estás por Wi-Fi o si tu cable conecta a 100 Mbps (señal de cable o puerto dañado).",
        "DNS: mide la velocidad real de resolución de cada servidor y los ordena; aplicás el más rápido con un clic o volvés al del router.",
        "Un DNS rápido acelera la resolución de nombres (webs, login de juegos), no el ping dentro de la partida.",
      ],
      en: [
        "Connection test: measures ping, jitter and packet loss to the internet AND to your router, so you know whether lag comes from your Wi-Fi/network or your provider.",
        "Jitter = how much the ping varies; above 15 ms you feel stutter even with low ping. Any packet loss shows up in-match.",
        "It also warns if you're on Wi-Fi or if your cable links at 100 Mbps (a sign of a damaged cable or port).",
        "DNS: measures each server's real resolution speed and ranks them; apply the fastest in one click or go back to your router's.",
        "A fast DNS speeds up name resolution (websites, game logins), not the in-match ping.",
      ],
      pt: [
        "Teste de conexão: mede ping, jitter e perda de pacotes até a internet E até o seu roteador, para você saber se o lag vem do seu Wi-Fi/rede ou do provedor.",
        "Jitter = quanto o ping varia; acima de 15 ms você sente travadinhas mesmo com ping baixo. Qualquer perda de pacotes aparece na partida.",
        "Também avisa se você está no Wi-Fi ou se o cabo conecta a 100 Mbps (sinal de cabo ou porta danificados).",
        "DNS: mede a velocidade real de resolução de cada servidor e ordena; aplique o mais rápido com um clique ou volte ao do roteador.",
        "Um DNS rápido acelera a resolução de nomes (sites, login dos jogos), não o ping dentro da partida.",
      ],
    },
  },
  {
    id: "clean", icon: "🧹",
    title: { es: "Limpieza", en: "Cleanup", pt: "Limpeza" },
    desc: { es: "Libera espacio borrando archivos basura.", en: "Frees space by deleting junk files.", pt: "Libera espaço apagando arquivos inúteis." },
    points: {
      es: [
        "“Analizar” primero estima cuántos MB vas a liberar por categoría (sin borrar nada).",
        "Limpia temporales, prefetch, caché de Windows Update, miniaturas, navegadores, shader cache, papelera…",
        "No toca tus documentos ni programas.",
        "Al terminar te dice el total liberado.",
      ],
      en: [
        "“Analyze” first estimates how many MB you'll free per category (without deleting anything).",
        "Cleans temp files, prefetch, Windows Update cache, thumbnails, browsers, shader cache, recycle bin…",
        "It doesn't touch your documents or programs.",
        "When it finishes it tells you the total space freed.",
      ],
      pt: [
        "“Analisar” primeiro estima quantos MB você vai liberar por categoria (sem apagar nada).",
        "Limpa temporários, prefetch, cache do Windows Update, miniaturas, navegadores, shader cache, lixeira…",
        "Não mexe nos seus documentos nem programas.",
        "Ao terminar, mostra o total liberado.",
      ],
    },
  },
  {
    id: "startup", icon: "⏻",
    title: { es: "Inicio", en: "Startup", pt: "Inicialização" },
    desc: { es: "Controla qué arranca con Windows.", en: "Control what starts with Windows.", pt: "Controla o que inicia com o Windows." },
    points: {
      es: [
        "Lista los programas que se abren al encender la PC.",
        "Con el interruptor de cada uno los activás/desactivás.",
        "Desactivar los que no usás acelera notablemente el arranque.",
        "Es reversible: el programa sigue instalado, solo no arranca solo.",
      ],
      en: [
        "Lists the programs that open when you turn on your PC.",
        "Use each one's switch to turn it on or off.",
        "Disabling the ones you don't use makes startup noticeably faster.",
        "It's reversible: the program stays installed, it just doesn't start on its own.",
      ],
      pt: [
        "Lista os programas que abrem ao ligar o PC.",
        "Com a chave de cada um você ativa/desativa.",
        "Desativar os que você não usa acelera bastante a inicialização.",
        "É reversível: o programa continua instalado, só não inicia sozinho.",
      ],
    },
  },
  {
    id: "apps", icon: "📦",
    title: { es: "Instalar Apps", en: "Install Apps", pt: "Instalar Apps" },
    desc: { es: "Instala aplicaciones automáticamente con winget.", en: "Installs apps automatically with winget.", pt: "Instala aplicativos automaticamente com o winget." },
    points: {
      es: [
        "Catálogo de 87 apps en categorías (navegadores, gaming, multimedia, dev…), todas verificadas en winget.",
        "Las que ya tenés instaladas aparecen marcadas.",
        "Marcás las que querés y se instalan solas, sin asistentes.",
        "Si una app no admite instalarse como administrador (ej. Spotify), se instala en modo usuario automáticamente.",
      ],
      en: [
        "A catalog of 87 apps in categories (browsers, gaming, media, dev…), all verified on winget.",
        "The ones you already have installed are marked.",
        "Tick the ones you want and they install on their own, no setup wizards.",
        "If an app can't be installed as administrator (e.g. Spotify), it's installed in user mode automatically.",
      ],
      pt: [
        "Catálogo de 87 apps em categorias (navegadores, games, multimídia, dev…), todos verificados no winget.",
        "Os que você já tem instalados aparecem marcados.",
        "Marque os que quiser e eles se instalam sozinhos, sem assistentes.",
        "Se um app não aceita ser instalado como administrador (ex. Spotify), ele é instalado em modo usuário automaticamente.",
      ],
    },
  },
  {
    id: "uninstall", icon: "🗑️",
    title: { es: "Desinstalar", en: "Uninstall", pt: "Desinstalar" },
    desc: { es: "Quita programas y borra sus restos (estilo Geek Uninstaller).", en: "Removes programs and cleans up their leftovers (Geek Uninstaller style).", pt: "Remove programas e apaga os restos (estilo Geek Uninstaller)." },
    points: {
      es: [
        "Lista tus programas (clásicos + de la Store) con su icono, tamaño y fecha. Tiene buscador.",
        "“Quitar” corre el desinstalador del programa.",
        "“Forzar” lo desinstala y después busca los restos (carpetas y claves de registro) para que elijas cuáles borrar.",
        "Para limpiar bloatware en masa, usá Optimizaciones → Eliminar Bloatware.",
      ],
      en: [
        "Lists your programs (classic + Store) with their icon, size and date. It has a search box.",
        "“Remove” runs the program's own uninstaller.",
        "“Force” uninstalls it and then scans for leftovers (folders and registry keys) so you choose which to delete.",
        "To remove bloatware in bulk, use Optimizations → Remove Bloatware.",
      ],
      pt: [
        "Lista seus programas (clássicos + da Store) com ícone, tamanho e data. Tem busca.",
        "“Remover” roda o desinstalador do programa.",
        "“Forçar” desinstala e depois procura os restos (pastas e chaves de registro) para você escolher quais apagar.",
        "Para remover bloatware em massa, use Otimizações → Remover Bloatware.",
      ],
    },
  },
  {
    id: "restore", icon: "↩️",
    title: { es: "Restaurar", en: "Restore", pt: "Restaurar" },
    desc: { es: "Volvé atrás si algo no te gustó.", en: "Go back if you didn't like something.", pt: "Volte atrás se não gostou de algo." },
    points: {
      es: [
        "“Restaurar último backup” reimporta el registro guardado antes de optimizar.",
        "Crear un punto de restauración del sistema cuando quieras.",
        "Abrir la herramienta nativa de Windows (rstrui).",
        "Muestra la lista de backups disponibles.",
      ],
      en: [
        "“Restore last backup” re-imports the registry saved before optimizing.",
        "Create a system restore point whenever you want.",
        "Open Windows' built-in tool (rstrui).",
        "Shows the list of available backups.",
      ],
      pt: [
        "“Restaurar último backup” reimporta o registro salvo antes de otimizar.",
        "Crie um ponto de restauração do sistema quando quiser.",
        "Abra a ferramenta nativa do Windows (rstrui).",
        "Mostra a lista de backups disponíveis.",
      ],
    },
  },
  {
    id: "reactivate", icon: "🛟",
    title: { es: "Reactivar", en: "Re-enable", pt: "Reativar" },
    desc: { es: "Volvé a activar con un clic algo que se apagó al optimizar.", en: "Turn back on, with one click, something that got disabled while optimizing.", pt: "Ative de novo, com um clique, algo que foi desligado ao otimizar." },
    points: {
      es: [
        "Pensado para el usuario no técnico: cada botón deshace un tipo de cambio.",
        "Bluetooth, impresora, búsqueda de Windows, antivirus (Defender), permisos de apps, plan de energía y OneDrive.",
        "Útil si después de optimizar algo dejó de funcionar y no sabés qué fue.",
      ],
      en: [
        "Designed for non-technical users: each button undoes one type of change.",
        "Bluetooth, printer, Windows search, antivirus (Defender), app permissions, power plan and OneDrive.",
        "Handy if something stopped working after optimizing and you don't know why.",
      ],
      pt: [
        "Pensado para quem não é técnico: cada botão desfaz um tipo de mudança.",
        "Bluetooth, impressora, pesquisa do Windows, antivírus (Defender), permissões de apps, plano de energia e OneDrive.",
        "Útil se algo parou de funcionar depois de otimizar e você não sabe o que foi.",
      ],
    },
  },
  {
    id: "repair", icon: "🔧",
    title: { es: "Reparar", en: "Repair", pt: "Reparar" },
    desc: { es: "Herramientas para cuando Windows falla.", en: "Tools for when Windows misbehaves.", pt: "Ferramentas para quando o Windows falha." },
    points: {
      es: [
        "SFC y DISM reparan archivos del sistema — vas viendo el avance EN VIVO.",
        "Reset de red (winsock + DNS + IP) para problemas de conexión.",
        "Reiniciar el Explorador y reconstruir la caché de iconos.",
        "Cada acción te resume el resultado al final.",
      ],
      en: [
        "SFC and DISM repair system files — you see the progress LIVE.",
        "Network reset (winsock + DNS + IP) for connection problems.",
        "Restart File Explorer and rebuild the icon cache.",
        "Each action sums up the result at the end.",
      ],
      pt: [
        "SFC e DISM reparam arquivos do sistema — você vê o progresso AO VIVO.",
        "Redefinição de rede (winsock + DNS + IP) para problemas de conexão.",
        "Reiniciar o Explorer e reconstruir o cache de ícones.",
        "Cada ação resume o resultado no final.",
      ],
    },
  },
  {
    id: "tools", icon: "🔨",
    title: { es: "Herramientas", en: "Tools", pt: "Ferramentas" },
    desc: { es: "Control de Windows Update y archivos bloqueados.", en: "Windows Update control and locked files.", pt: "Controle do Windows Update e arquivos bloqueados." },
    points: {
      es: [
        "Windows Update: pausarlo por un tiempo, desactivarlo o volver a activarlo.",
        "Desbloquear archivos: te dice qué programa tiene un archivo en uso y te deja cerrarlo.",
      ],
      en: [
        "Windows Update: pause it for a while, turn it off or turn it back on.",
        "Unlock files: tells you which program has a file in use and lets you close it.",
      ],
      pt: [
        "Windows Update: pausar por um tempo, desativar ou ativar de novo.",
        "Desbloquear arquivos: mostra qual programa está usando um arquivo e deixa você fechá-lo.",
      ],
    },
  },
  {
    id: "system", icon: "📈",
    title: { es: "Sistema", en: "System", pt: "Sistema" },
    desc: { es: "Monitor en tiempo real de tu PC.", en: "Real-time monitor of your PC.", pt: "Monitor em tempo real do seu PC." },
    points: {
      es: [
        "Gráficas en vivo de CPU y RAM.",
        "Información del equipo: Windows, procesador, núcleos, placas de video y memoria.",
        "Estado real de VBS / Integridad de memoria (activas o no), leído de Windows.",
        "El mini-monitor de la barra lateral (CPU/RAM/SSD) está siempre a la vista.",
      ],
      en: [
        "Live CPU and RAM graphs.",
        "System info: Windows, processor, cores, graphics cards and memory.",
        "Actual VBS / Memory Integrity status (on or off), read from Windows.",
        "The mini-monitor in the sidebar (CPU/RAM/SSD) is always in view.",
      ],
      pt: [
        "Gráficos ao vivo de CPU e RAM.",
        "Informações do computador: Windows, processador, núcleos, placas de vídeo e memória.",
        "Estado real de VBS / Integridade de memória (ativas ou não), lido do Windows.",
        "O mini-monitor da barra lateral (CPU/RAM/SSD) fica sempre à vista.",
      ],
    },
  },
];

export default function Guia() {
  const { lang } = useI18n();
  const [open, setOpen] = useState<Set<string>>(new Set(["intro"]));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div className="h-full flex flex-col px-8 py-7">
      <HudTitle tkey="page.guide" />
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-2.5 max-w-3xl">
        {GUIDE.map((g) => {
          const isOpen = open.has(g.id);
          return (
            <div key={g.id} className="rounded-xl border border-line bg-surface overflow-hidden">
              <button onClick={() => toggle(g.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition">
                <span className="text-[18px]">{g.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-text">{g.title[lang]}</div>
                  <div className="text-[13px] text-text-mute truncate">{g.desc[lang]}</div>
                </div>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
                  className="text-text-mute shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden">
                    <ul className="px-4 pb-4 pt-3 space-y-2 border-t border-line/60">
                      {g.points[lang].map((p, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] text-text-dim leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent mt-[7px] shrink-0" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
