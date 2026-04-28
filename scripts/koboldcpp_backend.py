import os
import time
import requests
import re
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import encode_image, send_json_message, format_tags

def process_images_loop_kobold(api_url, gen_params, **kwargs):
    """Specialized loop for KoboldCPP using native API with images."""
    
    image_files = sorted([f for f in os.listdir(kwargs['input_dir']) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))],
                         key=lambda x: int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else -1)
    
    if not image_files:
        raise ValueError("No images found in the input folder.")

    total_images = len(image_files)
    start_time = time.time()
    
    # KoboldCPP is generally stable with a persistent session
    session = requests.Session()
    
    for i, image_file in enumerate(image_files, start=1):
        input_image_path = os.path.join(kwargs['input_dir'], image_file)
        send_json_message("status", f"Processing image {i} of {total_images}...")
        
        # 1. Prompt Construction
        current_prompt_template = kwargs['prompt_captions'] if kwargs['gen_type'] == "captions" else kwargs['prompt_tags']
        user_prompt_text = current_prompt_template.replace("{max_words}", str(kwargs['max_words']))
        user_prompt_text = re.sub(r"up to \d+ words", f"up to {kwargs['max_words']} words", user_prompt_text, flags=re.IGNORECASE)
        
        trigger = kwargs.get('trigger_words', '').strip()
        prefix_parts = []

        if kwargs['gen_type'] == 'captions':
            # Caption Mode: inject trigger word as a clear output requirement
            if trigger:
                prefix_parts.append(f'IMPORTANT: The caption MUST include the word "{trigger}".')
        else:
            # Tags Mode: enforce trigger word position and max tag count
            if trigger:
                prefix_parts.append(f'IMPORTANT: The tag list MUST include "{trigger}" as the first tag.')
            max_tags = min(int(kwargs['max_words']), 200)
            prefix_parts.append(f'Use exactly {max_tags} tags or fewer.')

        if prefix_parts:
            user_prompt_text = ' '.join(prefix_parts) + ' ' + user_prompt_text

        if kwargs.get('prompt_enrichment'):
            user_prompt_text += f" {kwargs['prompt_enrichment']}"
        
        # 2. Image Encoding
        base64_image = encode_image(input_image_path)
        
        # 3. Native KoboldCPP Payload
        payload = {
            "prompt": user_prompt_text,
            "images": [base64_image],
            "temperature": gen_params.get("temperature", 0.2),
            "top_p": gen_params.get("top_p", 0.95),
            "top_k": gen_params.get("top_k", 40),
            "rep_pen": gen_params.get("rep_pen", gen_params.get("repeat_penalty", 1.1)),
            "max_length": gen_params.get("max_length", gen_params.get("max_tokens", 600)),
            "stop_sequence": ["</image>", "<image>", "</caption>", "<caption>", "```"]
        }

        success = False
        raw_output = ""
        max_retries = 3
        retry_delay = 3

        for attempt in range(max_retries):
            try:
                response = session.post(api_url, json=payload, timeout=180)
                if response.status_code == 200:
                    json_resp = response.json()
                    results = json_resp.get("results", [])
                    if results:
                        raw_output = results[0].get("text", "").strip()
                    
                    if raw_output:
                        success = True
                        break
                    else:
                        raise ValueError("Empty output content from API")
                else:
                    raise RuntimeError(f"API Error: {response.text}")
            except Exception as e:
                send_json_message("status", f"Retry {attempt+1}/{max_retries} due to: {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
        
        if not success:
            raise RuntimeError(f"Failed to generate for {image_file} after {max_retries} retries.")

        # Sanitize known LLM artifact tokens from raw output (lightweight, targeted only)
        ARTIFACT_PATTERNS = [
            r'</?image>', r'</?caption>', r'</?output>', r'</?tag>',
            r'</?s>', r'</?\|scene\|>', r'```', r'<\|', r'\|>'
        ]
        for pat in ARTIFACT_PATTERNS:
            raw_output = re.sub(pat, '', raw_output, flags=re.IGNORECASE)

        # 4. Cleaning and Saving
        trigger = kwargs.get('trigger_words', '').strip()

        if kwargs['gen_type'] == 'tags':
            final_output = format_tags(raw_output)
            # Post-processing: enforce trigger word and max tag count
            max_tags = min(int(kwargs['max_words']), 200)
            if trigger or kwargs['max_words']:
                tags_list = [t.strip() for t in final_output.split(',') if t.strip()]
                if trigger:
                    # Remove any existing occurrence of the trigger word (case-insensitive)
                    tags_list = [t for t in tags_list if t.lower() != trigger.lower()]
                    # Prepend trigger as the first tag
                    tags_list.insert(0, trigger)
                # Enforce max tag count
                if len(tags_list) > max_tags:
                    tags_list = tags_list[:max_tags]
                final_output = ', '.join(tags_list)
        else:
            # Caption Mode: normalize whitespace
            final_output = re.sub(r'\s+', ' ', raw_output).strip() if kwargs['single_paragraph'] else raw_output
            # Post-processing: enforce trigger word at the start of the caption
            if trigger:
                # Remove any existing occurrence of the trigger word (case-insensitive, whole-word-ish)
                pattern = re.compile(re.escape(trigger), re.IGNORECASE)
                final_output = pattern.sub('', final_output)
                # Collapse any double spaces / leading/trailing whitespace caused by removal
                final_output = re.sub(r'\s{2,}', ' ', final_output).strip()
                # Clean up leftover dots/commas at the very beginning after removal
                final_output = final_output.lstrip('.,;:!? ')
                # Prepend trigger word at the very start, preserving its original casing
                final_output = f"{trigger}. {final_output}".strip()
                # Capitalize the first letter of the caption text (after the trigger prefix)
                prefix = f"{trigger}. "
                rest = final_output[len(prefix):]
                if rest and rest[0].isalpha() and rest[0].islower():
                    rest = rest[0].upper() + rest[1:]
                final_output = prefix + rest
            elif final_output and final_output[0].isalpha() and final_output[0].islower():
                final_output = final_output[0].upper() + final_output[1:]
            # Normalize trailing dots left behind when the LLM EOS token (</s>) is
            # stripped by the sanitizer, leaving stray "." or ".." at the tail.
            final_output = re.sub(r'(?:\s+\.)+\s*$', '.', final_output)
            final_output = re.sub(r'\.{2,}$', '.', final_output)

        output_file_name = os.path.splitext(image_file)[0] + ".txt"
        with open(os.path.join(kwargs['output_dir'], output_file_name), "w", encoding="utf-8") as f:
            f.write(final_output)

        # 5. Progress Update
        elapsed = time.time() - start_time
        time_per_img = elapsed / i
        eta = (total_images - i) * time_per_img
        send_json_message("progress", {"current": i, "total": total_images, "percentage": (i / total_images) * 100, "elapsed": elapsed, "eta": eta, "time_per_img": time_per_img})
        send_json_message("image-complete", {"index": i})

def run_koboldcpp_generation(config, koboldcpp_exe, models_dir, desired_model_key, low_vram, **kwargs):
    from utils import send_json_message
    
    MODELS = {
        "5GB VRAM (Q2_K)": "llama-joycaption-beta-one-hf-llava.Q2_K.gguf",
        "8GB VRAM (Q4_K_M)": "llama-joycaption-beta-one-hf-llava.Q4_K_M.gguf",
        "10GB VRAM (Q8_0)": "llama-joycaption-beta-one-hf-llava.Q8_0.gguf",
        "20GB VRAM (F16)": "llama-joycaption-beta-one-hf-llava.f16.gguf"
    }
    model_file = MODELS.get(desired_model_key)
    if not model_file:
        raise RuntimeError(f"Unknown model key: {desired_model_key}")

    model_path = os.path.join(models_dir, model_file)
    if not os.path.exists(model_path):
        raise RuntimeError(f"Model file for '{desired_model_key}' not found at {model_path}.")

    low_vram_flags = ["--mmprojcpu", "--flashattention"] if low_vram else []
    mmproj_file = os.path.join(models_dir, "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf")
    if not os.path.exists(mmproj_file):
        raise RuntimeError(f"Vision projector not found at {mmproj_file}.")
    
    kobold_command = [
        koboldcpp_exe, 
        "--model", model_path, 
        "--mmproj", mmproj_file, 
        "--quiet", 
        "--port", "5001", 
        "--host", "127.0.0.1", 
        *low_vram_flags
    ]
    
    # Creation flags for Windows to hide the console window
    c_flags = 0
    if sys.platform == "win32":
        c_flags = 0x08000000 # CREATE_NO_WINDOW
    
    proc = subprocess.Popen(kobold_command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=c_flags)
    
    try:
        # Wait for KoboldCPP to start (up to 60 seconds)
        for _ in range(60):
            try:
                if requests.get("http://127.0.0.1:5001/api/v1/info/version", timeout=1).status_code == 200:
                    gen_params = {}
                    if config.has_section('generation_params'):
                        for k, v in config['generation_params'].items():
                            try:
                                gen_params[k] = float(v) if '.' in v else int(v)
                            except Exception:
                                gen_params[k] = v
                    process_images_loop_kobold("http://127.0.0.1:5001/api/v1/generate", gen_params, **kwargs)
                    return
            except:
                time.sleep(1)
        raise RuntimeError("KoboldCPP failed to start within the timeout period.")
    finally:
        if proc.poll() is None:
            proc.kill()
