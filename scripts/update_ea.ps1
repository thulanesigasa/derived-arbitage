# ==============================================================================
# update_ea.ps1 - Automated MetaTrader 5 FalconEA Synchronizer & Compiler (Windows)
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\update_ea.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DefaultMT5 = "C:\Program Files\MetaTrader 5"

Write-Host "=== [1/4] Pulling latest repository updates ===" -ForegroundColor Cyan
Set-Location $RepoRoot
git pull

Write-Host "=== [2/4] Locating MetaTrader 5 terminal ===" -ForegroundColor Cyan
$MT5Dir = if ($env:MT5_DIR -and (Test-Path $env:MT5_DIR)) {
    $env:MT5_DIR
} elseif (Test-Path $DefaultMT5) {
    $DefaultMT5
} else {
    Write-Warning "Default MetaTrader 5 directory not found at $DefaultMT5."
    $null
}

if ($MT5Dir) {
    $MetaEditorExe = Join-Path $MT5Dir "metaeditor64.exe"
    
    # Auto-detect writable MQL5 directory (AppData Terminal roaming or Program Files)
    $AppDataMQL5 = Get-ChildItem -Path "$env:APPDATA\MetaQuotes\Terminal\*\MQL5" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    $TargetMQL5 = if ($AppDataMQL5 -and (Test-Path $AppDataMQL5.FullName)) {
        $AppDataMQL5.FullName
    } else {
        Join-Path $MT5Dir "MQL5"
    }

    $ExpertsDir = Join-Path $TargetMQL5 "Experts"
    $IncludeDir = Join-Path $TargetMQL5 "Include"

    Write-Host "Target MQL5 path: $TargetMQL5" -ForegroundColor Gray
    Write-Host "=== [3/4] Copying MQL5 source files ===" -ForegroundColor Cyan
    if (-not (Test-Path $ExpertsDir)) { New-Item -ItemType Directory -Path $ExpertsDir -Force | Out-Null }
    if (-not (Test-Path $IncludeDir)) { New-Item -ItemType Directory -Path $IncludeDir -Force | Out-Null }

    Copy-Item (Join-Path $RepoRoot "mql5\Experts\FalconEA.mq5") $ExpertsDir -Force
    Copy-Item (Join-Path $RepoRoot "mql5\Include\*.mqh") $IncludeDir -Force

    Write-Host "=== [4/4] Compiling FalconEA with MetaEditor ===" -ForegroundColor Cyan
    $Mq5File = Join-Path $ExpertsDir "FalconEA.mq5"
    $LogFile = Join-Path $ExpertsDir "FalconEA.log"

    Start-Process -FilePath $MetaEditorExe -ArgumentList "/compile:`"$Mq5File`" /log:`"$LogFile`"" -Wait

    Start-Sleep -Seconds 1
    if (Test-Path $LogFile) {
        Write-Host "--- Compilation Log ---" -ForegroundColor Yellow
        Get-Content $LogFile
        Write-Host "------------------------" -ForegroundColor Yellow
    }

    $Ex5File = Join-Path $ExpertsDir "FalconEA.ex5"
    if (Test-Path $Ex5File) {
        Write-Host "SUCCESS: FalconEA.ex5 compiled successfully at $Ex5File" -ForegroundColor Green
    } else {
        Write-Error "FalconEA.ex5 was not generated. Please review the compilation log above."
    }
} else {
    Write-Host "Local compilation skipped: MetaTrader 5 is running on Ubuntu VPS." -ForegroundColor Yellow
    Write-Host "To compile on the VPS, run: bash scripts/update_ea.sh" -ForegroundColor Yellow
}
