import os
import sys
import subprocess
import time
import urllib.request
import shutil

# --- ANSI Color and Style Constants ---
class Style:
    # ANSI escape codes for styling terminal text
    try:
        # On Windows, enable ANSI escape sequence processing
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        IS_WINDOWS = True
    except (ImportError, AttributeError):
        # Not on Windows or ctypes is not available
        IS_WINDOWS = False

    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
# --- Model Definitions ---
class Model:
    """A class to hold model information."""
    def __init__(self, name, file, url, estimated_mb):
        self.name = name
        self.file = file
        self.url = url
        self.estimated_mb = estimated_mb

MODELS = [
    Model("Q2_K quantization (~3GB model)", "llama-joycaption-beta-one-hf-llava.Q2_K.gguf", "https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.Q2_K.gguf", 3000),
    Model("Q4_K quantization (~4GB model)", "Llama-Joycaption-Beta-One-Hf-Llava-Q4_K.gguf", "https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-Q4_K.gguf", 4000),
    Model("Q8_0 quantization (~8GB model)", "Llama-Joycaption-Beta-One-Hf-Llava-Q8_0.gguf", "https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-Q8_0.gguf", 8000),
    Model("F16 full precision (~16GB model)", "Llama-Joycaption-Beta-One-Hf-Llava-F16.gguf", "https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/Llama-Joycaption-Beta-One-Hf-Llava-F16.gguf", 16000),
]
VISION_MODEL = Model("Vision Model", "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf", "https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/llama-joycaption-beta-one-llava-mmproj-model-f16.gguf", 500)

VRAM_INFO = ["5GB VRAM", "8GB VRAM", "10GB VRAM", "20GB VRAM"]

# --- Path Configuration ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODELS_DIR = os.path.join(PROJECT_ROOT, 'models')


# --- Helper Functions ---
def clear_screen():
    """Clears the console screen."""
    os.system('cls' if Style.IS_WINDOWS else 'clear')

def check_internet():
    """Checks for an active internet connection by pinging google.com."""
    print(f"{Style.CYAN}Checking internet connection...{Style.RESET}")
    try:
        # Use a timeout and redirect output to null
        subprocess.check_call(['ping', '-n', '1', 'google.com'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"{Style.GREEN}✓ Internet connection OK{Style.RESET}\n")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"{Style.RED}❌ No internet connection detected!{Style.RESET}")
        print("Please check your internet connection and try again.")
        return False

def format_eta(seconds):
    """Formats seconds into a human-readable h/m/s string."""
    if seconds is None:
        return "--s"
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds / 60)}m"
    else:
        return f"{int(seconds / 3600)}h"

def download_file_with_progress(url, dest_path, file_name, estimated_mb):
    """
    Downloads a file with a progress bar and supports resuming interrupted downloads.
    Automatically retries on connection loss.
    """
    print(f"\n{Style.YELLOW}Preparing to download: {Style.RESET}{file_name}")

    MAX_RETRIES = 10
    RETRY_DELAY = 10  # Seconds

    for attempt in range(MAX_RETRIES):
        try:
            # 1. Check for partial file and set headers for resuming
            downloaded = os.path.getsize(dest_path) if os.path.exists(dest_path) else 0

            headers = {'User-Agent': 'Python Downloader'}
            if downloaded > 0:
                headers['Range'] = f'bytes={downloaded}-'

            req = urllib.request.Request(url, headers=headers)
            response = urllib.request.urlopen(req)

            # 2. Determine total file size for the progress bar
            if response.status == 206: # 'Partial Content' - server supports resume
                print(f"{Style.CYAN}✓ Resuming download...{Style.RESET}")
                content_length = int(response.getheader('Content-Length', 0))
                total_size = downloaded + content_length
                has_real_size = True
            elif response.status == 200: # 'OK' - fresh download
                print(f"{Style.CYAN}✓ Starting new download...{Style.RESET}")
                total_size = int(response.getheader('Content-Length', 0))
                has_real_size = True
            else:
                print(f"{Style.YELLOW}Warning: Server sent status {response.status}. Using estimated size.{Style.RESET}")
                total_size = estimated_mb * 1024 * 1024
                has_real_size = False
            
            if total_size == 0 or (response.status == 206 and total_size == downloaded):
                 total_size = estimated_mb * 1024 * 1024
                 has_real_size = False

            if downloaded > 0 and has_real_size and downloaded >= total_size:
                print(f"{Style.GREEN}✓ File already fully downloaded.{Style.RESET}")
                return True

            # 3. Open file (append mode for resume) and start download loop
            open_mode = 'ab' if downloaded > 0 else 'wb'
            initial_downloaded_for_attempt = downloaded
            start_time = time.time()
            
            with open(dest_path, open_mode) as f:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break 
                    
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    percent = (downloaded / total_size) * 100 if total_size > 0 else 0
                    if not has_real_size and percent > 100: percent = 100

                    bytes_this_session = downloaded - initial_downloaded_for_attempt
                    elapsed_time = time.time() - start_time
                    speed_mbps = (bytes_this_session / (1024*1024) / elapsed_time) if elapsed_time > 0 else 0
                    
                    eta = ((total_size - downloaded) / (speed_mbps * 1024 * 1024)) if speed_mbps > 0 and has_real_size else None

                    bar_width = shutil.get_terminal_size((80, 20)).columns - 60
                    if bar_width < 10: bar_width = 10
                    filled_len = int(bar_width * percent / 100)
                    bar = '█' * filled_len + '░' * (bar_width - filled_len)
                    
                    downloaded_mb = downloaded / (1024*1024)
                    total_mb_display = total_size / (1024*1024) if has_real_size else estimated_mb
                    
                    progress_str = (
                        f"\r{Style.GREEN}{bar}{Style.RESET} {int(percent):>3}% "
                        f"| {Style.CYAN}{speed_mbps:5.2f} MB/s{Style.RESET} "
                        f"| {Style.MAGENTA}{downloaded_mb:,.1f}/{total_mb_display:,.1f} MB{Style.RESET} "
                        f"| ETA: {Style.BLUE}{format_eta(eta)}{Style.RESET}  "
                    )
                    sys.stdout.write(progress_str)
                    sys.stdout.flush()

            sys.stdout.write('\n')
            final_size = os.path.getsize(dest_path)
            if final_size < 1_000_000:
                print(f"{Style.RED}❌ Downloaded file is unexpectedly small. Deleting.{Style.RESET}")
                os.remove(dest_path)
                return False

            print(f"{Style.GREEN}✓ Download completed successfully!{Style.RESET}")
            return True

        except Exception as e:
            sys.stdout.write('\n')
            print(f"{Style.RED}An error occurred: {e}{Style.RESET}")

            if attempt < MAX_RETRIES - 1:
                print(f"{Style.YELLOW}Connection lost. Will attempt to reconnect...{Style.RESET}")
                for i in range(RETRY_DELAY, 0, -1):
                    sys.stdout.write(f"\rRetrying in {i}s... ")
                    sys.stdout.flush()
                    time.sleep(1)
                sys.stdout.write("\n")
                
                if not check_internet():
                    print(f"\n{Style.RED}❌ Still no internet connection. Aborting download.{Style.RESET}")
                    return False
            else:
                print(f"{Style.RED}❌ Max retries reached. Download failed.{Style.RESET}")
                return False
    return False

# --- THIS FUNCTION HAS BEEN CORRECTED ---
def download_model(model):
    """Handles the logic for downloading a single model."""
    dest_path = os.path.join(MODELS_DIR, model.file)
    
    if os.path.exists(dest_path):
        print(f"\n{Style.YELLOW}Model file already exists: {Style.RESET}{model.file}")
        # Check if the file is a partial download and just continue
        if os.path.getsize(dest_path) < (model.estimated_mb * 1024 * 1024 * 0.9):
             print(f"{Style.YELLOW}It appears to be a partial download. Attempting to resume.{Style.RESET}")
        else:
            choice = input("File seems complete. Replace and re-download? (y/N): ").strip().lower()
            if choice == 'y':
                # --- THIS IS THE FIX ---
                # Delete the existing file before attempting to re-download.
                try:
                    print(f"{Style.YELLOW}Deleting existing file before re-downloading...{Style.RESET}")
                    os.remove(dest_path)
                except OSError as e:
                    print(f"{Style.RED}Error removing file: {e}{Style.RESET}")
                    input("\nPress Enter to return to the menu...")
                    return
            else:
                print("Download cancelled.")
                time.sleep(2)
                return

    # Download main model
    success = download_file_with_progress(model.url, dest_path, model.file, model.estimated_mb)

    if success:
        # If main model downloaded, also download the vision model
        download_vision_model_if_needed()
    else:
        print(f"\n{Style.RED}❌ Failed to download: {Style.RESET}{model.file}")
        print(f"{Style.YELLOW}You can run the downloader again to resume.{Style.RESET}")

    input("\nPress Enter to return to the menu...")

def download_vision_model_if_needed(force_check=False):
    """Downloads the vision model if it doesn't exist."""
    vision_dest_path = os.path.join(MODELS_DIR, VISION_MODEL.file)
    if not os.path.exists(vision_dest_path) or force_check:
        print(f"\n{Style.CYAN}Downloading required vision model...{Style.RESET}")
        if not download_file_with_progress(VISION_MODEL.url, vision_dest_path, VISION_MODEL.file, VISION_MODEL.estimated_mb):
            print(f"{Style.RED}❌ Failed to download vision model.{Style.RESET}")

def download_all_models():
    """Handles logic for downloading all models."""
    print(f"\n{Style.CYAN}Starting download of all models...{Style.RESET}\n")
    for model in MODELS:
        dest_path = os.path.join(MODELS_DIR, model.file)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > (model.estimated_mb * 1024 * 1024 * 0.95):
            print(f"{Style.YELLOW}Skipping {model.file} - already exists and seems complete.{Style.RESET}")
        else:
            print(f"{Style.CYAN}Downloading: {Style.RESET}{model.name}")
            download_file_with_progress(model.url, dest_path, model.file, model.estimated_mb)
            print("-" * 20)
    
    # After downloading all main models, check for the vision model
    download_vision_model_if_needed(force_check=True)

    print(f"\n{Style.GREEN}✓ All downloads attempted!{Style.RESET}")
    input("\nPress Enter to return to the menu...")

# --- Main Application Logic ---
def main_menu():
    """Displays the main menu and handles user input."""
    while True:
        clear_screen()
        print(f"{Style.BLUE}╔══════════════════════════════════════════════════════════════════════════════╗{Style.RESET}")
        print(f"{Style.BLUE}║{Style.RESET}{Style.BOLD}                           Llama Joycaption Model Downloader                  {Style.BLUE}{Style.BOLD}║{Style.RESET}")
        print(f"{Style.BLUE}╚══════════════════════════════════════════════════════════════════════════════╝{Style.RESET}\n")
        
        if not check_internet():
            input("\nPress Enter to exit.")
            break

        print(f"{Style.WHITE}{Style.BOLD}Select a model to download:{Style.RESET}")
        
        for i, model in enumerate(MODELS):
            dest_path = os.path.join(MODELS_DIR, model.file)
            status = ""
            if os.path.exists(dest_path):
                file_size_mb = os.path.getsize(dest_path) / (1024*1024)
                if file_size_mb < (model.estimated_mb * 0.95):
                    status = f"{Style.YELLOW}Partial ({file_size_mb:.0f} MB){Style.RESET}"
                else:
                    status = f"{Style.GREEN}Available{Style.RESET}"
            else:
                status = f"{Style.YELLOW}Not downloaded{Style.RESET}"
            print(f" {i+1}) {VRAM_INFO[i]:<10} - {model.name:<30} {status}")
        
        print("\n 5) Download All Models")
        print(" 6) Exit\n")
        
        choice = input("Enter your choice (1-6): ").strip()
        
        if choice.isdigit():
            choice_num = int(choice)
            if 1 <= choice_num <= 4:
                download_model(MODELS[choice_num - 1])
            elif choice_num == 5:
                download_all_models()
            elif choice_num == 6:
                print("Exiting.")
                break
            else:
                print(f"{Style.RED}Invalid choice. Please try again.{Style.RESET}")
                time.sleep(2)
        else:
            print(f"{Style.RED}Invalid input. Please enter a number.{Style.RESET}")
            time.sleep(2)

def main():
    """The main entry point of the script."""
    # Ensure the models directory exists
    os.makedirs(MODELS_DIR, exist_ok=True)
    main_menu()

if __name__ == "__main__":
    main()