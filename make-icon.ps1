Add-Type -AssemblyName System.Drawing

$canvasSize = 512
$percent = 80   # <-- Is value ko change karna hai

$logo = [System.Drawing.Image]::FromFile("assets/images/apico.png")
$bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.Clear([System.Drawing.Color]::Transparent)

$logoSize = [math]::Floor($canvasSize * $percent / 100)
$x = ($canvasSize - $logoSize) / 2
$y = ($canvasSize - $logoSize) / 2

$g.DrawImage($logo, $x, $y, $logoSize, $logoSize)

$bmp.Save("assets/images/android-icon-foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$logo.Dispose()

Write-Host "Done!"