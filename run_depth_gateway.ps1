$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SdkLib = Join-Path $RepoRoot "pyorbbecsdk\install\lib"
$Python = "C:\Users\haihui\AppData\Local\Programs\Python\Python311\python.exe"

$env:PYTHONPATH = $SdkLib
$env:PATH = $SdkLib + ";" + $env:PATH

& $Python (Join-Path $RepoRoot "depth_gateway.py")
