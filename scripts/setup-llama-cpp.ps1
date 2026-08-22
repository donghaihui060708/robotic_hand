$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repoRoot 'third_party\llama.cpp'
$commit = 'b3fed31b99f9bd37725833674252bccb429bb183'

if (-not (Test-Path -LiteralPath $target)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    git clone --filter=blob:none https://github.com/ggml-org/llama.cpp.git $target
}

git -C $target fetch --depth 1 origin $commit
git -C $target checkout --detach $commit
Write-Host "llama.cpp is ready at $commit"
