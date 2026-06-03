<#
.SYNOPSIS
  Hoolix installer for Windows PowerShell 5.1+ and PowerShell 7+.

.DESCRIPTION
  Downloads the matching Windows release binary, installs it into a user-writable
  directory, and optionally adds that directory to the user PATH.
#>

[CmdletBinding()]
param(
    [string]$Version = "latest",
    [string]$Prefix = "",
    [switch]$NoPathUpdate,
    [switch]$Stable,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

$Repo = "JayLLM/hoolix"
$BinaryName = "hoolix"
$GitHubApi = "https://api.github.com/repos/$Repo/releases"

function Write-Banner {
    Write-Host ""
    Write-Host "  Hoolix" -ForegroundColor Cyan
    Write-Host "  Forge documentation into powerful MCP servers." -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step    { param([string]$Message) Write-Host "[>] $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn    { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }
function Write-Err     { param([string]$Message) Write-Host "[X] $Message" -ForegroundColor Red }
function Write-Info    { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }

function Show-Help {
    Write-Host @"
Hoolix Windows Installer

Usage:
  .\install.ps1
  .\install.ps1 -Version v0.0.1-beta.0
\.\install.ps1 -Prefix C:\Tools\hoolix

Options:
  -Version <tag|latest>   Specific release tag or "latest" (default: latest)
  -Prefix <path>          Custom installation directory
  -Stable                 Ignore prereleases when resolving "latest"
  -NoPathUpdate           Do not modify user PATH
  -Help                   Show this help
"@
}

function Get-Release {
    param(
        [string]$RequestedVersion,
        [bool]$StableOnly
    )

    $headers = @{
        "User-Agent" = "hoolix-installer"
        "Accept" = "application/vnd.github+json"
    }

    if ($RequestedVersion -ne "latest") {
        $tag = $RequestedVersion.TrimStart("v")
        $tag = "v$tag"
        Write-Step "Querying GitHub release $tag..."
        return Invoke-RestMethod -Uri "$GitHubApi/tags/$tag" -Headers $headers
    }

    Write-Step "Querying GitHub releases..."
    $releases = Invoke-RestMethod -Uri "${GitHubApi}?per_page=20" -Headers $headers
    $candidates = @($releases | Where-Object {
        -not $_.draft -and (-not $StableOnly -or -not $_.prerelease)
    })

    if ($candidates.Count -eq 0) {
        throw "No matching GitHub releases found for $Repo."
    }

    return $candidates[0]
}

function Get-Asset {
    param(
        [object]$Release,
        [string]$AssetName
    )

    $asset = @($Release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1)
    if (-not $asset) {
        $available = @($Release.assets | ForEach-Object { $_.name }) -join ", "
        throw "Release $($Release.tag_name) does not contain $AssetName. Available assets: $available"
    }

    return $asset
}

function Add-UserPath {
    param([string]$Directory)

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $parts = @()
    if ($currentPath) {
        $parts = @($currentPath -split ";" | Where-Object { $_ })
    }

    $alreadyPresent = $parts | Where-Object {
        $_.TrimEnd("\") -ieq $Directory.TrimEnd("\")
    }

    if ($alreadyPresent) {
        Write-Info "Install location already in user PATH."
        return
    }

    $newPath = if ($currentPath) { "$Directory;$currentPath" } else { $Directory }
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    $env:PATH = "$Directory;$env:PATH"
    Write-Success "Added install location to user PATH."
    Write-Warn "Open a new PowerShell window before using hoolix from PATH."
}

if ($Help) {
    Show-Help
    exit 0
}

try {
    Write-Banner

    $detectedArch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") {
        "arm64"
    } elseif ([System.Environment]::Is64BitOperatingSystem) {
        "x64"
    } else {
        "x86"
    }

    if ($detectedArch -eq "x86") {
        throw "32-bit Windows is not supported."
    }

    $arch = $detectedArch
    if ($detectedArch -eq "arm64") {
        Write-Warn "Windows ARM64 release assets are not published yet; installing the Windows x64 binary under emulation."
        $arch = "x64"
    }

    $assetName = "$BinaryName-windows-$arch.exe"
    Write-Step "Detected windows-$detectedArch; using $assetName"

    $release = Get-Release -RequestedVersion $Version -StableOnly ([bool]$Stable)
    $asset = Get-Asset -Release $release -AssetName $assetName

    Write-Success "Selected release $($release.tag_name)"
    if ($release.prerelease) {
        Write-Warn "Installing prerelease build $($release.tag_name)."
    }
    Write-Info "Asset: $($asset.name)"

    if ($Prefix) {
        $installDir = [System.IO.Path]::GetFullPath($Prefix)
    } else {
        $installDir = Join-Path $env:LOCALAPPDATA "Programs\hoolix"
    }

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    $target = Join-Path $installDir "$BinaryName.exe"
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "$BinaryName-$($release.tag_name)-$arch.exe"

    Write-Step "Downloading $($asset.browser_download_url)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -Headers @{ "User-Agent" = "hoolix-installer" }

    if (-not (Test-Path $tmp)) {
        throw "Download did not create $tmp."
    }

    Write-Step "Installing to $target"
    Copy-Item -Path $tmp -Destination $target -Force
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Write-Success "Binary installed."

    try {
        $installedVersion = & $target --version 2>$null
        if ($installedVersion) {
            Write-Success "Version check: $installedVersion"
        } else {
            Write-Warn "Binary ran but did not print a version."
        }
    } catch {
        Write-Warn "Binary installed but could not execute: $($_.Exception.Message)"
    }

    if (-not $NoPathUpdate) {
        Add-UserPath -Directory $installDir
    }

    Write-Step "Running first-run diagnostics..."
    try {
        & $target doctor
    } catch {
        Write-Warn "Doctor returned a non-zero exit code. Run '$target doctor' for details."
    }

    Write-Host ""
    Write-Success "Installation complete."
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "  hoolix --help" -ForegroundColor Cyan
    Write-Host "  hoolix doctor" -ForegroundColor Cyan
    Write-Host "  hoolix create `"My Docs`" --url https://example.com/llms.txt --yes" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Documentation: https://github.com/$Repo" -ForegroundColor DarkGray
    Write-Host ""
} catch {
    Write-Host ""
    Write-Err $_.Exception.Message
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - Check the release page: https://github.com/$Repo/releases" -ForegroundColor Cyan
    Write-Host "  - Install a specific release: .\install.ps1 -Version v0.0.1-beta.0" -ForegroundColor Cyan
    Write-Host "  - Use a custom install dir: .\install.ps1 -Prefix C:\Tools\hoolix" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
