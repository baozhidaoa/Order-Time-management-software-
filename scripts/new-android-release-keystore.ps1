param(
    [string]$AndroidDir,
    [string]$KeystoreName = "release.jks",
    [Parameter(Mandatory = $true)]
    [string]$StorePassword,
    [string]$KeyAlias = "order",
    [string]$KeyPassword,
    [string]$DName = "CN=Order, OU=Open Source, O=Order, L=Shanghai, S=Shanghai, C=CN",
    [int]$ValidityDays = 10000,
    [switch]$SkipKeyProperties
)

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($AndroidDir)) {
    $AndroidDir = Join-Path $scriptRoot "..\ControlerApp\android"
}

if ([string]::IsNullOrWhiteSpace($KeyPassword)) {
    $KeyPassword = $StorePassword
}

if ($StorePassword.Length -lt 6) {
    throw "StorePassword must be at least 6 characters."
}

if ($KeyPassword.Length -lt 6) {
    throw "KeyPassword must be at least 6 characters."
}

$resolvedAndroidDir = [System.IO.Path]::GetFullPath($AndroidDir)
if (-not (Test-Path -LiteralPath $resolvedAndroidDir)) {
    throw "Android directory not found: $resolvedAndroidDir"
}

$keystorePath = Join-Path $resolvedAndroidDir $KeystoreName
if (Test-Path -LiteralPath $keystorePath) {
    throw "Keystore already exists: $keystorePath`nDo not replace an existing release keystore unless you intentionally want to break upgrade compatibility."
}

$keytoolPath = $null
$keytoolCommand = Get-Command keytool -ErrorAction SilentlyContinue
if ($keytoolCommand) {
    $keytoolPath = $keytoolCommand.Source
}
elseif ($env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path -LiteralPath $candidate) {
        $keytoolPath = $candidate
    }
}

if (-not $keytoolPath) {
    throw "keytool not found. Install a JDK or set JAVA_HOME to a JDK directory."
}

& $keytoolPath `
    -genkeypair `
    -v `
    -keystore $keystorePath `
    -storetype JKS `
    -storepass $StorePassword `
    -keypass $KeyPassword `
    -alias $KeyAlias `
    -keyalg RSA `
    -keysize 2048 `
    -validity $ValidityDays `
    -dname $DName

if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE"
}

if (-not $SkipKeyProperties) {
    $keyPropertiesPath = Join-Path $resolvedAndroidDir "key.properties"
    @(
        "storeFile=$KeystoreName"
        "storePassword=$StorePassword"
        "keyAlias=$KeyAlias"
        "keyPassword=$KeyPassword"
    ) | Set-Content -LiteralPath $keyPropertiesPath -Encoding ASCII

    Write-Host "Created key.properties: $keyPropertiesPath"
}

Write-Host "Created Android release keystore: $keystorePath"
Write-Host "Next:"
Write-Host "  npm run mobile:apk"
