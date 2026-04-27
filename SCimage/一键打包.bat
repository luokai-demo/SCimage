@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0scripts\build_desktop.py" --target windows
) else (
  python "%~dp0scripts\build_desktop.py" --target windows
)

if errorlevel 1 (
  echo.
  echo 打包失败。
  pause
  exit /b %errorlevel%
)

echo.
echo 打包完成。
pause
