import os
import sys
import time
import urllib.request
import shutil
import json
import traceback
import hashlib

# --- Model Definitions ---
class Model:
    """A class to hold model information."""
    def __init__(self, name, file, url, estimated_mb, sha256=None):
        self.name = name
        self.file = file
        self.url = url
        self.estimated_mb = estimated_mb
        self.sha256 = sha256

MODELS = [
    Model("Q2_K quantization", "llama-joycaption-beta-one-hf-llava.Q2_K.gguf", "https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.Q2_K.gguf", 3000, "c2ba7b046751caed973fd171cc7c7c091ee7a3be434dbdbce7fd421f2b82011e"),
    Model("Q4_K quantization", "llama-joycaption-beta-one-hf-llava.Q4_K_M.gguf", "https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.Q4_K_M.gguf", 4000, "afbf943e9f2fed20e0889146b0d3940c8a6bfc519a61daac61188cf9ef511f77"),
    Model("Q8_0 quantization", "llama-joycaption-beta-one-hf-llava.Q8_0.gguf", "https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.Q8_0.gguf", 8000, "7dde03037091224d9765692663734b54016d00790434816dc6d151eb08443ed5"),
    Model("F16 full precision", "llama-joycaption-beta-one-hf-llava.f16.gguf", "https://huggingface.co/mradermacher/llama-joycaption-beta-one-hf-llava-GGUF/resolve/main/llama-joycaption-beta-one-hf-llava.f16.gguf", 16000, "fb4e7b635f302c1cb39ec9693fd5474cbfd48513e812c1567ac7c1ea8cc73154"),
]
VISION_MODEL = Model("Vision Model", "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf", "https://huggingface.co/concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf/resolve/main/llama-joycaption-beta-one-llava-mmproj-model-f16.gguf", 500, "94002cb5c354c7c9e538e64f37d593db9eceeca2e94573bae6cd3b2bd8bb1952")
VRAM_MAP = {
    "5GB VRAM (Q2_K)": MODELS[0],
    "8GB VRAM (Q4_K_M)": MODELS[1],
    "10GB VRAM (Q8_0)": MODELS[2],
    "20GB VRAM (F16)": MODELS[3]
}

# --- Path Configuration ---
# The models directory path is now passed as a command-line argument.

# --- JSON Messaging ---
def send_json_message(msg_type, data):
    """Sends a structured JSON message to stdout."""
    payload = {"type": msg_type, "data": data}
    print(json.dumps(payload), flush=True)

# --- Hash Verification ---
def verify_hash(file_path, expected_hash):
    """Verifies the SHA-256 hash of a file."""
    if not expected_hash:
        return True
    
    send_json_message('status', {'message': f'Verifying file integrity...'})
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        
        actual_hash = sha256_hash.hexdigest()
        if actual_hash == expected_hash:
            send_json_message('status', {'message': 'Integrity verification successful.'})
            return True
        else:
            send_json_message('status', {'message': f'Integrity check failed! Expected {expected_hash}, got {actual_hash}'})
            return False
    except Exception as e:
        send_json_message('status', {'message': f'Error during verification: {str(e)}'})
        return False

# --- Download Logic ---
def download_file(model, models_dir):
    """Downloads a file with detailed progress reporting via JSON, featuring retries and size validation."""
    dest_path = os.path.join(models_dir, model.file)
    url = model.url
    max_retries = 5
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            downloaded = os.path.getsize(dest_path) if os.path.exists(dest_path) else 0
            headers = {'User-Agent': 'Python Downloader', 'Range': f'bytes={downloaded}-'}
            req = urllib.request.Request(url, headers=headers, method='GET')
            
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status == 206: # Partial Content
                    content_length = int(response.getheader('Content-Length', 0))
                    total_size = downloaded + content_length
                    send_json_message('status', {'message': f'Resuming download (Attempt {attempt+1}/{max_retries})...'})
                elif response.status == 200: # OK
                    total_size = int(response.getheader('Content-Length', 0))
                    if downloaded > 0:
                        # If we get 200 but already have data, the server doesn't support Range or it's a new file.
                        # We should overwrite or handle accordingly. For now, assume we restart.
                        downloaded = 0
                        open(dest_path, 'wb').close() 
                    send_json_message('status', {'message': f'Starting download (Attempt {attempt+1}/{max_retries})...'})
                else:
                    raise RuntimeError(f"Unexpected server response: {response.status}")

                with open(dest_path, 'ab') as f:
                    start_time = time.time()
                    bytes_at_start_of_chunk = downloaded
                    last_update_time = start_time

                    while downloaded < total_size:
                        chunk = response.read(65536) # Larger buffer for efficiency
                        if not chunk:
                            if downloaded < total_size:
                                raise ConnectionError(f"Incomplete read: expected {total_size} bytes, got {downloaded}")
                            break
                        
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        current_time = time.time()
                        if current_time - last_update_time >= 0.5:
                            last_update_time = current_time
                            percentage = (downloaded / total_size) * 100 if total_size > 0 else 0
                            elapsed_since_start = current_time - start_time
                            bytes_this_session = downloaded - bytes_at_start_of_chunk
                            speed_mbps = (bytes_this_session / (1024*1024) / elapsed_since_start) if elapsed_since_start > 0 else 0
                            eta_s = ((total_size - downloaded) / (speed_mbps * 1024 * 1024)) if speed_mbps > 0 else None
                            
                            send_json_message('progress', {
                                'percentage': percentage,
                                'speed_mbps': speed_mbps,
                                'downloaded_mb': downloaded / (1024*1024),
                                'total_mb': total_size / (1024*1024),
                                'eta_s': eta_s,
                                'model_name': model.name
                            })

            # Double check final size
            final_size = os.path.getsize(dest_path)
            if final_size < total_size:
                raise ValueError(f"Final file size mismatch: {final_size} < {total_size}")

            send_json_message('status', {'message': f'Successfully downloaded {model.file}.'})
            
            if model.sha256:
                if not verify_hash(dest_path, model.sha256):
                     os.remove(dest_path)
                     raise ValueError(f"Integrity check failed for {model.file}. File has been removed.")
            
            return True

        except (urllib.error.URLError, ConnectionError, TimeoutError, ValueError) as e:
            send_json_message('status', {'message': f'Download issue on attempt {attempt+1}: {str(e)}. Retrying in {retry_delay}s...'})
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            else:
                raise

    return False

# --- Main function ---
def main():
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected two arguments: the model key and the models directory path.")
        
        target_model_key = sys.argv[1]
        models_dir = sys.argv[2]
        model_to_download = VRAM_MAP.get(target_model_key)

        if not model_to_download:
            raise ValueError(f"Model key '{target_model_key}' not found.")

        os.makedirs(models_dir, exist_ok=True)

        if download_file(model_to_download, models_dir):
            vision_dest_path = os.path.join(models_dir, VISION_MODEL.file)
            if not os.path.exists(vision_dest_path) or os.path.getsize(vision_dest_path) < (VISION_MODEL.estimated_mb * 1024 * 1024 * 0.9):
                 download_file(VISION_MODEL, models_dir)

    except Exception as e:
        send_json_message("error", {"message": f"{str(e)}\n{traceback.format_exc()}"})
        sys.exit(1)

if __name__ == "__main__":
    main()