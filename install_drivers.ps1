# SnapBooth RP203 - Windows USB Serial Driver Helper
# Supports CH340 / CH341, CP2102, and FTDI USB-to-TTL adapters

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   RP203 Thermal Printer - Windows Driver Setup         " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Scanning current Windows COM ports..." -ForegroundColor Yellow
$ports = [System.IO.Ports.SerialPort]::GetPortNames()

if ($ports.Count -gt 0) {
    Write-Host "Found existing COM port(s):" -ForegroundColor Green
    foreach ($p in $ports) {
        Write-Host "  -> $p" -ForegroundColor Green
    }
} else {
    Write-Host "No active COM ports detected yet. (Ensure your USB cable is plugged in)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2/3] Checking USB Serial Devices in Windows Device Manager..." -ForegroundColor Yellow
try {
    $devices = Get-CimInstance Win32_PnPEntity | Where-Object { 
        $_.PNPClass -eq 'Ports' -or $_.Name -match 'CH340|CH341|CP210|FTDI|USB Serial|Prolific'
    }
    if ($devices) {
        foreach ($d in $devices) {
            Write-Host "  -> $($d.Name) [$($d.Status)]" -ForegroundColor Green
        }
    } else {
        Write-Host "  No USB-Serial adapters detected yet." -ForegroundColor DarkYellow
    }
} catch {
    # Fallback if WMI query has restrictions
}

Write-Host ""
Write-Host "[3/3] Driver Installation (WCH CH340 / CH341 - Most Common):" -ForegroundColor Yellow
$driverExe = Join-Path $PSScriptRoot "CH341SER.EXE"
$downloadUrl = "https://raw.githubusercontent.com/nodemcu/nodemcu-devkit/master/Drivers/CH341SER.EXE"

if (-not (Test-Path $driverExe)) {
    Write-Host "Downloading official WCH CH341SER.EXE driver installer..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $driverExe -UseBasicParsing
        Write-Host "Download complete: $driverExe" -ForegroundColor Green
    } catch {
        Write-Host "Automatic download failed. You can manually download from:" -ForegroundColor Red
        Write-Host "  WCH Official: https://www.wch-ic.com/downloads/CH341SER_EXE.html" -ForegroundColor White
        Write-Host "  Silicon Labs CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers" -ForegroundColor White
    }
}

if (Test-Path $driverExe) {
    Write-Host ""
    Write-Host "Launching WCH Driver Installer..." -ForegroundColor Cyan
    Write-Host "👉 In the installer window, simply click the 'INSTALL' button." -ForegroundColor White
    Start-Process -FilePath $driverExe
}

Write-Host ""
Write-Host "After driver installation completes:" -ForegroundColor Cyan
Write-Host "1. Unplug and replug your printer's USB cable." -ForegroundColor White
Write-Host "2. Double click 'start.bat' to launch SnapBooth." -ForegroundColor White
Write-Host "3. In Chrome/Edge, click 'Connect Printer' and select your COM port." -ForegroundColor White
Write-Host ""
