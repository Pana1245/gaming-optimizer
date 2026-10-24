# Privacy Policy — Gaming Optimizer

_Last updated: 2026-10-22_

**Gaming Optimizer does not collect, store, or transmit any personal data.**

It is a local, offline desktop application for Windows. Everything it does runs on your own
computer:

- **No telemetry, no analytics, no tracking.** The app does not send usage data, device
  information, or diagnostics to us or to any third party (the only exception is the hardware
  model sent to the manufacturer when you look for drivers — see below).
- **No accounts.** There is no sign-up, login, or user profile.
- **Local-only data.** Backups of the Windows registry, the reversible-change ledger
  (`%ProgramData%\GamingOptimizer\ledger.json`), and settings are written only to your own
  machine and never leave it.

### Network access

The app connects to the internet only for these explicit, user-facing features:

- **Automatic updates** — checks this project's GitHub Releases for a newer version and, if you
  accept, downloads the installer.
- **App installation** — when you choose to install software, it invokes Microsoft's `winget`. If
  `winget` is missing, the app asks GitHub's public API (`api.github.com`) for the latest official
  `winget-cli` release and downloads it from GitHub.
- **App icons** — the "Install apps" list loads each app's icon from Google's favicon service
  (`www.google.com/s2/favicons`), which receives the app's public website domain (e.g.
  `spotify.com`) and your IP address, like any image on a web page.
- **Game library** — Steam covers come from the copy Steam already keeps on your PC; if it
  isn't there, from Steam's public image server (`cdn.cloudflare.steamstatic.com`). Epic covers
  are loaded from Epic's public image server (`cdn1.epicgames.com`), using the address in the
  catalog the Epic launcher keeps on your PC. For VALORANT, League of Legends and Minecraft, the
  official poster comes from Microsoft's public Store catalog (`displaycatalog.mp.microsoft.com`
  and `store-images.s-microsoft.com`), which receives those games' public Store IDs. Those servers
  receive the image requested and your IP address, like any image on a web page. Game detection only reads your launchers' local files.
- **Drivers** — to find the latest driver for your graphics card or motherboard, the app queries
  the manufacturer's public support service (NVIDIA `gfwsl.geforce.com` / `www.nvidia.com`,
  ASUS `www.asus.com`) with your hardware model (e.g. "RTX 3070", the board name). "Open support
  page" buttons open the manufacturer's website (ASUS, Gigabyte, MSI, ASRock, Intel, AMD, Dell, HP,
  Lenovo, Acer…) in your browser.
- **Network tools** — latency/connection tests (ICMP ping to public DNS servers such as 1.1.1.1
  and 8.8.8.8, and to your router), DNS speed tests (resolving `www.google.com` and
  `www.wikipedia.org` against each public DNS server in the list) and optional DNS changes that
  you trigger manually.
- **Speed test** — only when you press "Start test", the app downloads and uploads test data
  to/from Cloudflare's speed-test service (`speed.cloudflare.com`). If Cloudflare limits the
  download, it uses the public test files Vultr hosts for this purpose (`*-ping.vultr.com`,
  picking the nearest data center). As with any website you visit, these services see your IP
  address; the app sends nothing else. The test can use several hundred MB of data.

None of these send personal information about you; they only fetch public resources or apply
settings you selected.

### Contact

Questions? Open an issue at
<https://github.com/Pana1245/gaming-optimizer/issues>.
