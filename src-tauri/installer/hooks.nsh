; Hooks del instalador NSIS de Gaming Optimizer.
; Al DESINSTALAR, borra la tarea "iniciar con Windows" (tray.rs). En una actualización
; el instalador corre el desinstalador viejo con /UPDATE ($UpdateMode = 1): ahí se
; conserva, porque la ruta del exe no cambia.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::Exec 'schtasks /Delete /TN "GamingOptimizer Autostart" /F'
  ${EndIf}
!macroend

; Hasta la 2.5.x la app se instalaba POR USUARIO: sus accesos apuntan a la carpeta vieja, y en
; una actualización el instalador no crea accesos. Sin esto la versión nueva (Program Files)
; quedaba sin ningún acceso y se seguía abriendo la vieja.
!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current
  StrCpy $R5 0
  ${If} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R5 1
  ${EndIf}
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  SetShellVarContext all
  ${If} $R5 = 0
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  ; Reabrir la app tras actualizar: el relanzamiento de Tauri (RunAsUser, SIN elevar) con UAC
  ; activo sólo muestra un aviso de UAC; si se ignora o se rechaza, la app "desaparecía". Desde
  ; acá (instalador elevado) se abre 20 s después SÓLO si no está abierta: da tiempo a aceptar
  ; el aviso, y abrir las dos juntas dejaba dos ventanas (carrera de la instancia única).
  ${If} $UpdateMode = 1
    ClearErrors
    ${GetOptions} $CMDLINE "/R" $R6
    ${IfNot} ${Errors}
      ExecShell "" "powershell.exe" `-NoProfile -WindowStyle Hidden -Command "Start-Sleep 20; $$e='$INSTDIR\${MAINBINARYNAME}.exe'; if(-not (Get-Process ${MAINBINARYNAME} -EA SilentlyContinue | Where-Object { $$_.Path -eq $$e })){ Start-Process $$e }"` SW_HIDE
    ${EndIf}
  ${EndIf}
!macroend
