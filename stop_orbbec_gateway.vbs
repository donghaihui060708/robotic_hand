Set shell = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command " & Chr(34) & _
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*depth_gateway.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" & Chr(34)
shell.Run cmd, 0, True
