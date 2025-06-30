@echo off
setlocal enabledelayedexpansion

:: This is a simple launcher. Its only job is to run the Python script.

:: Use %~dp0 to build paths relative to THIS SCRIPT's location.
:: The set "VAR=VALUE" syntax is crucial for paths with spaces.
set "PYTHON_EXE=%~dp0python-3.13.5-embed-amd64\python.exe"
set "PYTHON_SCRIPT=%~dp0update_environment.py"

:: Check if files exist before running
:: We use !VAR! (Delayed Expansion) to handle special characters like () in the path.
if not exist "!PYTHON_EXE!" (
    echo [ERROR] Python executable not found: !PYTHON_EXE!
    goto :end
)
if not exist "!PYTHON_SCRIPT!" (
    echo [ERROR] Python script not found: !PYTHON_SCRIPT!
    goto :end
)

:: Execute the Python script using the embedded Python
echo [INFO] Starting the Python updater script...
echo ============================================================

"!PYTHON_EXE!" "!PYTHON_SCRIPT!"

echo ============================================================
echo [INFO] Script finished.

:end
pause