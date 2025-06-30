# main_folder/bin/update_environment.py (Manual Administrator Run Version)

import os
import sys
import subprocess
import urllib.request
import urllib.error
import tempfile
import zipfile
import shutil
import ssl
from pathlib import Path

# =================================================================
# SCRIPT CONFIGURATION
# =================================================================

# --- Python Environment ---
PYTHON_VERSION = "3.13.5"
PYTHON_DIR_NAME = f"python-{PYTHON_VERSION}-embed-amd64"
PYTHON_DOWNLOAD_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/{PYTHON_DIR_NAME}.zip"

# --- Path Setup ---
SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON_DIR = SCRIPT_DIR / PYTHON_DIR_NAME
PYTHON_EXE = PYTHON_DIR / "python.exe"
MAJOR_MINOR_VERSION = "".join(PYTHON_VERSION.split('.')[:2])
PTH_FILE = PYTHON_DIR / f"python{MAJOR_MINOR_VERSION}._pth"
GET_PIP_PY_PATH = SCRIPT_DIR / "get-pip.py"
KOBOLDCPP_EXE_PATH = SCRIPT_DIR / "koboldcpp.exe"

# --- URL and Package Configuration ---
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
KOBOLDCPP_URL = "https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp.exe"
PACKAGES_TO_INSTALL = [
    "setuptools",
    "wheel",
    "requests",
    "gradio",
    "pillow",
    "pywebview"
]

# --- Windows-Specific Dependencies ---
WINDOWS_DEPENDENCIES = [
    {
        "name": "WebView2 Runtime",
        "url": "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
        "filename": "MicrosoftEdgeWebview2Setup.exe",
        "args": ["/silent", "/install"]
    },
    {
        "name": "Microsoft Visual C++ Redistributable (x64)",
        "url": "https://aka.ms/vs/17/release/vc_redist.x64.exe",
        "filename": "vc_redist.x64.exe",
        "args": ["/install", "/quiet", "/norestart"]
    },
    {
        "name": "Microsoft Visual C++ Redistributable (x86)",
        "url": "https://aka.ms/vs/17/release/vc_redist.x86.exe",
        "filename": "vc_redist.x86.exe",
        "args": ["/install", "/quiet", "/norestart"]
    }
]

# --- Step Count ---
TOTAL_STEPS = 4 + (1 if os.name == 'nt' else 0)

# =================================================================
# VISUALS AND LOGGING
# =================================================================

class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'

def print_header():
    print(f"{Colors.BLUE}{'='*70}")
    print(f"{Colors.BOLD}{Colors.CYAN}       🚀  Universal Environment Setup & Updater 🚀{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*70}{Colors.RESET}\n")

def print_footer():
    print(f"\n{Colors.GREEN}{'='*70}")
    print(f"{Colors.BOLD}{Colors.GREEN}      ✅  All tasks completed successfully! The environment is ready.{Colors.RESET}")
    print(f"{Colors.GREEN}{'='*70}{Colors.RESET}\n")

def print_step_header(step, total, title, subtitle):
    print(f"\n{Colors.YELLOW}{Colors.BOLD}[STEP {step}/{total}] {title}{Colors.RESET}")
    print(f"{Colors.CYAN}└── {subtitle}{Colors.RESET}")

def print_info(message):
    print(f"  {Colors.CYAN}ℹ️  {message}{Colors.RESET}")

def print_success(message):
    print(f"  {Colors.GREEN}✔️  {message}{Colors.RESET}")

def print_warning(message):
    print(f"  {Colors.YELLOW}⚠️  {message}{Colors.RESET}")

def print_error(message, details=""):
    print(f"\n{Colors.RED}{Colors.BOLD}❌ ERROR: {message}{Colors.RESET}")
    if details: print(f"{Colors.RED}{details}{Colors.RESET}")

# =================================================================
# HELPER FUNCTIONS
# =================================================================

def run_command(command, description):
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8')
    except FileNotFoundError:
        print_error(f"Command not found: {command[0]}. Is it in your PATH?"); sys.exit(1)
    except subprocess.CalledProcessError as e:
        error_details = f"--- STDOUT ---\n{e.stdout}\n--- STDERR ---\n{e.stderr}"
        print_error(f"Failed to {description}.", error_details); sys.exit(1)

def _draw_progress_bar(downloaded_bytes, total_bytes):
    bar_length = 40
    downloaded_mb, total_mb = downloaded_bytes / 1e6, total_bytes / 1e6
    percent = downloaded_bytes / total_bytes
    filled_length = int(bar_length * percent)
    bar = Colors.GREEN + '█' * filled_length + Colors.RESET + '-' * (bar_length - filled_length)
    progress_text = f"  {Colors.GREEN}↳{Colors.RESET} {bar} {percent:.1%} ({downloaded_mb:.1f}/{total_mb:.1f} MB)"
    sys.stdout.write(f"\r{progress_text}"); sys.stdout.flush()

def download_file(url, destination, step_name):
    print_info(f"Downloading {step_name}...")
    destination = Path(destination)
    context = None
    if os.name == 'nt':
        try: context = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
        except Exception as e: print_warning(f"Could not create system-trusted SSL context: {e}")
    try:
        with urllib.request.urlopen(url, context=context) as response, open(destination, 'wb') as out_file:
            total_size_str = response.info().get('Content-Length')
            if total_size_str:
                total_size = int(total_size_str)
                downloaded_size = 0
                chunk_size = 8192
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk: break
                    out_file.write(chunk)
                    downloaded_size += len(chunk)
                    _draw_progress_bar(downloaded_size, total_size)
                sys.stdout.write('\n')
            else:
                print_info("  ↳ Size unknown. Downloading..."); shutil.copyfileobj(response, out_file)
        print_success(f"{step_name} downloaded successfully."); return True
    except (urllib.error.URLError, ssl.SSLError) as e:
        details = str(e.reason) if hasattr(e, 'reason') else str(e)
        if "CERTIFICATE_VERIFY_FAILED" in details: details = "SSL Certificate verification failed. Check network/firewall."
        if "koboldcpp" in step_name.lower(): print_warning(f"Could not download {step_name}. (Details: {details})"); return False
        else: print_error(f"Failed to download critical file: {step_name}.", f"Details: {details}"); sys.exit(1)
    except Exception as e:
        print_error(f"An unexpected error during download of {step_name}", str(e)); sys.exit(1)

def unzip_file(zip_path, destination_dir):
    print_info(f"Extracting {zip_path.name}...")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(destination_dir)
        print_success("Extraction complete.")
    except Exception as e:
        print_error(f"Failed to extract {zip_path.name}.", f"Details: {e}"); sys.exit(1)

# =================================================================
# MAIN EXECUTION
# =================================================================

def main():
    if os.name == 'nt':
        os.system('') # Enable ANSI colors

    os.system('cls' if os.name == 'nt' else 'clear')
    print_header()

    # Add a clear warning for Windows users about needing Admin rights.
    if os.name == 'nt':
        print_warning("For system-wide installations (WebView2, VC++), this script requires")
        print_warning("Administrator privileges. If those steps fail, please re-run this script")
        print_warning("by right-clicking it and choosing 'Run as Administrator'.\n")

    step_counter = 1

    # --- STEP 1: Python Environment Verification ---
    print_step_header(step_counter, TOTAL_STEPS, "Python Environment Verification", f"Checking for Python {PYTHON_VERSION}.")
    if not PYTHON_DIR.is_dir() or not PYTHON_EXE.is_file():
        print_warning("Python directory not found. Will download and extract now.")
        zip_filepath = SCRIPT_DIR / f"{PYTHON_DIR_NAME}.zip"
        if download_file(PYTHON_DOWNLOAD_URL, zip_filepath, f"Python {PYTHON_VERSION} Embeddable"):
            unzip_file(zip_filepath, SCRIPT_DIR); os.remove(zip_filepath)
        print_success(f"Python environment set up at: {PYTHON_DIR}")
    else:
        print_success(f"Python environment found at: {PYTHON_DIR}")
    step_counter += 1

    # --- STEP 2: Windows System Prerequisites ---
    if os.name == 'nt':
        print_step_header(step_counter, TOTAL_STEPS, "Windows System Prerequisites", "Installing WebView2 and VC++ Runtimes.")
        with tempfile.TemporaryDirectory() as temp_dir:
            for dep in WINDOWS_DEPENDENCIES:
                print_info(f"Processing: {dep['name']}")
                installer_path = Path(temp_dir) / dep['filename']
                if download_file(dep['url'], installer_path, dep['name']):
                    print_info("Running silent installer...")
                    try:
                        subprocess.run([str(installer_path)] + dep['args'], check=True, capture_output=True)
                        print_success(f"{dep['name']} installation command executed.")
                    except (subprocess.CalledProcessError, FileNotFoundError) as e:
                        print_warning(f"Installer for {dep['name']} failed or was skipped.")
                        print_warning("This may be due to missing Admin rights or because it's already installed.")
        step_counter += 1

    # --- STEP 3: Python Configuration & Pip Installation ---
    print_step_header(step_counter, TOTAL_STEPS, "Python Configuration & Pip Installation", "Enabling package discovery and bootstrapping pip.")
    print_info(f"Configuring Python's path file (`{PTH_FILE.name}`).")
    try:
        content = PTH_FILE.read_text(encoding='utf-8').splitlines()
        if "Lib\\site-packages" not in content: content.insert(1, "Lib\\site-packages")
        content = [line.replace("#import site", "import site") for line in content if line.strip()]
        PTH_FILE.write_text("\n".join(content), encoding='utf-8'); print_success("Path file configured.")
    except Exception as e:
        print_error(f"Failed to modify {PTH_FILE.name}", str(e)); sys.exit(1)

    download_file(GET_PIP_URL, GET_PIP_PY_PATH, "get-pip.py script")
    print_info("Running get-pip.py to install pip...")
    try:
        run_command([str(PYTHON_EXE), str(GET_PIP_PY_PATH)], "install pip"); print_success("pip installed.")
    finally:
        if GET_PIP_PY_PATH.exists(): os.remove(GET_PIP_PY_PATH)
    step_counter += 1

    # --- STEP 4: Python Package Installation ---
    print_step_header(step_counter, TOTAL_STEPS, "Python Package Installation", "Installing required libraries.")
    for i, package in enumerate(PACKAGES_TO_INSTALL, 1):
        print_info(f"Installing package {i}/{len(PACKAGES_TO_INSTALL)}: {package}...")
        run_command([str(PYTHON_EXE), "-m", "pip", "install", "--upgrade", package], f"install {package}")
    print_success("All Python packages are up-to-date.")
    step_counter += 1

    # --- STEP 5: Application Download ---
    print_step_header(step_counter, TOTAL_STEPS, "Application Download", "Fetching the latest koboldcpp.exe.")
    download_file(KOBOLDCPP_URL, KOBOLDCPP_EXE_PATH, "koboldcpp.exe")

    print_footer()

if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code != 0:
            print(f"\n{Colors.RED}{Colors.BOLD}Setup was aborted due to a critical error.{Colors.RESET}")
    except Exception as e:
        print_error("An unexpected error occurred during the script execution.", str(e))
    finally:
        input("Press Enter to exit...")