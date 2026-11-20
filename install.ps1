<#
.SYNOPSIS
  Install, update, list, or uninstall the Swift Agent Skills Antigravity plugins.

.DESCRIPTION
  Downloads modular Swift and Apple platform skill packs from
  momochisoundpost/Swift-Agent-Skills-Antigravity and installs them for
  Google Antigravity on Windows. By default, installs only swift-core (5 skills)
  to keep the active context window lean. Compatible with Windows PowerShell 5.1+
  and PowerShell 7+ with zero external dependencies.
#>
[CmdletBinding()]
param(
  [string[]]$Packs,
  [switch]$All,
  [switch]$AllDisabled,
  [switch]$Workspace,
  [string]$Destination,
  [string]$Version,
  [string]$FromZip,
  [switch]$List,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$RepoSlug = 'momochisoundpost/Swift-Agent-Skills-Antigravity'
$AssetName = 'swift-agent-skills-antigravity.zip'
$DefaultPack = 'swift-core'

$PackTable = @(
  [pscustomobject]@{ Name = 'swift-core';             Alias = 'core';          Skills = 5;  Summary = 'SwiftUI, SwiftData, Concurrency, Testing, API Guidelines (default)' }
  [pscustomobject]@{ Name = 'swift-ui-craft';         Alias = 'ui-craft';      Skills = 7;  Summary = 'SwiftUI patterns, refactoring, perf audit, design, accessibility, UX' }
  [pscustomobject]@{ Name = 'swift-apple-frameworks'; Alias = 'frameworks';    Skills = 7;  Summary = 'FormatStyle, App Intents, Background, Observability, Widgets, Core Data' }
  [pscustomobject]@{ Name = 'swift-quality';          Alias = 'quality';       Skills = 3;  Summary = 'Architecture, security hardening, and codebase audit' }
  [pscustomobject]@{ Name = 'swift-app-store';        Alias = 'app-store';     Skills = 3;  Summary = 'App Store changelogs, ASO, and App Review guidelines' }
  [pscustomobject]@{ Name = 'swift-asc-cli';          Alias = 'asc-cli';       Skills = 26; Summary = 'App Store Connect CLI (asc) automation (requires asc CLI)' }
  [pscustomobject]@{ Name = 'swift-ios-simulator';    Alias = 'ios-simulator'; Skills = 1;  Summary = 'iOS Simulator automation (macOS + Xcode + Python 3.12 + idb only)' }
  [pscustomobject]@{ Name = 'swift-extras';           Alias = 'extras';        Skills = 9;  Summary = 'Alternative Concurrency, Testing, SwiftData, Accessibility perspectives' }
)

function Exit-WithUsageError {
  param([string]$Message)
  [Console]::Error.WriteLine($Message)
  exit 2
}

function Resolve-FullLocalPath {
  param([string]$RawPath)
  $basePath = (Get-Location).ProviderPath
  if ([System.IO.Path]::IsPathRooted($RawPath)) {
    $full = [System.IO.Path]::GetFullPath($RawPath)
  } else {
    $full = [System.IO.Path]::GetFullPath((Join-Path $basePath $RawPath))
  }
  $trimmed = $full.TrimEnd('\', '/')
  if ($trimmed -match '^[A-Za-z]:$') {
    return "$trimmed\"
  }
  if ($trimmed -eq '') {
    return $full
  }
  return $trimmed
}

function Resolve-DestinationRoot {
  param(
    [string]$CustomDestination,
    [bool]$HasCustomDestination,
    [switch]$UseWorkspace
  )

  if ($HasCustomDestination -and [string]::IsNullOrWhiteSpace($CustomDestination)) {
    Exit-WithUsageError 'Error: -Destination cannot be empty.'
  }

  if (-not [string]::IsNullOrWhiteSpace($CustomDestination)) {
    return Resolve-FullLocalPath -RawPath $CustomDestination
  }

  if ($UseWorkspace) {
    $wsPath = Join-Path (Get-Location).ProviderPath '.agents\plugins'
    return Resolve-FullLocalPath -RawPath $wsPath
  }

  if ([string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    throw 'USERPROFILE environment variable is not set. Specify -Destination or -Workspace.'
  }

  $globalPath = Join-Path $env:USERPROFILE '.gemini\config\plugins'
  return Resolve-FullLocalPath -RawPath $globalPath
}

function Resolve-SelectedPacks {
  param(
    [string[]]$RequestedPacks,
    [bool]$HasPacksParam,
    [bool]$InstallAll,
    [bool]$InstallAllDisabled,
    [bool]$DoUninstall
  )

  $aliasMap = @{}
  $validLabels = @()
  foreach ($entry in $PackTable) {
    $aliasMap[$entry.Name.ToLowerInvariant()] = $entry.Name
    $aliasMap[$entry.Alias.ToLowerInvariant()] = $entry.Name
    $validLabels += "$($entry.Name) ($($entry.Alias))"
  }
  $validListText = $validLabels -join ', '

  if ($InstallAll -or $InstallAllDisabled) {
    return @($PackTable | ForEach-Object { $_.Name })
  }

  if ($HasPacksParam) {
    $tokens = @(
      $RequestedPacks |
        ForEach-Object { if ($null -ne $_) { $_ -split ',' } } |
        ForEach-Object { $_.Trim().ToLowerInvariant() } |
        Where-Object { $_ -ne '' }
    )

    if ($tokens.Count -eq 0) {
      Exit-WithUsageError "No packs specified. Valid packs: $validListText"
    }

    $selected = @()
    foreach ($token in $tokens) {
      if (-not $aliasMap.ContainsKey($token)) {
        Exit-WithUsageError "Unknown pack '$token'. Valid packs: $validListText"
      }
      $canonical = $aliasMap[$token]
      if ($selected -notcontains $canonical) {
        $selected += $canonical
      }
    }
    return $selected
  }

  if ($DoUninstall) {
    return @($PackTable | ForEach-Object { $_.Name })
  }

  return @($DefaultPack)
}

function Show-PackTable {
  param([string]$DestRoot)

  $rows = foreach ($entry in $PackTable) {
    $packDir = Join-Path $DestRoot $entry.Name
    $installedLabel = if (Test-Path -LiteralPath $packDir -PathType Container) { 'Yes' } else { 'No' }
    [pscustomobject]@{
      Name      = $entry.Name
      Alias     = $entry.Alias
      Skills    = $entry.Skills
      Installed = $installedLabel
      Summary   = $entry.Summary
    }
  }

  $formatted = ($rows | Format-Table -AutoSize | Out-String -Width 4096).TrimEnd()
  Write-Host $formatted
  Write-Host ''
  Write-Host "Destination: $DestRoot"
}

function Invoke-PackUninstall {
  param(
    [string[]]$SelectedPacks,
    [string]$DestRoot
  )

  foreach ($packName in $SelectedPacks) {
    $target = Join-Path $DestRoot $packName
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
      Write-Host "Removed '$packName' from $target"
    } else {
      Write-Host "Pack '$packName' is not installed at $target"
    }
  }

  Write-Host 'Done. Open Antigravity -> Customizations -> Installed to confirm.'
}

function Resolve-ArchiveDownload {
  param(
    [string]$RequestedVersion,
    [hashtable]$Headers
  )

  if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) {
    $trimmedVer = $RequestedVersion.Trim()
    $tag = if ($trimmedVer.StartsWith('v')) { $trimmedVer } else { "v$trimmedVer" }
    return [pscustomobject]@{
      Url       = "https://github.com/$RepoSlug/releases/download/$tag/$AssetName"
      Label     = "release $tag"
      Explicit  = $true
      Tag       = $tag
    }
  }

  try {
    $latestUrl = "https://api.github.com/repos/$RepoSlug/releases/latest"
    $release = Invoke-RestMethod -Uri $latestUrl -Headers $Headers -Method Get
    if ($release -and $release.assets) {
      $asset = $release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
      if ($asset -and $asset.browser_download_url) {
        return [pscustomobject]@{
          Url      = $asset.browser_download_url
          Label    = "release $($release.tag_name)"
          Explicit = $false
          Tag      = $release.tag_name
        }
      }
    }
    Write-Warning "Latest GitHub release does not contain '$AssetName'; falling back to main branch archive."
  } catch {
    Write-Warning 'No GitHub release archive available yet; falling back to main branch archive.'
  }

  return [pscustomobject]@{
    Url      = "https://github.com/$RepoSlug/archive/refs/heads/main.zip"
    Label    = 'main branch archive'
    Explicit = $false
    Tag      = 'main'
  }
}

function Find-PluginSourceDir {
  param(
    [string]$ExtractDir,
    [string]$PluginName
  )

  # Release zip layout: <extract>/<pack>/plugin.json
  $direct = Join-Path $ExtractDir $PluginName
  if (Test-Path -LiteralPath (Join-Path $direct 'plugin.json') -PathType Leaf) {
    return $direct
  }

  # GitHub branch-archive layout: <extract>/<repo>-<ref>/antigravity/plugins/<pack>/plugin.json
  $topDirs = Get-ChildItem -LiteralPath $ExtractDir -Directory
  foreach ($dir in $topDirs) {
    $nested = Join-Path (Join-Path (Join-Path $dir.FullName 'antigravity') 'plugins') $PluginName
    if (Test-Path -LiteralPath (Join-Path $nested 'plugin.json') -PathType Leaf) {
      return $nested
    }
  }

  return $null
}

function Set-StagedPackDisabled {
  param([string]$StagedPackDir)

  $manifestPath = Join-Path $StagedPackDir 'plugin.json'
  $rawText = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
  if ($rawText -match '"disabled"\s*:') {
    return
  }

  $newline = if ($rawText.Contains("`r`n")) { "`r`n" } else { "`n" }
  $multilineRegex = [regex]'^\{[ \t]*\r?\n'
  if ($multilineRegex.IsMatch($rawText)) {
    $replacement = "{$newline  `"disabled`": true,$newline"
    $updatedText = $multilineRegex.Replace($rawText, $replacement, 1)
  } elseif ($rawText -match '^\{') {
    $singlelineRegex = [regex]'^\{'
    $updatedText = $singlelineRegex.Replace($rawText, '{"disabled": true, ', 1)
  } else {
    throw "Invalid plugin.json format in $manifestPath"
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($manifestPath, $updatedText, $utf8NoBom)
}

$hasPacks = $PSBoundParameters.ContainsKey('Packs')
$hasDestination = $PSBoundParameters.ContainsKey('Destination')
$hasFromZip = $PSBoundParameters.ContainsKey('FromZip')
$hasVersion = $PSBoundParameters.ContainsKey('Version')

if ($All -and $AllDisabled) {
  Exit-WithUsageError 'Error: -All and -AllDisabled cannot be used together.'
}
if ($All -and $hasPacks) {
  Exit-WithUsageError 'Error: -All and -Packs cannot be used together.'
}
if ($AllDisabled -and $hasPacks) {
  Exit-WithUsageError 'Error: -AllDisabled and -Packs cannot be used together.'
}
if ($List -and $Uninstall) {
  Exit-WithUsageError 'Error: -List and -Uninstall cannot be used together.'
}
if ($Uninstall -and $AllDisabled) {
  Exit-WithUsageError 'Error: -Uninstall and -AllDisabled cannot be used together.'
}
if ($hasVersion -and [string]::IsNullOrWhiteSpace($Version)) {
  Exit-WithUsageError 'Error: -Version cannot be empty.'
}

$SelectedPacks = Resolve-SelectedPacks `
  -RequestedPacks $Packs `
  -HasPacksParam $hasPacks `
  -InstallAll ([bool]$All) `
  -InstallAllDisabled ([bool]$AllDisabled) `
  -DoUninstall ([bool]$Uninstall)

$DestRoot = Resolve-DestinationRoot `
  -CustomDestination $Destination `
  -HasCustomDestination $hasDestination `
  -UseWorkspace:$Workspace

if ($List) {
  Show-PackTable -DestRoot $DestRoot
  return
}

if ($Uninstall) {
  Invoke-PackUninstall -SelectedPacks $SelectedPacks -DestRoot $DestRoot
  return
}

if ($hasFromZip -and [string]::IsNullOrWhiteSpace($FromZip)) {
  Exit-WithUsageError 'Error: -FromZip cannot be empty.'
}

$ResolvedFromZip = $null
if (-not [string]::IsNullOrWhiteSpace($FromZip)) {
  $ResolvedFromZip = Resolve-FullLocalPath -RawPath $FromZip
  if (-not (Test-Path -LiteralPath $ResolvedFromZip -PathType Leaf)) {
    throw "Archive file not found: $ResolvedFromZip"
  }
}

# Enable TLS 1.2 for HTTPS calls on Windows PowerShell 5.1.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Headers = @{ 'User-Agent' = 'swift-agent-skills-antigravity-installer' }
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('ag-swift-skills-' + [System.Guid]::NewGuid().ToString('N'))

$destParent = Split-Path -Parent $DestRoot
if ([string]::IsNullOrWhiteSpace($destParent)) {
  $destParent = $DestRoot
}
$StagingBase = Join-Path $destParent '.swift-agent-skills-staging'
$RunStagingRoot = Join-Path $StagingBase ([System.Guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
  $extractDir = Join-Path $TempRoot 'extracted'

  if ($ResolvedFromZip) {
    $zipPath = $ResolvedFromZip
    Write-Host "Installing from local archive $zipPath..."
  } else {
    $zipPath = Join-Path $TempRoot $AssetName
    $source = Resolve-ArchiveDownload -RequestedVersion $Version -Headers $Headers
    Write-Host "Downloading $($source.Label) from $($source.Url)..."
    try {
      Invoke-WebRequest -UseBasicParsing -Headers $Headers -Uri $source.Url -OutFile $zipPath
    } catch {
      if ($source.Explicit) {
        throw "Failed to download release '$($source.Tag)' from $($source.Url) ($($_.Exception.Message)). Check available releases at https://github.com/$RepoSlug/releases or clone the repository and run 'agy plugin install'."
      }
      throw
    }
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractDir)

  # Fail closed before touching Destination or staging if any requested pack is missing.
  $resolvedSources = @()
  foreach ($packName in $SelectedPacks) {
    $srcDir = Find-PluginSourceDir -ExtractDir $extractDir -PluginName $packName
    if (-not $srcDir) {
      throw "Archive does not contain pack '$packName'."
    }
    $resolvedSources += [pscustomobject]@{
      Name      = $packName
      SourceDir = $srcDir
    }
  }

  New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $RunStagingRoot -Force | Out-Null

  $installed = @()
  foreach ($item in $resolvedSources) {
    $stageDir = Join-Path $RunStagingRoot $item.Name
    Copy-Item -LiteralPath $item.SourceDir -Destination $stageDir -Recurse -Force

    if ($AllDisabled -and ($item.Name -ne $DefaultPack)) {
      Set-StagedPackDisabled -StagedPackDir $stageDir
    }

    $dstDir = Join-Path $DestRoot $item.Name
    if (Test-Path -LiteralPath $dstDir) {
      Remove-Item -LiteralPath $dstDir -Recurse -Force
    }
    Move-Item -LiteralPath $stageDir -Destination $dstDir -Force

    $installed += $item.Name
    Write-Host "Installed '$($item.Name)' -> $dstDir"
  }

  Write-Host ''
  Write-Host "Installed: $($installed -join ', ')"
  Write-Host "Destination: $DestRoot"
  if ($AllDisabled) {
    Write-Host 'Note: Optional packs were installed disabled; enable them in Customizations when needed.'
  }
  Write-Host 'Open Antigravity -> Customizations -> Installed (no restart needed).'
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $RunStagingRoot) {
    Remove-Item -LiteralPath $RunStagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $StagingBase) {
    $remaining = @(Get-ChildItem -LiteralPath $StagingBase -Force -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) {
      Remove-Item -LiteralPath $StagingBase -Force -ErrorAction SilentlyContinue
    }
  }
}
