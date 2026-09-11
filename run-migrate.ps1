Set-Location -Path "$PSScriptRoot\Backend"
Write-Host "Running database migrations..." -ForegroundColor Cyan
npx knex migrate:latest --knexfile src/db/knexfile.ts
Write-Host "Done." -ForegroundColor Green
