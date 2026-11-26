@echo off
echo ========================================
echo Building AI Learning Repository Extension
echo ========================================
echo.

cd /d "%~dp0"

echo Step 1: Compiling with esbuild...
call npm run esbuild-base -- --minify
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Getting current version...
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set VERSION=%%i
echo Current version: %VERSION%

echo.
echo Step 3: Creating VSIX package...
call npx @vscode/vsce package
if errorlevel 1 (
    echo ERROR: VSIX packaging failed!
    pause
    exit /b 1
)

echo.
echo Step 4: Installing extension...
set VSIX_FILE=ai-learning-repo-%VERSION%.vsix
if exist "%VSIX_FILE%" (
    echo Installing %VSIX_FILE%...
    call code --install-extension "%VSIX_FILE%" --force
    if errorlevel 1 (
        echo ERROR: Installation failed!
        pause
        exit /b 1
    )
    echo.
    echo ========================================
    echo SUCCESS! Extension installed.
    echo Version: %VERSION%
    echo ========================================
    echo.
    echo Please reload VS Code to use the new version.
) else (
    echo ERROR: VSIX file not found: %VSIX_FILE%
    pause
    exit /b 1
)

pause
