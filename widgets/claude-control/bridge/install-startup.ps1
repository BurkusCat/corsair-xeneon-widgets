# Start the Claude Control bridge automatically when you sign in to Windows.
#
#   powershell -ExecutionPolicy Bypass -File install-startup.ps1           add the Startup shortcut
#   powershell -ExecutionPolicy Bypass -File install-startup.ps1 -Remove   remove it
#
# The shortcut runs start-hidden.vbs, which launches `node server.mjs` with no window.
param([switch]$Remove)

$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Claude Control Bridge.lnk'

if ($Remove) {
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Confirm:$false
        Write-Output "Removed $shortcutPath"
    } else {
        Write-Output "Nothing to remove."
    }
    exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is not on PATH. Install Node.js 20 or newer first."
    exit 1
}

$launcher = Join-Path $PSScriptRoot 'start-hidden.vbs'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Claude Control bridge for the XENEON EDGE widget'
$shortcut.Save()
Write-Output "Created $shortcutPath"
Write-Output "Start it now without signing out: wscript `"$launcher`""
