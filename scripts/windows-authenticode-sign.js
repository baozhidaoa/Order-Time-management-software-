const { spawnSync } = require("child_process");

function formatOutput(prefix, value) {
  if (!value) {
    return "";
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  return `${prefix}${text}`;
}

function shouldRetryForFileLock(result) {
  const combinedOutput = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  return /being used by another process|cannot access the file/i.test(combinedOutput);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sign(configuration) {
  const cscInfo = configuration.cscInfo;
  const certificateThumbprint = String(process.env.ORDER_SIGN_CERT_THUMBPRINT || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const hasPfxCertificate =
    cscInfo &&
    typeof cscInfo === "object" &&
    "file" in cscInfo &&
    cscInfo.file;

  if (!hasPfxCertificate && !certificateThumbprint) {
    throw new Error(
      "Windows custom signer requires a PFX certificate file or ORDER_SIGN_CERT_THUMBPRINT.",
    );
  }

  if (configuration.hash && configuration.hash.toLowerCase() !== "sha256") {
    return;
  }

  if (configuration.isNest) {
    return;
  }

  const script = `
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
$targetPath = $env:ORDER_SIGN_TARGET
$pfxPath = $env:ORDER_SIGN_PFX
$password = $env:ORDER_SIGN_PASSWORD
$thumbprint = $env:ORDER_SIGN_CERT_THUMBPRINT

if ($thumbprint) {
  $cert = Get-Item "Cert:\\CurrentUser\\My\\$thumbprint" -ErrorAction Stop
  if (-not $cert.HasPrivateKey) {
    throw "No private key is available for certificate: $thumbprint"
  }
}
else {
  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $password, $flags)
}
$null = Set-AuthenticodeSignature -FilePath $targetPath -Certificate $cert -HashAlgorithm SHA256
$verification = Get-AuthenticodeSignature -FilePath $targetPath

if (-not $verification.SignerCertificate) {
  throw "Authenticode signature was not written to file: $targetPath"
}

if ($verification.SignerCertificate.Thumbprint -ne $cert.Thumbprint) {
  throw "Authenticode signature thumbprint mismatch for file: $targetPath"
}
`;

  let result;
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = spawnSync(
      "pwsh.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "-",
      ],
      {
        input: script,
        encoding: "utf8",
        env: {
          ...process.env,
          ORDER_SIGN_TARGET: configuration.path,
          ORDER_SIGN_PFX: hasPfxCertificate ? cscInfo.file : "",
          ORDER_SIGN_PASSWORD: hasPfxCertificate ? cscInfo.password || "" : "",
          ORDER_SIGN_CERT_THUMBPRINT: certificateThumbprint,
        },
      },
    );

    if (result.status === 0) {
      return;
    }

    if (attempt < maxAttempts && shouldRetryForFileLock(result)) {
      await delay(2000 * attempt);
      continue;
    }

    const stdout = formatOutput("stdout:\n", result.stdout);
    const stderr = formatOutput("stderr:\n", result.stderr);
    throw new Error(
      `Authenticode signing failed for ${configuration.path}\n${stdout}${stdout && stderr ? "\n" : ""}${stderr}`,
    );
  }
}

module.exports = sign;
module.exports.default = sign;
module.exports.sign = sign;
