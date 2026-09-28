; Hooks del instalador NSIS de Gaming Optimizer.
; Al DESINSTALAR, borra la tarea "iniciar con Windows" (tray.rs). En una actualización
; el instalador corre el desinstalador viejo con /UPDATE ($UpdateMode = 1): ahí se
; conserva, porque la ruta del exe no cambia.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::Exec 'schtasks /Delete /TN "GamingOptimizer Autostart" /F'
  ${EndIf}
!macroend
