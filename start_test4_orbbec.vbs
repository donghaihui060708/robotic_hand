Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
gateway = root & "\run_depth_gateway.ps1"
page = root & "\test4.html"

shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & gateway & Chr(34), 0, False
WScript.Sleep 1200
shell.Run Chr(34) & page & Chr(34), 1, False
