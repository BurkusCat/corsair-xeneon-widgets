' Starts the Claude Control bridge without a console window. Used by install-startup.ps1.
Set fso = CreateObject("Scripting.FileSystemObject")
bridgeDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = bridgeDir
shell.Run "node """ & bridgeDir & "\server.mjs""", 0, False
