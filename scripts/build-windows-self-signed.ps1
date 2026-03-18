param(
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [string]$PfxPath,
    [bool]$CreateCertificateIfMissing = $true
)

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($PfxPath)) {
    $PfxPath = Join-Path $scriptRoot "..\certs\OrderInternal.pfx"
}

$resolvedPfxPath = [System.IO.Path]::GetFullPath($PfxPath)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))

if (-not (Test-Path -LiteralPath $resolvedPfxPath)) {
    if (-not $CreateCertificateIfMissing) {
        throw "PFX not found: $resolvedPfxPath"
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptRoot "new-windows-self-signed-cert.ps1") `
        -Password $Password `
        -OutputDir ([System.IO.Path]::GetDirectoryName($resolvedPfxPath)) `
        -PfxName ([System.IO.Path]::GetFileName($resolvedPfxPath)) `
        -CerName ("{0}.cer" -f [System.IO.Path]::GetFileNameWithoutExtension($resolvedPfxPath))
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create self-signed Windows certificate."
    }
}

$env:WIN_CSC_LINK = $resolvedPfxPath
$env:WIN_CSC_KEY_PASSWORD = $Password

Push-Location $repoRoot
try {
    & npm.cmd run dist:win
    if ($LASTEXITCODE -ne 0) {
        throw "Signed Windows build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
