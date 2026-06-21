[Setup]
AppId={{VOICEFLOW-1234-5678-ABCD}
AppName=VoiceFlow
AppVersion=1.0.0
AppPublisher=SudutKamar
AppPublisherURL=https://github.com/sudutkamar/VoiceFlow
DefaultDirName={autopf}\VoiceFlow
DefaultGroupName=VoiceFlow
OutputDir=C:\Users\cgnscr\Documents\Dev\Code\VoiceFlow\release-assets
OutputBaseFilename=VoiceFlow-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Start with Windows"; GroupDescription: "Startup:"

[Files]
Source: "C:\Users\cgnscr\Documents\Dev\Code\VoiceFlow\release\VoiceFlow\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\VoiceFlow"; Filename: "{app}\VoiceFlow.exe"
Name: "{group}\{cm:UninstallProgram,VoiceFlow}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\VoiceFlow"; Filename: "{app}\VoiceFlow.exe"; Tasks: desktopicon
Name: "{userstartup}\VoiceFlow"; Filename: "{app}\VoiceFlow.exe"; Tasks: startupicon

[Run]
Filename: "{app}\VoiceFlow.exe"; Description: "{cm:LaunchProgram,VoiceFlow}"; Flags: nowait postinstall skipifsilent
