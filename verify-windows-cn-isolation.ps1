param(
  [Parameter(Mandatory)][string]$Installer
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '仅允许在临时 GitHub Actions runner 中运行安装测试' }
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$official = Join-Path $env:LOCALAPPDATA 'Programs\t3code'
$chinese = Join-Path $env:LOCALAPPDATA 'Programs\t3code-cn'
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
if ((Test-Path $official) -or (Test-Path $chinese)) { throw 'runner 必须没有现有 T3 安装' }

New-Item -ItemType Directory -Path "$official\resources" -Force | Out-Null
Set-Content -LiteralPath "$official\T3 Code (Beta).exe" -Value 'official exe sentinel'
Set-Content -LiteralPath "$official\Uninstall T3 Code (Beta).exe" -Value 'official uninstaller sentinel'
Set-Content -LiteralPath "$official\resources\app.asar" -Value 'official resources sentinel'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'T3 Code (Beta).lnk'
Set-Content -LiteralPath $shortcut -Value 'official shortcut sentinel'
$protected = @(
  "$official\T3 Code (Beta).exe",
  "$official\Uninstall T3 Code (Beta).exe",
  "$official\resources\app.asar",
  $shortcut
)
$hashes = @{}
foreach ($file in $protected) { $hashes[$file] = (Get-FileHash -LiteralPath $file).Hash }

function Assert-OfficialUnchanged {
  foreach ($file in $protected) {
    if (!(Test-Path -LiteralPath $file)) { throw "官方文件被删除：$file" }
    if ((Get-FileHash -LiteralPath $file).Hash -ne $hashes[$file]) { throw "官方文件被修改：$file" }
  }
  $files = @(Get-ChildItem -LiteralPath $official -Recurse -File)
  if ($files.Count -ne 3) { throw "中文安装写入了官方目录：$($files.Count) 个文件" }
}

function Invoke-Installer([string[]]$Arguments, [bool]$ShouldSucceed) {
  $process = Start-Process -FilePath $Installer -ArgumentList $Arguments -PassThru
  if (!$process.WaitForExit(300000)) { throw '安装器未在三分钟内退出' }
  if ($ShouldSucceed -and $process.ExitCode -ne 0) { throw "安装器失败：$($process.ExitCode)" }
  if (!$ShouldSucceed -and $process.ExitCode -eq 0) { throw '安装器没有拒绝危险的目录或卸载记录' }
  Assert-OfficialUnchanged
}

function Find-CnUninstallKey {
  Get-ChildItem -Path $uninstallRoot |
    Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath).DisplayName -like 'T3 Code CN*' } |
    Select-Object -First 1
}

# 1. /D 指向官方目录时必须拒绝，且不得写入中文目录。
Invoke-Installer @('/S', "/D=$official") $false
if (Test-Path $chinese) { throw '拒绝危险目录后仍写入了中文目录' }
Write-Output 'PASS: refuses /D pointing to official directory'

# 2. 全新安装必须落在独立目录。
Invoke-Installer @('/S') $true
if (!(Test-Path "$chinese\T3 Code CN.exe")) { throw '中文 exe 不在独立目录' }
if (!(Test-Path "$chinese\resources\app.asar")) { throw '中文 resources 不在独立目录' }
$uninstallKey = Find-CnUninstallKey
if ($null -eq $uninstallKey) { throw '没有找到中文卸载注册项' }
$uninstallKeyPath = $uninstallKey.PSPath
$installKeyPath = Join-Path 'HKCU:\Software' $uninstallKey.PSChildName
if ((Get-ItemProperty -LiteralPath $installKeyPath).InstallLocation.TrimEnd('\') -ne $chinese) {
  throw '中文安装注册表位置不正确'
}
if ((Get-ItemProperty -LiteralPath $uninstallKeyPath).UninstallString -notlike "`"$chinese\*") {
  throw '中文卸载器注册表位置不正确'
}
Write-Output "PASS: fresh install at $chinese"

# 3. 卸载记录指向官方目录时必须拒绝。
$goodUninstall = (Get-ItemProperty -LiteralPath $uninstallKeyPath).UninstallString
New-ItemProperty -LiteralPath $uninstallKeyPath -Name UninstallString `
  -Value "`"$official\Uninstall T3 Code (Beta).exe`" /currentuser" -Force | Out-Null
Invoke-Installer @('/S') $false
New-ItemProperty -LiteralPath $uninstallKeyPath -Name UninstallString -Value $goodUninstall -Force | Out-Null
Write-Output 'PASS: refuses uninstall record pointing to official directory'

# 4. 正常升级不得触碰官方文件。
Invoke-Installer @('/S') $true
Write-Output 'PASS: reinstall preserves official files'

# 5. 卸载只删除中文目录。
$uninstaller = Join-Path $chinese 'Uninstall T3 Code CN.exe'
$process = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "/currentuser _?=$chinese") -PassThru
if (!$process.WaitForExit(300000)) { throw '卸载器未在三分钟内退出' }
if ($process.ExitCode -ne 0) { throw "卸载器失败：$($process.ExitCode)" }
if (Test-Path "$chinese\resources\app.asar") { throw '中文卸载没有删除中文 resources' }
Assert-OfficialUnchanged
Write-Output 'PASS: uninstall preserves official exe, uninstaller, resources and shortcut'
