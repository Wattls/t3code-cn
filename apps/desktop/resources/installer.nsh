!include "StrFunc.nsh"
!ifdef BUILD_UNINSTALLER
  ${UnStrRep}
  !define T3StrRep '${UnStrRep}'
!else
  ${StrRep}
  !define T3StrRep '${StrRep}'
!endif

!macro CNValidateInstallDirectory
  Push $0
  Push $1
  GetFullPathName $0 "$LOCALAPPDATA\Programs\t3code-cn"
  GetFullPathName $1 "$INSTDIR"
  ${If} $1 != $0
    MessageBox MB_OK|MB_ICONSTOP "T3 Code CN must use $0. Refusing to modify another installation." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro customInit
  !insertmacro CNValidateInstallDirectory
  Push $0
  Push $1
  Push $2
  Push $3
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" UninstallString
  ${If} $0 != ""
    StrCpy $1 '$\"$INSTDIR\'
    StrLen $2 $1
    StrCpy $3 $0 $2
    ${If} $3 != $1
      MessageBox MB_OK|MB_ICONSTOP "T3 Code CN found an unsafe uninstall record. Refusing to uninstall another installation." /SD IDOK
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro customUnInit
  !insertmacro CNValidateInstallDirectory
!macroend

!macro customAppRunningMessages
  Push $0
  Push $1
  ${If} $IsPowerShellAvailable == 0
    System::Call 'kernel32::SetEnvironmentVariable(t "T3CODE_INSTALL_DIR", t "$INSTDIR")'
    nsExec::ExecToStack `"$PowerShellPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and [IO.Path]::GetDirectoryName($$_.ExecutablePath) -eq $$env:T3CODE_INSTALL_DIR } | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($$_.ExecutablePath) } | Where-Object { $$_ -in 'T3 Code CN', 'T3 Code (Alpha)', 'T3 Code (Beta)', 'T3 Code (Nightly)' } | Select-Object -First 1 | ForEach-Object { [Console]::Write($$_) }"`
    Pop $0
    Pop $1
    System::Call 'kernel32::SetEnvironmentVariable(t "T3CODE_INSTALL_DIR", p 0)'
    ${If} $0 == 0
      ${If} $1 == "T3 Code CN"
      ${OrIf} $1 == "T3 Code (Alpha)"
      ${OrIf} $1 == "T3 Code (Beta)"
      ${OrIf} $1 == "T3 Code (Nightly)"
        ${T3StrRep} $appRunningMessage $appRunningMessage "${PRODUCT_NAME}" $1
        ${T3StrRep} $appClosingMessage $appClosingMessage "${PRODUCT_NAME}" $1
        ${T3StrRep} $appCannotBeClosedMessage $appCannotBeClosedMessage "${PRODUCT_NAME}" $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${IfNot} ${FileExists} "$newStartMenuLink"
      !insertmacro createMenuDirectory
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  !endif
!macroend
