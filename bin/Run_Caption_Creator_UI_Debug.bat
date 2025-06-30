@echo off
setlocal

:: =================================================================
::               Caption Creator UI Launcher (DEBUG MODE)
:: =================================================================
:: This script will execute each step verbosely, showing line numbers,
:: variable values, and checking for errors after critical commands.
:: =================================================================

cls
title Caption Creator UI Launcher - DEBUG MODE

echo [LINE %LINENO%] --- SCRIPT START ---
echo [LINE %LINENO%] Batch script file location: "%~f0"
echo [LINE %LINENO%] Initial working directory: "%CD%"
echo.

:: --- STEP 1: CHANGE WORKING DIRECTORY TO THE PROJECT ROOT ---
echo [LINE %LINENO%] Announcing: Changing working directory to the parent folder of this script.
echo [LINE %LINENO%] Target Directory: "%~dp0.."
pushd "%~dp0.."

:: Check if the 'pushd' command was successful. A non-zero errorlevel indicates failure.
if %errorlevel% neq 0 (
    echo [LINE %LINENO%] [FATAL ERROR] Failed to change directory. This is a critical error.
    echo [LINE %LINENO%] The script cannot continue. Check permissions or if the path is valid.
    pause
    exit /b %errorlevel%
)
echo [LINE %LINENO%] SUCCESS: Directory changed.
echo [LINE %LINENO%] New working directory is now: "%CD%"
echo.

:: --- STEP 2: DEFINE AND VERIFY PATHS ---
echo [LINE %LINENO%] --- Setting up file path variables ---
set "PROJECT_DIR=%CD%"
echo [LINE %LINENO%] Variable "PROJECT_DIR" set to: "%PROJECT_DIR%"

set "PYTHON_EXE=%PROJECT_DIR%\bin\python-3.13.5-embed-amd64\python.exe"
echo [LINE %LINENO%] Variable "PYTHON_EXE" set to: "%PYTHON_EXE%"

set "APP_SCRIPT=%PROJECT_DIR%\bin\app.py"
echo [LINE %LINENO%] Variable "APP_SCRIPT" set to: "%APP_SCRIPT%"
echo.

:: --- STEP 3: SANITY CHECKS FOR FILES ---
echo [LINE %LINENO%] --- Verifying that required files exist ---

echo [LINE %LINENO%] Checking for Python executable...
if not exist "%PYTHON_EXE%" (
    echo [LINE %LINENO%] [FATAL ERROR] Python executable not found!
    echo [LINE %LINENO%] Expected at: "%PYTHON_EXE%"
    echo [LINE %LINENO%] Please ensure the 'bin' folder and its contents are in the correct location.
    pause
    exit /b 1
)
echo [LINE %LINENO%] SUCCESS: Python executable found.

echo [LINE %LINENO%] Checking for the main application script...
if not exist "%APP_SCRIPT%" (
    echo [LINE %LINENO%] [FATAL ERROR] Main application script 'app.py' not found!
    echo [LINE %LINENO%] Expected at: "%APP_SCRIPT%"
    echo [LINE %LINENO%] Please make sure 'app.py' is in the 'bin' folder.
    pause
    exit /b 1
)
echo [LINE %LINENO%] SUCCESS: Application script found.
echo.

:: --- STEP 4: SCRIPT EXECUTION ---
echo [LINE %LINENO%] --- Preparing to launch the Python application ---
echo [LINE %LINENO%] The following command will be executed:
echo "%PYTHON_EXE%" "%APP_SCRIPT%"
echo.
echo ===============================================================
echo   Starting the Caption Creator Application...
echo   (Python output will appear below)
echo ===============================================================
echo.

"%PYTHON_EXE%" "%APP_SCRIPT%"

:: Capture the exit code from the Python script. 0 usually means success.
set "PYTHON_EXIT_CODE=%errorlevel%"

echo.
echo ===============================================================
echo   Python Script Execution Finished
echo ===============================================================
echo [LINE %LINENO%] The Python script exited with code: %PYTHON_EXIT_CODE%
if %PYTHON_EXIT_CODE% neq 0 (
    echo [LINE %LINENO%] [WARNING] The application may have encountered an error. Check the output above.
) else (
    echo [LINE %LINENO%] [INFO] Application appears to have closed successfully.
)
echo.


:: --- STEP 5: CLEANUP ---
echo [LINE %LINENO%] Announcing: Restoring original working directory.
popd
echo [LINE %LINENO%] Directory restored to: "%CD%"
echo.

echo [LINE %LINENO%] --- SCRIPT END ---
echo [LINE %LINENO%] Debug script has completed. Press any key to close this window.
pause >nul

endlocal