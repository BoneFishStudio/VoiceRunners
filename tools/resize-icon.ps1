# Resize logo to 1024x1024 app icon (electron-builder requires >=512 for mac/linux)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('C:/VoiceRunners/Logo/Voice.png')
$bmp = New-Object System.Drawing.Bitmap(1024, 1024)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($img, 0, 0, 1024, 1024)
$bmp.Save('C:/VoiceRunners/assets/icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Output 'RESIZE_OK'
