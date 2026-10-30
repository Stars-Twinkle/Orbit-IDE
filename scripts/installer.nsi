Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APP_NAME "Orbit IDE"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Orbit Labs"
!define APP_EXE "Orbit IDE.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Orbit IDE"
!define STAGE "..\.work\installer-stage"

Name "${APP_NAME}"
OutFile "..\release\Orbit-IDE-Setup-1.0.0.exe"
InstallDir "$LOCALAPPDATA\Programs\Orbit IDE"
InstallDirRegKey HKCU "Software\Orbit IDE" "InstallDir"
RequestExecutionLevel user
SetCompressor bzip2
ShowInstDetails show
ShowUninstDetails show
BrandingText "${APP_NAME} ${APP_VERSION}"

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APP_NAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "1.0.0.0"
VIAddVersionKey /LANG=2052 "ProductVersion" "1.0.0"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright (C) 2026 Orbit Labs"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "双模式、AI 原生的代码编辑器。$\r$\n$\r$\nOI 模式专注 C/C++ 竞赛，开发模式支持多语言。AI 可以通过本地 Login 接口连接，并由你在 IDE 内批准。$\r$\n$\r$\n安装到当前用户目录，无需管理员权限。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "启动 ${APP_NAME}"
!define MUI_FINISHPAGE_TEXT "${APP_NAME} 已安装。$\r$\n$\r$\nAI 接入说明位于：$INSTDIR\AI-CONNECT.md$\r$\n首次启动若出现安全警告，请选择“更多信息” -> “仍要运行”。"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Orbit IDE" SecMain
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\Orbit IDE"
  CreateShortcut "$SMPROGRAMS\Orbit IDE\Orbit IDE.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\Orbit IDE\卸载 Orbit IDE.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Orbit IDE.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" 285000
  WriteRegStr HKCU "Software\Orbit IDE" "InstallDir" "$INSTDIR"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Orbit IDE.lnk"
  Delete "$SMPROGRAMS\Orbit IDE\Orbit IDE.lnk"
  Delete "$SMPROGRAMS\Orbit IDE\卸载 Orbit IDE.lnk"
  RMDir "$SMPROGRAMS\Orbit IDE"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Orbit IDE"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd
