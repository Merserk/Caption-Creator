import os
import sys
import time
import requests
import base64
import shutil
import configparser

# === Directory and Path Setup ===
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
input_dir = os.path.join(project_root, "input")
output_dir = os.path.join(project_root, "output")
config_path = os.path.join(project_root, "config.ini")

os.makedirs(output_dir, exist_ok=True)

# === Load Configuration from config.ini ===
config = configparser.ConfigParser()
if not os.path.exists(config_path):
    print(f"Error: Configuration file not found at {config_path}")
    print("Please ensure 'config.ini' exists in the same directory as the batch file.")
    sys.exit(1)

config.read(config_path)

try:
    # Load prompts from config
    prompt_captions = config.get('prompts', 'captions')
    prompt_tags = config.get('prompts', 'tags')

    # Load generation parameters from config
    gen_params = {
        "temperature": config.getfloat('generation_params', 'temperature'),
        "top_p": config.getfloat('generation_params', 'top_p'),
        "top_k": config.getint('generation_params', 'top_k'),
        "repeat_penalty": config.getfloat('generation_params', 'repeat_penalty'),
        "frequency_penalty": config.getfloat('generation_params', 'frequency_penalty'),
        "presence_penalty": config.getfloat('generation_params', 'presence_penalty'),
        "max_tokens": config.getint('generation_params', 'max_tokens')
    }
except (configparser.NoSectionError, configparser.NoOptionError) as e:
    print(f"Error reading from config.ini: {e}")
    print("Please check that config.ini has [prompts] and [generation_params] sections with all required keys.")
    sys.exit(1)

# === Get Generation Type from Command-Line Argument ===
if len(sys.argv) > 1 and sys.argv[1] in ["captions", "tags"]:
    generation_type = sys.argv[1]
else:
    print("Error: No valid generation type specified. Please run via the batch file.")
    print("Usage: python caption_generator_portable.py [captions|tags]")
    sys.exit(1)

# === API Connection ===
api_url = "http://localhost:5001/v1/models"
print(f"Starting generator in '{generation_type.capitalize()}' mode...")
print("Connecting to KoboldCpp API...")
while True:
    try:
        if requests.get(api_url).status_code == 200:
            print("API connection successful.")
            break
    except requests.ConnectionError:
        time.sleep(1)

try:
    # === Image Processing Loop ===
    valid_extensions = [".png", ".jpg", ".jpeg"]
    image_files = sorted(f for f in os.listdir(input_dir) if os.path.splitext(f)[1].lower() in valid_extensions)
    total_images = len(image_files)
    
    if total_images == 0:
        print("No images found in the 'input' folder. Please add images and run again.")
    else:
        # --- Progress Bar Initialization ---
        start_time = time.time()
        processing_times = []
        print(f"Found {total_images} images to process.")

        for i, image_file in enumerate(image_files, start=1):
            iter_start_time = time.time()

            input_image_path = os.path.join(input_dir, image_file)
            output_image_path = os.path.join(output_dir, f"{i}.png")
            output_text_path = os.path.join(output_dir, f"{i}.txt")

            shutil.copy(input_image_path, output_image_path)

            with open(input_image_path, "rb") as img_file:
                image_data = img_file.read()
                image_base64 = base64.b64encode(image_data).decode("utf-8")

            # === Define Prompts Based on Generation Type from Config ===
            user_prompt_text = ""
            if generation_type == "captions":
                user_prompt_text = prompt_captions
            elif generation_type == "tags":
                user_prompt_text = prompt_tags
            
            # === Construct API Payload ===
            messages = [
                {"role": "system", "content": ""},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_base64}"}
                        }
                    ]
                }
            ]
            
            # Combine messages with generation parameters from config
            payload = {
                "messages": messages,
                **gen_params
            }

            # === Send Request and Process Response ===
            response = requests.post("http://localhost:5001/v1/chat/completions", json=payload)

            if response.status_code == 200:
                caption = response.json()["choices"][0]["message"]["content"]
                with open(output_text_path, "w", encoding="utf-8") as f:
                    f.write(caption)
            else:
                print(f"\n[ERROR] Failed to generate for {image_file}: {response.text}")

            # --- Progress Bar Update ---
            iter_duration = time.time() - iter_start_time
            processing_times.append(iter_duration)
            
            avg_time = sum(processing_times) / len(processing_times)
            images_remaining = total_images - i
            etr_seconds = images_remaining * avg_time
            etr_mins, etr_secs = divmod(int(etr_seconds), 60)

            progress_string = (
                f"Progress: [{i}/{total_images}] | "
                f"Last: {iter_duration:.1f}s | "
                f"Avg: {avg_time:.1f}s | "
                f"ETR: {etr_mins}m {etr_secs}s"
            )
            print(f"{progress_string.ljust(80)}", end='\r')

finally:
    if 'total_images' in locals() and total_images > 0:
        total_time_taken = time.time() - start_time
        total_mins, total_secs = divmod(int(total_time_taken), 60)
        print(f"\n\nFinished processing {total_images} images in {total_mins}m {total_secs}s.")
    
    # The batch file handles closing the koboldcpp server.
    pass