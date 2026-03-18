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

async function sign(configuration) {
  const cscInfo = configuration.cscInfo;
  if (!cscInfo || typeof cscInfo !== "object" || !("file" in cscInfo) || !cscInfo.file) {
    throw new Error("Windows custom signer requires a PFX certificate file.");
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

$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $password, $flags)
$null = Set-AuthenticodeSignature -FilePath $targetPath -Certificate $cert -HashAlgorithm SHA256
$verification = Get-AuthenticodeSignature -FilePath $targetPath

if (-not $verification.SignerCertificate) {
  throw "Authenticode signature was not written to file: $targetPath"
}

if ($verification.SignerCertificate.Thumbprint -ne $cert.Thumbprint) {
  throw "Authenticode signature thumbprint mismatch for file: $targetPath"
}
`;

  const result = spawnSync(
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
        ORDER_SIGN_PFX: cscInfo.file,
        ORDER_SIGN_PASSWORD: cscInfo.password || "",
      },
    },
  );

  if (result.status !== 0) {
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
