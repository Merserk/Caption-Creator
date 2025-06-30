@echo off
setlocal

:: ============================================================================
:: THE WORKING DIRECTORY FIX
:: This is the definitive solution for applications that are sensitive to
:: their location, like embedded Python.
:: ============================================================================

:: --- STEP 1: FORCE THE WORKING DIRECTORY ---
:: This is the most important command in the entire script.
:: It changes the current directory to the location of this batch file.
:: For example: "C:\Users\mihai\Downloads\Caption Creator (pywebview)\bin\"
:: This ensures that when Python starts, it can find all of its own files.
pushd "%~dp0"

:: --- STEP 2: DEFINE AND VERIFY PATHS (from the new location) ---
:: Now that we are inside the 'bin' folder, we can use relative paths.
set "PYTHON_EXE=.\python-3.13.5-embed-amd64\python.exe"
set "PYTHON_SCRIPT=.\downloader.py"

if not exist "%PYTHON_EXE%" (
    echo [FATAL ERROR] Python executable was not found inside the 'bin' folder!
    pause
    goto cleanup
)
if not exist "%PYTHON_SCRIPT%" (
    echo [FATAL ERROR] The downloader.py script was not found inside the 'bin' folder!
    pause
    goto cleanup
)

:: --- STEP 3: RUN THE PYTHON SCRIPT ---
echo Starting the downloader...
echo.

:: Now we run the command. Because the working directory is correct,
:: this simple, direct call will work.
"%PYTHON_EXE%" "%PYTHON_SCRIPT%"

:: --- STEP 4: CLEANUP AND EXIT ---
:cleanup
:: This command returns to the original directory before the script started.
popd

echo.
echo -------------------------------------------------
echo Program has finished. Press any key to close.
echo -------------------------------------------------
pause >nul