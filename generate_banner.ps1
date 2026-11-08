Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("src-tauri/icons/icon.png")
$bmp = New-Object System.Drawing.Bitmap(320, 180)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Black)
$g.DrawImage($img, 70, 0, 180, 180)
$dir = "src-tauri/gen/android/app/src/main/res/drawable"
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir }
$bmp.Save("$dir/banner.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "Banner generated successfully!"
