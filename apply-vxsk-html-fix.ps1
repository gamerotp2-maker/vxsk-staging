# VXSK V12.9 — Safe HTML script placement fix
# Run only inside YOUR local vxsk-staging repository folder.
# Changes exactly two HTML files; keeps a backup under Windows TEMP.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$index = Join-Path $root 'index.html'
$staff = Join-Path $root 'staff.html'
try {
  if (!(Test-Path -LiteralPath $index -PathType Leaf) -or !(Test-Path -LiteralPath $staff -PathType Leaf)) {
    throw 'Place BOTH .cmd and .ps1 files in the vxsk-staging folder, next to index.html and staff.html.'
  }
  $enc = New-Object System.Text.UTF8Encoding($false)
  $indexText = [System.IO.File]::ReadAllText($index, [System.Text.Encoding]::UTF8)
  $staffText = [System.IO.File]::ReadAllText($staff, [System.Text.Encoding]::UTF8)
  if (!$indexText.Contains('auth-client.js') -or !$staffText.Contains('staff-view-team')) {
    throw 'These do not look like the expected VXSK index.html / staff.html; no files changed.'
  }
  if (!$indexText.Contains('</body>') -or !$staffText.Contains('</body>')) {
    throw 'A closing body tag was not found; no files changed.'
  }
  # Remove only existing VXSK AI script tags, regardless of their placement or version.
  $aiPattern = '(?i)<script\b[^>]*\bsrc\s*=\s*[\x22\x27]vxsk-ai-(?:owner|pilot)\.js(?:\?[^\x22\x27]*)?[\x22\x27][^>]*>\s*</script>[ \t]*(?:\r?\n)?'
  $cleanIndex = [regex]::Replace($indexText, $aiPattern, '')
  $cleanStaff = [regex]::Replace($staffText, $aiPattern, '')
  $indexNewline = if ($indexText.Contains("`r`n")) { "`r`n" } else { "`n" }
  $staffNewline = if ($staffText.Contains("`r`n")) { "`r`n" } else { "`n" }
  $indexTag = '  <script src="vxsk-ai-pilot.js?v=12.9.1" defer></script>' + $indexNewline
  $staffTag = '  <script src="vxsk-ai-owner.js?v=12.9.1" defer></script>' + $staffNewline
  $correctIndex = [regex]::Replace($cleanIndex, '(?i)</body>', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $indexTag + $m.Value }, 1)
  $correctStaff = [regex]::Replace($cleanStaff, '(?i)</body>', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $staffTag + $m.Value }, 1)
  if ($correctIndex -notmatch 'vxsk-ai-pilot\.js\?v=12\.9\.1' -or $correctStaff -notmatch 'vxsk-ai-owner\.js\?v=12\.9\.1') {
    throw 'Validation failed. No files changed.'
  }
  if ($correctIndex -match 'vxsk-ai-owner\.js' -or $correctStaff -match 'vxsk-ai-pilot\.js') {
    throw 'An unexpected script reference remains. No files changed.'
  }
  $backup = Join-Path ([System.IO.Path]::GetTempPath()) ('vxsk-html-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
  [System.IO.Directory]::CreateDirectory($backup) | Out-Null
  Copy-Item -LiteralPath $index -Destination (Join-Path $backup 'index.html')
  Copy-Item -LiteralPath $staff -Destination (Join-Path $backup 'staff.html')
  try {
    [System.IO.File]::WriteAllText($index, $correctIndex, $enc)
    [System.IO.File]::WriteAllText($staff, $correctStaff, $enc)
  } catch {
    Copy-Item -LiteralPath (Join-Path $backup 'index.html') -Destination $index -Force
    Copy-Item -LiteralPath (Join-Path $backup 'staff.html') -Destination $staff -Force
    throw
  }
  Write-Host 'SUCCESS: Corrected index.html and staff.html without replacing the rest of their content.' -ForegroundColor Green
  Write-Host ('Backups saved at: ' + $backup)
  Write-Host 'Next: Check GitHub Desktop Changes, Commit, then Push origin. DO NOT merge yet.'
} catch {
  Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
