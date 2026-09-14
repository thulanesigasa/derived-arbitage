Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "assets\robot_hero.jpg"
$img = [System.Drawing.Image]::FromFile($srcPath)

# Source dimensions: 1376 x 768
$srcW = $img.Width
$srcH = $img.Height

# We want a square crop focusing on the robot's face/body
$cropSize = $srcH # 768
$cropX = [int](($srcW - $cropSize) / 2) # (1376 - 768) / 2 = 304
$cropY = 0

Write-Host "Source: ${srcW}x${srcH}, Crop: ${cropSize}x${cropSize} at ($cropX, $cropY)"

function Create-ResizedImage {
    param(
        [System.Drawing.Image]$source,
        [int]$cropX, [int]$cropY, [int]$cropW, [int]$cropH,
        [int]$destW, [int]$destH,
        [string]$outputPath,
        [string]$bgColor = "#080808",
        [float]$scaleInCanvas = 1.0
    )

    $destBmp = New-Object System.Drawing.Bitmap($destW, $destH)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $color = [System.Drawing.ColorTranslator]::FromHtml($bgColor)
    $g.Clear($color)

    if ($scaleInCanvas -eq 1.0) {
        $destRect = New-Object System.Drawing.Rectangle(0, 0, $destW, $destH)
    } else {
        $targetW = [int]($destW * $scaleInCanvas)
        $targetH = [int]($destH * $scaleInCanvas)
        $targetX = [int](($destW - $targetW) / 2)
        $targetY = [int](($destH - $targetH) / 2)
        $destRect = New-Object System.Drawing.Rectangle($targetX, $targetY, $targetW, $targetH)
    }

    $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
    $g.DrawImage($source, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $g.Dispose()
    $destBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Host "Saved: $outputPath ($destW x $destH)"
}

# 1. Standard App Icon (1024x1024)
Create-ResizedImage -source $img -cropX $cropX -cropY $cropY -cropW $cropSize -cropH $cropSize -destW 1024 -destH 1024 -outputPath (Join-Path $PSScriptRoot "assets\icon.png")

# 2. Android Adaptive Icon (1024x1024 with 70% safe zone on #080808)
Create-ResizedImage -source $img -cropX $cropX -cropY $cropY -cropW $cropSize -cropH $cropSize -destW 1024 -destH 1024 -outputPath (Join-Path $PSScriptRoot "assets\adaptive-icon.png") -scaleInCanvas 0.72

# 3. Splash Screen Image (1242x2436 portrait canvas with centered 500px icon on #080808)
$splashW = 1242
$splashH = 2436
$splashBmp = New-Object System.Drawing.Bitmap($splashW, $splashH)
$sg = [System.Drawing.Graphics]::FromImage($splashBmp)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$sg.Clear([System.Drawing.ColorTranslator]::FromHtml("#080808"))

$iconSize = 640
$iconX = [int](($splashW - $iconSize) / 2)
$iconY = [int](($splashH - $iconSize) / 2 - 100) # slight optical upward bias
$destRect = New-Object System.Drawing.Rectangle($iconX, $iconY, $iconSize, $iconSize)
$srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropSize, $cropSize)
$sg.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$sg.Dispose()
$splashPath = Join-Path $PSScriptRoot "assets\splash.png"
$splashBmp.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
$splashBmp.Dispose()
Write-Host "Saved: $splashPath ($splashW x $splashH)"

# 4. Favicon (192x192)
Create-ResizedImage -source $img -cropX $cropX -cropY $cropY -cropW $cropSize -cropH $cropSize -destW 192 -destH 192 -outputPath (Join-Path $PSScriptRoot "assets\favicon.png")

$img.Dispose()
Write-Host "All assets generated successfully!"
