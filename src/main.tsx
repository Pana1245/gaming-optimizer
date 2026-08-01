import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './lib/i18n'
import { GameModeProvider } from './lib/gameMode'
import { UpdaterProvider } from './lib/updater'
import { InstallerProvider } from './lib/installer'
import { UninstallProvider } from './lib/uninstall'
import { initAccent } from './lib/theme'

initAccent()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <UpdaterProvider>
        <InstallerProvider>
          <UninstallProvider>
            <GameModeProvider>
              <App />
            </GameModeProvider>
          </UninstallProvider>
        </InstallerProvider>
      </UpdaterProvider>
    </I18nProvider>
  </StrictMode>,
)
