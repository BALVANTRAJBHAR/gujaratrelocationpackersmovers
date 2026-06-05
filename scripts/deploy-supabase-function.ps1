# Deploy the process-home-service-upload Edge Function using the Supabase CLI
# Usage:
#   Set the SUPABASE_PROJECT_REF environment variable or pass the project ref as the first argument.
#   Example (PowerShell):
#     $env:SUPABASE_PROJECT_REF = "your-project-ref"; npx supabase functions deploy process-home-service-upload

param(
  [string]$projectRef
)

if (-not $projectRef) {
  $projectRef = $env:SUPABASE_PROJECT_REF
}

if ($projectRef) {
  Write-Host "Deploying process-home-service-upload to project ref: $projectRef"
  npx supabase functions deploy process-home-service-upload --project-ref $projectRef
} else {
  Write-Host "Deploying process-home-service-upload to default Supabase project (no --project-ref supplied)"
  npx supabase functions deploy process-home-service-upload
}
