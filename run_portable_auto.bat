@echo off
cls

:: Kill any lingering koboldcpp processes from a previous run to ensure a clean start
taskkill /F /IM koboldcpp.exe >nul 2>nul

:: Check for config.ini and create a default if it's missing
if not exist "config.ini" (
    echo [INFO] config.ini not found. Creating a default configuration file.
    (
        echo [prompts]
        echo captions = Create extreme precise caption about what you see on image. Make it up to 300 words. Caption must include only output text.
        echo tags = Act as an expert prompt engineer for AI image generators like Illustrious. Your task is to create a single, comprehensive, one-line prompt designed to generate a highly detailed image of a specific character. Crucially, you must ONLY use the comma-separated keywords from the image. Ignore any text in parentheses, brackets, or any other descriptive notes that are not part of the core keyword list. Do not create any "Note:". Do not use underscore. Do not create any emoji.
        echo.
        echo [generation_params]
        echo temperature = 0.2
        echo top_p = 0.95
        echo top_k = 40
        echo repeat_penalty = 1.1
        echo frequency_penalty = 0.8
        echo presence_penalty = 0
        echo max_tokens = 600
    ) > "config.ini"
    echo.
)


:: This section finds and displays the ASCII art stored at the end of the file.
for /f "delims=: tokens=*" %%A in ('findstr /b ::: "%~f0"') do @echo(%%A

:: =================================
::      USER CONFIGURATION
:: =================================
echo.

:: Define the single Python script name here
set PYTHON_SCRIPT=bin\caption_generator_portable.py

:: --- Question 1: Generation Type ---
:ask_gen_type
echo 1. What do you want to generate?
echo    1) Captions (Descriptive sentences)
echo    2) Tags     (Comma-separated keywords)
echo.
set /p gen_choice="Enter your choice (1-2): "

if "%gen_choice%"=="1" (
    set GEN_TYPE_ARG=captions
    set GEN_TYPE_TEXT=Captions
    echo You selected: Captions
) else if "%gen_choice%"=="2" (
    set GEN_TYPE_ARG=tags
    set GEN_TYPE_TEXT=Tags
    echo You selected: Tags
) else (
    echo Invalid choice. Please enter 1 or 2.
    echo.
    goto ask_gen_type
)
echo.
echo --------------------------------------------------
echo.

:: --- Question 2: Low-VRAM Mode ---
:ask_low_vram
echo 2. Enable Low-VRAM mode? (Reduces ~1GB VRAM, may be slightly slower)
echo    1) Yes
echo    2) No
echo.
set /p vram_mode_choice="Enter your choice (1-2): "

set LOW_VRAM_FLAGS=
if "%vram_mode_choice%"=="1" (
    set LOW_VRAM_FLAGS=--mmprojcpu --flashattention
    echo You selected: Low-VRAM Mode ENABLED
) else if "%vram_mode_choice%"=="2" (
    echo You selected: Low-VRAM Mode DISABLED
) else (
    echo Invalid choice. Please enter 1 or 2.
    echo.
    goto ask_low_vram
)
echo.
echo --------------------------------------------------
echo.

:: --- Question 3: Model/Quantization Selection ---
:ask_model

:: Define model file names
set "MODEL_1_NAME=llama-joycaption-beta-one-hf-llava.Q2_K.gguf"
set "MODEL_2_NAME=Llama-Joycaption-Beta-One-Hf-Llava-Q4_K.gguf"
set "MODEL_3_NAME=Llama-Joycaption-Beta-One-Hf-Llava-Q8_0.gguf"
set "MODEL_4_NAME=Llama-Joycaption-Beta-One-Hf-Llava-F16.gguf"

echo 3. Select your VRAM configuration (this chooses the model quantization):

:: Option 1
<nul set /p ".=   1) 5GB VRAM  - Q2_K quantization "
if exist "models\%MODEL_1_NAME%" (
    powershell -Command "Write-Host '(Available)' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host '(Not downloaded)' -ForegroundColor Red"
)

:: Option 2
<nul set /p ".=   2) 8GB VRAM  - Q4_K quantization "
if exist "models\%MODEL_2_NAME%" (
    powershell -Command "Write-Host '(Available)' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host '(Not downloaded)' -ForegroundColor Red"
)

:: Option 3
<nul set /p ".=   3) 10GB VRAM - Q8_0 quantization "
if exist "models\%MODEL_3_NAME%" (
    powershell -Command "Write-Host '(Available)' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host '(Not downloaded)' -ForegroundColor Red"
)

:: Option 4
<nul set /p ".=   4) 20GB VRAM - F16 full precision "
if exist "models\%MODEL_4_NAME%" (
    powershell -Command "Write-Host '(Available)' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host '(Not downloaded)' -ForegroundColor Red"
)

echo.
set /p model_choice="Enter your choice (1-4): "

if "%model_choice%"=="1" (
    set MODEL_FILE=%MODEL_1_NAME%
    echo Selected: 5GB VRAM configuration ^(Q2_K^)
) else if "%model_choice%"=="2" (
    set MODEL_FILE=%MODEL_2_NAME%
    echo Selected: 8GB VRAM configuration ^(Q4_K^)
) else if "%model_choice%"=="3" (
    set MODEL_FILE=%MODEL_3_NAME%
    echo Selected: 10GB VRAM configuration ^(Q8_0^)
) else if "%model_choice%"=="4" (
    set MODEL_FILE=%MODEL_4_NAME%
    echo Selected: 20GB VRAM configuration ^(F16^)
) else (
    echo Invalid choice. Please select 1, 2, 3 or 4.
    echo.
    goto ask_model
)
echo.
echo --------------------------------------------------
echo.

:: =================================
::      SCRIPT EXECUTION
:: =================================

REM Set the full Python path (relative to the batch file location)
set PYTHON_PATH=bin\python-3.12.10-embed-amd64\python.exe

echo Starting koboldcpp server with the selected configuration...
echo Model: %MODEL_FILE%
echo Mode: %GEN_TYPE_TEXT%
echo.

REM Start koboldcpp server with selected model and flags in the background.
REM The LOW_VRAM_FLAGS variable is either empty or contains the flags.
start "" /B bin\koboldcpp.exe --model models\%MODEL_FILE% --mmproj models\llama-joycaption-beta-one-llava-mmproj-model-f16.gguf --quiet %LOW_VRAM_FLAGS% --port 5001 --host 127.0.0.1

echo Waiting for koboldcpp API to come online... This may take a moment.

REM Wait until koboldcpp API is online by polling the server.
:wait_loop
timeout /T 5 >nul
powershell -Command "try {iwr -UseBasicParsing http://127.0.0.1:5001/ | Out-Null; exit 0} catch {exit 1}"
if errorlevel 1 goto wait_loop

echo API is online! Running the Python script for %GEN_TYPE_TEXT% generation...

REM Run the Python script that was selected earlier, passing the generation type as an argument.
"%PYTHON_PATH%" "%PYTHON_SCRIPT%" %GEN_TYPE_ARG%

echo.
echo All tasks are complete! Support author on patreon.com/MM744
echo Output files are in the 'output' folder.

:: Clean up by shutting down the koboldcpp server before exiting
echo Shutting down koboldcpp server...
taskkill /F /IM koboldcpp.exe >nul 2>nul

pause

REM Exit the script cleanly
exit /b

:: ============================================================================
:: ASCII Art Data - Must be at the end of the file to be found by findstr
:: ============================================================================
:::________/\\\\\\\\\______________________________________________________________________________        
::: _____/\\\////////_______________________________________________________________________________       
:::  ___/\\\/____________________________/\\\\\\\\\______/\\\_______/\\\_____________________________      
:::   __/\\\______________/\\\\\\\\\_____/\\\/////\\\__/\\\\\\\\\\\_\///______/\\\\\_____/\\/\\\\\\___     
:::    _\/\\\_____________\////////\\\___\/\\\\\\\\\\__\////\\\////___/\\\___/\\\///\\\__\/\\\////\\\__    
:::     _\//\\\______________/\\\\\\\\\\__\/\\\//////______\/\\\______\/\\\__/\\\__\//\\\_\/\\\__\//\\\_   
:::      __\///\\\___________/\\\/////\\\__\/\\\____________\/\\\_/\\__\/\\\_\//\\\__/\\\__\/\\\___\/\\\_  
:::       ____\////\\\\\\\\\_\//\\\\\\\\/\\_\/\\\____________\//\\\\\___\/\\\__\///\\\\\/___\/\\\___\/\\\_ 
:::        _______\/////////___\////////\//__\///______________\/////____\///_____\/////_____\///____\///__
:::________/\\\\\\\\\_______________________________________________________________________________________        
::: _____/\\\////////________________________________________________________________________________________       
:::  ___/\\\/___________________________________________________________/\\\__________________________________      
:::   __/\\\______________/\\/\\\\\\\______/\\\\\\\\___/\\\\\\\\\_____/\\\\\\\\\\\_____/\\\\\_____/\\/\\\\\\\__     
:::    _\/\\\_____________\/\\\/////\\\___/\\\/////\\\_\////////\\\___\////\\\////____/\\\///\\\__\/\\\/////\\\_    
:::     _\//\\\____________\/\\\___\///___/\\\\\\\\\\\____/\\\\\\\\\\_____\/\\\_______/\\\__\//\\\_\/\\\___\///__   
:::      __\///\\\__________\/\\\_________\//\\///////____/\\\/////\\\_____\/\\\_/\\__\//\\\__/\\\__\/\\\_________  
:::       ____\////\\\\\\\\\_\/\\\__________\//\\\\\\\\\\_\//\\\\\\\\/\\____\//\\\\\____\///\\\\\/___\/\\\_________ 
:::        _______\/////////__\///____________\//////////___\////////\//______\/////_______\/////_____\///__________