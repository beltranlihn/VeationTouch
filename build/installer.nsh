; VEATION Touch — NSIS hooks (picked up automatically by electron-builder).
; Tablets on the LAN must reach the built-in web server, so the installer (elevated, per-machine)
; allows incoming connections to the app on every network profile, and the uninstaller removes it.

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="VEATION Touch"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="VEATION Touch" dir=in action=allow program="$INSTDIR\VEATION Touch.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="VEATION Touch"'
!macroend
