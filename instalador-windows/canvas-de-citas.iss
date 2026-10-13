; Instalador de un solo archivo para Windows (Inno Setup 6): doble clic y listo, sin descomprimir.
; Envuelve Instalar.ps1 / Desinstalar.ps1 (Instalar.cmd hace lo mismo sin el .exe) y se registra en
; Configuración -> Aplicaciones para desinstalar. No pide permisos de administrador (salvo,
; opcional, la regla del firewall que pide Instalar.ps1).
; Lo compila scripts/empaquetar-release.sh:
;   iscc /DVersion=1.7.1 /DOrigen=<carpeta con el exe y los .ps1> /DSalida=<carpeta> canvas-de-citas.iss

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Origen
  #error Falta /DOrigen=<carpeta CanvasDeCitas-Windows>
#endif
#ifndef Salida
  #define Salida "."
#endif

[Setup]
AppId={{8B6F3C2A-4E1D-4C7B-9A55-CA1D7C17A501}
AppName=Canvas de Citas
AppVersion={#Version}
AppVerName=Canvas de Citas {#Version}
AppPublisher=Max
AppPublisherURL=https://github.com/1xmanMAX/canvas-de-citas
AppSupportURL=https://github.com/1xmanMAX/canvas-de-citas/issues
AppUpdatesURL=https://github.com/1xmanMAX/canvas-de-citas/releases/latest
DefaultDirName={localappdata}\CanvasDeCitas
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir={#Salida}
OutputBaseFilename=CanvasDeCitas-Instalar-Windows-v{#Version}
SetupIconFile={#Origen}\icon.ico
UninstallDisplayIcon={app}\Canvas de Citas.exe
UninstallDisplayName=Canvas de Citas
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; La app y el instalador de siempre van a una carpeta temporal: Instalar.ps1 los copia a su lugar.
Source: "{#Origen}\Canvas de Citas.exe"; DestDir: "{tmp}\instalar"; Flags: deleteafterinstall
Source: "{#Origen}\icon.ico"; DestDir: "{tmp}\instalar"; Flags: deleteafterinstall
Source: "{#Origen}\Instalar.ps1"; DestDir: "{tmp}\instalar"; Flags: deleteafterinstall
; Para desinstalar desde Configuración -> Aplicaciones.
Source: "{#Origen}\Desinstalar.ps1"; DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Desinstalar.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "QuitarCanvas"

[Run]
Filename: "{app}\Canvas de Citas.exe"; Description: "Abrir Canvas de Citas"; Flags: postinstall nowait skipifsilent

[Code]
procedure CurStepChanged(Paso: TSetupStep);
var
  Codigo: Integer;
begin
  if Paso = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Configurando la app y la sincronización por Wi-Fi...';
    if not Exec('powershell.exe',
        '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{tmp}\instalar\Instalar.ps1') + '"',
        ExpandConstant('{tmp}\instalar'), SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
      MsgBox('No se pudo terminar la instalación (código ' + IntToStr(Codigo) + '). ' +
        'Cierra Canvas de Citas y vuelve a ejecutar el instalador.', mbError, MB_OK);
  end;
end;
