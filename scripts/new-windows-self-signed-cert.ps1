param(
    [string]$Subject = "CN=Order Internal Code Signing",
    [string]$FriendlyName = "Order Internal Code Signing",
    [string]$OutputDir,
    [string]$PfxName = "OrderInternal.pfx",
    [string]$CerName = "OrderInternal.cer",
    [Parameter(Mandatory = $true)]
    [string]$Password,
    [string]$StoreLocation = "CurrentUser\My",
    [int]$ValidYears = 10
)

function Resolve-StoreInfo {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Location
    )

    $normalized = $Location.Trim()
    if ($normalized.StartsWith("Cert:\", [System.StringComparison]::OrdinalIgnoreCase)) {
        $normalized = $normalized.Substring(6)
    }

    $parts = $normalized.Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($parts.Length -lt 2) {
        throw "StoreLocation must look like 'CurrentUser\\My' or 'LocalMachine\\My'."
    }

    $storeLocation = switch -Regex ($parts[0]) {
        "^CurrentUser$" { [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser; break }
        "^LocalMachine$" { [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine; break }
        default { throw "Unsupported store location: $($parts[0])" }
    }

    return @{
        StoreLocation = $storeLocation
        StoreName = $parts[1]
    }
}

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $scriptRoot "..\certs"
}

$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$storeInfo = Resolve-StoreInfo -Location $StoreLocation
$notBefore = [System.DateTimeOffset]::UtcNow.AddMinutes(-5)
$notAfter = $notBefore.AddYears($ValidYears)
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$distinguishedName = [System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new($Subject)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    $distinguishedName,
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$enhancedKeyUsage = [System.Security.Cryptography.OidCollection]::new()
[void]$enhancedKeyUsage.Add([System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.3", "Code Signing"))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($enhancedKeyUsage, $false))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $false))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $false))
$certificate = $request.CreateSelfSigned($notBefore, $notAfter)

if (-not $certificate) {
    throw "Failed to create self-signed code signing certificate."
}

$pfxPath = Join-Path $resolvedOutputDir $PfxName
$cerPath = Join-Path $resolvedOutputDir $CerName
[System.IO.File]::WriteAllBytes(
    $pfxPath,
    $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password)
)
[System.IO.File]::WriteAllBytes(
    $cerPath,
    $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
)

$persistedCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $pfxPath,
    $Password,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bor
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new($storeInfo.StoreName, $storeInfo.StoreLocation)
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
    $store.Add($persistedCertificate)
}
finally {
    $store.Close()
}

if (-not (Test-Path -LiteralPath $pfxPath)) {
    throw "Failed to export PFX certificate: $pfxPath"
}

if (-not (Test-Path -LiteralPath $cerPath)) {
    throw "Failed to export CER certificate: $cerPath"
}

Write-Host "Created self-signed code signing certificate."
Write-Host "PFX: $pfxPath"
Write-Host "CER: $cerPath"
Write-Host ""
Write-Host "Next:"
Write-Host "  `$env:WIN_CSC_LINK=`"$pfxPath`""
Write-Host "  `$env:WIN_CSC_KEY_PASSWORD=`"$Password`""
Write-Host "  npm run dist:win"
