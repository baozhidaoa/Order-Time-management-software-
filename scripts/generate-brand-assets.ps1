Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
  [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
  public static extern bool DestroyIcon(System.IntPtr handle);
"@

$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-PreferredSourcePath {
  $candidates = @(
    (Join-Path $repoRoot "images/Order.png"),
    (Join-Path $repoRoot "images/Order.jpg"),
    (Join-Path $repoRoot "images/Order.jpeg")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "未找到图标源文件，请至少提供 images/Order.png 或 images/Order.jpg。"
}

function Load-SourceBitmap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite
  )

  try {
    $loadedImage = [System.Drawing.Image]::FromStream($stream, $true, $true)
    try {
      return New-Object System.Drawing.Bitmap -ArgumentList $loadedImage
    } finally {
      $loadedImage.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$sourcePath = Get-PreferredSourcePath
$sourceImage = Load-SourceBitmap -Path $sourcePath
$sourceHasAlpha = $sourceImage.PixelFormat.ToString() -match "Alpha|PArgb"

function Save-ScaledPng {
  param(
    [string]$Path,
    [int]$Size,
    [double]$Scale = 1.0,
    [System.Drawing.Color]$BackgroundColor = [System.Drawing.Color]::White,
    [bool]$Transparent = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($Transparent) {
    $graphics.Clear([System.Drawing.Color]::Transparent)
  } else {
    $graphics.Clear($BackgroundColor)
  }

  $drawSize = [int][Math]::Round($Size * $Scale)
  $offset = [int][Math]::Floor(($Size - $drawSize) / 2)
  $graphics.DrawImage($sourceImage, $offset, $offset, $drawSize, $drawSize)

  $directory = Split-Path $Path -Parent
  if ($directory) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Save-Ico {
  param(
    [string]$Path,
    [int]$Size = 256,
    [bool]$Transparent = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($Transparent) {
    $graphics.Clear([System.Drawing.Color]::Transparent)
  } else {
    $graphics.Clear([System.Drawing.Color]::White)
  }

  $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)

  $directory = Split-Path $Path -Parent
  if ($directory) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  $iconHandle = $bitmap.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
  $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
  $icon.Save($fileStream)
  $fileStream.Dispose()
  $icon.Dispose()
  [Win32.NativeMethods]::DestroyIcon($iconHandle) | Out-Null
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host ("Using icon source: " + $sourcePath)

Save-ScaledPng -Path (Join-Path $repoRoot "images/Order.png") -Size 512 -Transparent:$sourceHasAlpha
Save-Ico -Path (Join-Path $repoRoot "images/Order.ico") -Size 256 -Transparent:$sourceHasAlpha

$launcherSizes = @{
  mdpi = 48
  hdpi = 72
  xhdpi = 96
  xxhdpi = 144
  xxxhdpi = 192
}

foreach ($density in $launcherSizes.Keys) {
  $size = $launcherSizes[$density]
  $baseDirectory = Join-Path $repoRoot ("android/app/src/main/res/mipmap-{0}" -f $density)

  Save-ScaledPng -Path (Join-Path $baseDirectory "ic_launcher.png") -Size $size -Transparent:$sourceHasAlpha
  Save-ScaledPng -Path (Join-Path $baseDirectory "ic_launcher_round.png") -Size $size -Transparent:$sourceHasAlpha
  Save-ScaledPng -Path (Join-Path $baseDirectory "ic_launcher_foreground.png") -Size $size -Scale 0.82 -Transparent $true
}

$iosIconPath = Join-Path $repoRoot "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
if (Test-Path (Split-Path $iosIconPath -Parent)) {
  Save-ScaledPng -Path $iosIconPath -Size 1024 -Transparent:$sourceHasAlpha
}

$sourceImage.Dispose()
