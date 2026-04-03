# git-push-wrapper.ps1
# Merges stderr into stdout so CI/agent tools can see git push progress.
# Usage: pwsh -File git-push-wrapper.ps1

$ErrorActionPreference = 'Continue'

# Disable Antigravity's askpass to avoid GUI prompts in non-interactive terminals
$env:GIT_ASKPASS = ''
$env:GIT_TERMINAL_PROMPT = '0'

# Run git push and merge stderr into stdout
$output = git push 2>&1 | Out-String
$exitCode = $LASTEXITCODE

Write-Output $output.Trim()

if ($exitCode -ne 0) {
  Write-Output "ERROR: git push failed with exit code $exitCode"
  exit $exitCode
}

Write-Output "OK: git push completed successfully"
exit 0
