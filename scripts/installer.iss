#define MyAppName "Orbit IDE"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Orbit Labs"
#define MyAppExeName "Orbit IDE.exe"
#define MyStage "..\.work\installer-stage"

[Setup]
AppId={{8F2A4C6E-9E3A-4B1D-9C3E-2F5D6A7B8C90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://example.invalid/orbit-ide
AppSupportURL=https://example.invalid/orbit-ide
AppUpdatesURL=https://example.invalid/orbit-ide
DefaultDirName={localappdata}\Programs\Orbit IDE
DefaultGroupName=Orbit IDE
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=Orbit-IDE-Setup-1.0.0
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
CloseApplications=no
RestartApplications=no
SetupLogging=yes
VersionInfoVersion=1.0.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} 安装程序
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："; Flags: checkedonce

[Files]
Source: "{#MyStage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Orbit IDE"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 Orbit IDE"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Orbit IDE"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 Orbit IDE"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\launcher.log"
Type: files; Name: "{app}\runtime.log"
