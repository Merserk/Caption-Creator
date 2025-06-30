import os
import sys
import time
import requests
import base64
import shutil
import configparser
import re

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
    print(f"Error: Configuration file not found at {config_path}", file=sys.stderr)
    sys.exit(1)

config.read(config_path)

try:
    prompt_captions = config.get('prompts', 'captions')
    prompt_tags = config.get('prompts', 'tags')
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
    print(f"Error reading from config.ini: {e}", file=sys.stderr)
    sys.exit(1)

# === Argument Parsing ===
if len(sys.argv) > 1 and sys.argv[1] in ["captions", "tags"]:
    generation_type = sys.argv[1]
else:
    print("Error: No valid generation type specified.", file=sys.stderr)
    print("Usage: python caption_generator_portable.py [captions|tags] [trigger_words] [single_paragraph_true_false] [max_words]", file=sys.stderr)
    sys.exit(1)

trigger_words = sys.argv[2] if len(sys.argv) > 2 else ""
format_as_single_paragraph = len(sys.argv) > 3 and sys.argv[3] == "true"
max_words_arg = sys.argv[4] if len(sys.argv) > 4 else "300"
max_words = int(max_words_arg) if max_words_arg.isdigit() else 300

trigger_words_prefix = ""
if trigger_words:
    print(f"Using trigger words: '{trigger_words}'")
    if generation_type == "tags":
        trigger_words_prefix = f"{trigger_words}, "
    else: 
        trigger_words_prefix = f"{trigger_words} "

if format_as_single_paragraph:
    print("Single Paragraph mode is ON.")
print(f"Max words constraint set to: {max_words}")


# === API Connection ===
api_url = "http://localhost:5001/v1/models"
# Use print for user-facing messages, not sys.stderr unless it's an unrecoverable error for the script itself
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
    valid_extensions = [".png", ".jpg", ".jpeg"]
    image_files = sorted(f for f in os.listdir(input_dir) if os.path.splitext(f)[1].lower() in valid_extensions)
    total_images = len(image_files)
    
    if total_images == 0:
        print("No images found in the 'input' folder. Please add images and run again.")
    else:
        start_time = time.time()
        processing_times = []
        print(f"Found {total_images} images to process.")

        for i, image_file in enumerate(image_files, start=1):
            iter_start_time = time.time()
            input_image_path = os.path.join(input_dir, image_file)
            # Output files are named 1.png, 2.png etc.
            output_image_path = os.path.join(output_dir, f"{i}.png")
            output_text_path = os.path.join(output_dir, f"{i}.txt")
            
            shutil.copy(input_image_path, output_image_path)

            with open(input_image_path, "rb") as img_file:
                image_data = img_file.read()
                image_base64 = base64.b64encode(image_data).decode("utf-8")
            
            current_prompt_template = prompt_captions if generation_type == "captions" else prompt_tags
            
            if generation_type == "captions":
                user_prompt_text = re.sub(r'up to \d+ words', f'up to {max_words} words', current_prompt_template)
            else:
                user_prompt_text = current_prompt_template

            messages = [
                {"role": "system", "content": ""},
                {"role": "user", "content": [{"type": "text", "text": user_prompt_text},{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}}]}
            ]
            
            api_params = gen_params.copy()
            api_params['max_tokens'] = int(max_words * 1.5)
            payload = {"messages": messages, **api_params}
            
            response = requests.post("http://localhost:5001/v1/chat/completions", json=payload)

            if response.status_code == 200:
                generated_text = response.json()["choices"][0]["message"]["content"]
                
                # Removes all trailing whitespace (spaces, newlines, etc.) from the end of the text.
                generated_text = generated_text.rstrip()

                if generation_type == "captions" and format_as_single_paragraph:
                    generated_text = re.sub(r'\s+', ' ', generated_text).strip()
                final_output = trigger_words_prefix + generated_text
                with open(output_text_path, "w", encoding="utf-8") as f:
                    f.write(final_output)

            else:
                print(f"\n[ERROR] Failed to generate for {image_file}: {response.text}", file=sys.stderr)

            # --- Unified Progress Reporting (Replaces original block) ---
            iter_duration = time.time() - iter_start_time
            processing_times.append(iter_duration)
            avg_time = sum(processing_times) / len(processing_times)
            elapsed_time = time.time() - start_time
            images_remaining = total_images - i
            etr_seconds = images_remaining * avg_time

            # Structured output for app.py to parse
            progress_data = (
                f"BATCH_PROGRESS::"
                f"current_index={i}|"
                f"total_images={total_images}|"
                f"current_file={image_file}|"
                f"avg_time={avg_time:.1f}|"
                f"elapsed={elapsed_time:.1f}|"
                f"eta={etr_seconds:.1f}"
            )
            print(progress_data)
            sys.stdout.flush()

            # Optional: Keep the progress string for the local console
            etr_mins, etr_secs = divmod(int(etr_seconds), 60)
            progress_string = (f"Progress: [{i}/{total_images}] | Last: {iter_duration:.1f}s | Avg: {avg_time:.1f}s | ETR: {etr_mins}m {etr_secs}s")
            print(f"{progress_string.ljust(80)}", end='\r') 

finally:
    if 'total_images' in locals() and total_images > 0:
        total_time_taken = time.time() - start_time
        total_mins, total_secs = divmod(int(total_time_taken), 60)
        
        print(f"\nFinished processing {total_images} images in {total_mins}m {total_secs}s.")
    sys.stdout.flush()