$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env.local'
$runtime = Join-Path $projectRoot '.n8n-runtime\node_modules\n8n\bin\n8n'

if (-not (Test-Path -LiteralPath $runtime)) {
  throw 'Local n8n runtime is missing. Install it with: npm install --prefix .n8n-runtime n8n@2.43.7 --no-save --no-audit --no-fund'
}
if (-not (Test-Path -LiteralPath $envFile)) {
  throw '.env.local is missing.'
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
    $settings[$Matches[1]] = $Matches[2].Trim('"', "'")
  }
}
if ([string]::IsNullOrWhiteSpace($settings['N8N_WEBHOOK_SECRET'])) {
  throw 'Set N8N_WEBHOOK_SECRET in .env.local before starting n8n.'
}

$env:N8N_USER_FOLDER = Join-Path $projectRoot '.n8n-local'
$env:N8N_HOST = 'localhost'
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'
$env:N8N_PORT = '5678'
$env:N8N_PROTOCOL = 'http'
$env:N8N_SECURE_COOKIE = 'false'
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
$env:N8N_VERSION_NOTIFICATIONS_ENABLED = 'false'
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = 'false'
$env:N8N_WEBHOOK_SECRET = $settings['N8N_WEBHOOK_SECRET']
$env:CIVICPILOT_APP_URL = 'http://localhost:3000'

if (-not [string]::IsNullOrWhiteSpace($settings['GEMINI_API_KEY'])) {
  $env:GEMINI_API_KEY = $settings['GEMINI_API_KEY']
}
if (-not [string]::IsNullOrWhiteSpace($settings['WHATSAPP_PHONE_NUMBER_ID'])) {
  $env:WHATSAPP_PHONE_NUMBER_ID = $settings['WHATSAPP_PHONE_NUMBER_ID']
}
if (-not [string]::IsNullOrWhiteSpace($settings['REVIEWER_SECRET_KEY'])) {
  $env:REVIEWER_SECRET_KEY = $settings['REVIEWER_SECRET_KEY']
}

Push-Location $projectRoot
try {
  & node $runtime start
}
finally {
  Pop-Location
}
