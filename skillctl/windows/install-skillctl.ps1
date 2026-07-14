param(
    [string]$SourcePath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$installDir = Join-Path $env:LOCALAPPDATA "Programs\skillctl"
$targetPath = Join-Path $installDir "skillctl.exe"

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $candidates = @(
        (Join-Path $PSScriptRoot "skillctl-windows-amd64.exe"),
        (Join-Path $PSScriptRoot "skillctl.exe")
    )
    $SourcePath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($SourcePath) -or -not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "skillctl executable not found. Put install-skillctl.ps1 and skillctl-windows-amd64.exe in the same directory, then run the installer again."
}

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

if (-not [string]::Equals($resolvedSource, $targetPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    Copy-Item -LiteralPath $resolvedSource -Destination $targetPath -Force
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$normalizedInstallDir = $installDir.TrimEnd("\")
$alreadyInPath = $pathEntries | Where-Object {
    [string]::Equals($_.Trim().TrimEnd("\"), $normalizedInstallDir, [System.StringComparison]::OrdinalIgnoreCase)
}

if (-not $alreadyInPath) {
    $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
        $installDir
    } else {
        "$($userPath.TrimEnd(';'));$installDir"
    }
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
}

if (($env:Path -split ";") -notcontains $installDir) {
    $env:Path = "$env:Path;$installDir"
}

Write-Host "skillctl installed successfully:" -ForegroundColor Green
Write-Host "  $targetPath"
Write-Host ""
Write-Host "Open a new CMD or PowerShell window, then run:"
Write-Host "  skillctl help" -ForegroundColor Cyan
