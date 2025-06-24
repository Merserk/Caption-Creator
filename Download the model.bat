@echo off
setlocal

:: Set output directory
set "OUTPUT_DIR=models"

:: Create models folder if it doesn't exist
if not exist "%OUTPUT_DIR%" (
    mkdir "%OUTPUT_DIR%"
)

:: Display menu
echo ===============================================
echo   Llama JoyCaption Beta One Model Downloader
echo ===============================================
echo.
echo Select model variant based on your VRAM:
echo.
echo 1) 5GB VRAM  - Q2_K quantization (~3GB model)
echo 2) 8GB VRAM  - Q4_K quantization (~4GB model)
echo 3) 10GB VRAM - Q8_0 quantization (~8GB model)
echo 4) 20GB VRAM - F16 full precision (~16GB model)
echo.
set /p choice="Enter your choice (1-4): "

:: Validate input
if "%choice%"=="1" goto download_5gb
if "%choice%"=="2" goto download_8gb
if "%choice%"=="3" goto download_10gb
if "%choice%"=="4" goto download_20gb
echo Invalid choice. Please run the script again and select 1, 2, 3 or 4.
pause
exit /b 1

:download_5gb
echo.
echo Selected: 5GB VRAM - Q2_K quantization
set "MODEL_URL1=https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.Q2_K.gguf"
set "OUTPUT_FILE1=llama-joycaption-beta-one-hf-llava.Q2_K.gguf"
goto download_models

:download_8gb
echo.
echo Selected: 8GB VRAM - Q4_K quantization
set "MODEL_URL1=https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-Q4_K.gguf"
set "OUTPUT_FILE1=Llama-Joycaption-Beta-One-Hf-Llava-Q4_K.gguf"
goto download_models

:download_10gb
echo.
echo Selected: 10GB VRAM - Q8_0 quantization
set "MODEL_URL1=https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-Q8_0.gguf"
set "OUTPUT_FILE1=Llama-Joycaption-Beta-One-Hf-Llava-Q8_0.gguf"
goto download_models

:download_20gb
echo.
echo Selected: 20GB VRAM - F16 full precision
set "MODEL_URL1=https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-F16.gguf"
set "OUTPUT_FILE1=Llama-Joycaption-Beta-One-Hf-Llava-F16.gguf"
goto download_models

:download_models
:: Download main model
echo.
echo Downloading main model to %OUTPUT_DIR%\%OUTPUT_FILE1% ...
curl -L "%MODEL_URL1%" -o "%OUTPUT_DIR%\%OUTPUT_FILE1%"

if %ERRORLEVEL% NEQ 0 (
    echo Download of main model failed. Check your internet connection or model URL.
    pause
    exit /b 1
)

echo Main model download complete.

:: Download vision model (same for all variants)
set "MODEL_URL2=https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/llama-joycaption-beta-one-llava-mmproj-model-f16.gguf"
set "OUTPUT_FILE2=llama-joycaption-beta-one-llava-mmproj-model-f16.gguf"

echo.
echo Downloading vision model to %OUTPUT_DIR%\%OUTPUT_FILE2% ...
curl -L "%MODEL_URL2%" -o "%OUTPUT_DIR%\%OUTPUT_FILE2%"

if %ERRORLEVEL% NEQ 0 (
    echo Download of vision model failed. Check your internet connection or model URL.
    pause
    exit /b 1
)

echo Vision model download complete. Support author on patreon.com/MM744
echo.
echo ===============================================
echo Both models downloaded successfully!
echo ===============================================
echo Main model: %OUTPUT_FILE1%
echo Vision model: %OUTPUT_FILE2%
echo Location: %OUTPUT_DIR%\ folder
echo.
pause