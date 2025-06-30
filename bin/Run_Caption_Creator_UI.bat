@echo off
cls
title Caption Creator UI Launcher

:: --- CHANGE WORKING DIRECTORY TO THE PROJECT ROOT ---
:: This is the most important step. 'pushd' changes the current directory
:: to the parent directory of this script's location (i.e., the main project folder).
pushd "%~dp0.."

echo ===============================================================
echo   Starting the Caption Creator Application
echo ===============================================================
echo.
echo This console window shows startup progress and will disappear
echo automatically once the application has fully loaded.
echo Please wait for the main application window to appear...
echo.

:: Get the main project directory (which is now our current directory)
set "PROJECT_DIR=%cd%"

:: Define the full paths using the new PROJECT_DIR. This is very clear.
set "PYTHON_EXE=%PROJECT_DIR%\bin\python-3.13.5-embed-amd64\python.exe"
set "APP_SCRIPT=%PROJECT_DIR%\bin\app.py"

:: Check if the Python executable exists
if not exist "%PYTHON_EXE%" (
    echo [ERROR] Python executable not found!
    echo Expected at: "%PYTHON_EXE%"
    echo Please ensure the 'bin' folder and its contents are in the correct location.
    pause
    exit /b
)

:: Check if the app script exists
if not exist "%APP_SCRIPT%" (
    echo [ERROR] Main application script 'app.py' not found!
    echo Expected at: "%APP_SCRIPT%"
    echo Please make sure 'app.py' is in the 'bin' folder.
    pause
    exit /b
)

:: --- SCRIPT EXECUTION ---
:: We run the python.exe script directly. Because we changed the working directory,
:: the python script will now correctly find the 'input', 'output', and 'models' folders.
"%PYTHON_EXE%" "%APP_SCRIPT%"

:: 'popd' returns to the original directory. Good practice, though not essential
:: as the script is about to close anyway.
popd