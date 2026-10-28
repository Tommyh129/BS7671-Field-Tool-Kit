$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$previewUrl = 'http://localhost:3000'
$healthUrl = "$previewUrl/api/health"
$logDirectory = Join-Path $env:TEMP 'fieldtoolkit-live-preview'

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    $previewRunning = $health.status -eq 'ok'
} catch {
    $previewRunning = $false
}

if (-not $previewRunning) {
    $nodeExecutable = (Get-Command node.exe).Source
    $vitePackage = Join-Path $projectDirectory 'node_modules/vite/package.json'
    if (-not (Test-Path -LiteralPath $vitePackage)) {
        throw 'Development dependencies are missing. Run npm ci in the project folder first.'
    }

    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $env:NODE_ENV = 'development'
    $env:DISABLE_HMR = 'false'
    $previewProcess = Start-Process -FilePath $nodeExecutable `
        -ArgumentList @('--import', 'tsx', '--watch-path=server.ts', '--watch-path=server', '--watch-path=src/business/invoices/model.ts', '--watch-path=src/business/invoices/engine.ts', '--watch-path=src/business/invoices/pdf.ts', '--watch-path=src/business/documents.ts', '--watch-path=src/business/model.ts', '--watch-path=vite.config.ts', '--watch-path=firebase-applet-config.json', 'server.ts') `
        -WorkingDirectory $projectDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'server.log') `
        -RedirectStandardError (Join-Path $logDirectory 'server-error.log') -PassThru
    $previewProcess.Id | Set-Content -LiteralPath (Join-Path $logDirectory 'server.pid')

    Write-Output 'Starting live preview. The first startup can take a few minutes.'
    $deadline = (Get-Date).AddSeconds(300)
    do {
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            $previewRunning = $health.status -eq 'ok'
        } catch {
            $previewRunning = $false
        }
    } until ($previewRunning -or (Get-Date) -gt $deadline)

    if (-not $previewRunning) {
        throw "Preview did not start. Check logs in $logDirectory."
    }
}

Write-Output "Live preview ready: $previewUrl"
Write-Output "Server logs: $logDirectory"
