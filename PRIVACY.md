# Privacy Policy — Gaming Optimizer

_Last updated: 2026-09-27_

**Gaming Optimizer does not collect, store, or transmit any personal data.**

It is a local, offline desktop application for Windows. Everything it does runs on your own
computer:

- **No telemetry, no analytics, no tracking.** The app does not send usage data, device
  information, or diagnostics to us or to any third party.
- **No accounts.** There is no sign-up, login, or user profile.
- **Local-only data.** Backups of the Windows registry, the reversible-change ledger
  (`%ProgramData%\GamingOptimizer\ledger.json`), and settings are written only to your own
  machine and never leave it.

### Network access

The app connects to the internet only for these explicit, user-facing features:

- **Automatic updates** — checks this project's GitHub Releases for a newer version and, if you
  accept, downloads the installer.
- **App installation** — when you choose to install software, it invokes Microsoft's `winget`.
- **Network tools** — latency/connection tests (ICMP ping to public DNS servers such as 1.1.1.1
  and 8.8.8.8, and to your router) and optional DNS changes that you trigger manually.
- **Speed test** — only when you press "Start test", the app downloads and uploads test data
  to/from Cloudflare's speed-test service (`speed.cloudflare.com`, the same one used by
  speed.cloudflare.com). As with any website you visit, Cloudflare sees your IP address; the app
  sends nothing else. The test can use several hundred MB of data.

None of these send personal information about you; they only fetch public resources or apply
settings you selected.

### Contact

Questions? Open an issue at
<https://github.com/Pana1245/gaming-optimizer/issues>.
