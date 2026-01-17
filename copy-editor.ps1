# PowerShell script to copy Blazor editor artifacts to VSCode extension
# Excludes .br, .gz, .map, .pdb, and .symbols.json files for smaller bundle

$source = "C:\src\dm\confluence-macro\static\editor\build"
$destination = "C:\src\vscode-drawmotive\media\editor"

Write-Host "Copying Blazor editor artifacts from:"
Write-Host "  Source: $source"
Write-Host "  Destination: $destination"
Write-Host ""

# Clean destination directory if it exists
if (Test-Path -Path $destination) {
    Write-Host "Cleaning destination directory..."
    Remove-Item -Path $destination -Recurse -Force
}

# Create destination directory
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Write-Host "Created destination directory"
Write-Host ""

# Define excluded extensions and patterns
$excludedExtensions = @('.br', '.gz', '.map', '.pdb')
$excludedPatterns = @('*.symbols.json', 'service-worker.js')

# Copy all files except excluded ones
$copiedFiles = 0
$skippedFiles = 0

Get-ChildItem -Path $source -Recurse | Where-Object {
    -not $_.PSIsContainer
} | ForEach-Object {
    $shouldExclude = $false

    # Check if extension is in excluded list
    foreach ($ext in $excludedExtensions) {
        if ($_.Name.EndsWith($ext)) {
            $shouldExclude = $true
            break
        }
    }

    # Check if name matches excluded patterns
    foreach ($pattern in $excludedPatterns) {
        if ($_.Name -like $pattern) {
            $shouldExclude = $true
            break
        }
    }

    if (-not $shouldExclude) {
        $targetPath = $_.FullName.Replace($source, $destination)
        $targetDir = Split-Path -Path $targetPath -Parent

        # Create directory if it doesn't exist
        if (!(Test-Path -Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        # Copy file
        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        $copiedFiles++
    } else {
        $skippedFiles++
        Write-Host "  Skipped: $($_.Name)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Copy completed successfully" -ForegroundColor Green
Write-Host "  Copied: $copiedFiles files"
Write-Host "  Skipped: $skippedFiles files"
Write-Host ""

# Display size information
$totalSize = (Get-ChildItem -Path $destination -Recurse -File | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($totalSize / 1MB, 2)
Write-Host "Total size: $sizeMB MB"

$fileCount = (Get-ChildItem -Path $destination -Recurse -File).Count
Write-Host "Total files: $fileCount"

# Show breakdown by file type
Write-Host ""
Write-Host "File type breakdown:"
Get-ChildItem -Path $destination -Recurse -File | Group-Object Extension | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object {
    $ext = if ($_.Name) { $_.Name } else { "(no extension)" }
    $size = ($_.Group | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  $ext : $($_.Count) files ($([math]::Round($size, 2)) MB)"
}
