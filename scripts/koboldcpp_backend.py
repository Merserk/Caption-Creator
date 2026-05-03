import os
import time
import requests
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import (
    build_user_prompt,
    calculate_output_tokens,
    clean_caption_output,
    encode_image,
    format_tags,
    list_image_files,
    parse_generation_params,
    send_json_message,
)
from model_catalog import get_model_bundle

def process_images_loop_kobold(api_url, gen_params, **kwargs):
    """Specialized loop for KoboldCPP using OpenAI-compatible chat with images."""
    
    image_files = list_image_files(kwargs['input_dir'])
    
    if not image_files:
        raise ValueError("No images found in the input folder.")

    total_images = len(image_files)
    start_time = time.time()
    
    session = requests.Session()
    
    for i, image_file in enumerate(image_files, start=1):
        input_image_path = os.path.join(kwargs['input_dir'], image_file)
        send_json_message("status", f"Processing image {i} of {total_images}...")
        
        current_prompt_template = kwargs['prompt_captions'] if kwargs['gen_type'] == "captions" else kwargs['prompt_tags']
        user_prompt_text = build_user_prompt(
            kwargs['gen_type'],
            current_prompt_template,
            kwargs['max_words'],
            kwargs.get('trigger_words', ''),
            kwargs.get('prompt_enrichment', '')
        )
        configured_max_tokens = gen_params.get("max_length", gen_params.get("max_tokens", 900))
        output_tokens = calculate_output_tokens(kwargs['gen_type'], kwargs['max_words'], configured_max_tokens)
        
        base64_image = encode_image(input_image_path)
        
        payload = {
            "model": "local-model",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt_text},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ],
            "temperature": gen_params.get("temperature", 0.2),
            "top_p": gen_params.get("top_p", 0.95),
            "top_k": gen_params.get("top_k", 40),
            "repeat_penalty": gen_params.get("rep_pen", gen_params.get("repeat_penalty", 1.1)),
            "presence_penalty": gen_params.get("presence_penalty", gen_params.get("frequency_penalty", 0.0)),
            "max_tokens": output_tokens,
            "stop": ["</image>", "<image>", "</caption>", "<caption>", "```"]
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
                    choices = json_resp.get("choices", [])
                    if choices:
                        raw_output = choices[0].get("message", {}).get("content", "").strip()
                    
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

        if kwargs['gen_type'] == 'tags':
            final_output = format_tags(raw_output, max_tags=min(int(kwargs['max_words']), 200), trigger_words=kwargs.get('trigger_words', ''))
        else:
            final_output = clean_caption_output(raw_output, kwargs['max_words'], kwargs['single_paragraph'], kwargs.get('trigger_words', ''))

        output_file_name = os.path.splitext(image_file)[0] + ".txt"
        with open(os.path.join(kwargs['output_dir'], output_file_name), "w", encoding="utf-8") as f:
            f.write(final_output)

        elapsed = time.time() - start_time
        time_per_img = elapsed / i
        eta = (total_images - i) * time_per_img
        send_json_message("progress", {"current": i, "total": total_images, "percentage": (i / total_images) * 100, "elapsed": elapsed, "eta": eta, "time_per_img": time_per_img})
        send_json_message("image-complete", {"index": i})

def run_koboldcpp_generation(config, koboldcpp_exe, models_dir, desired_model_key, low_vram, **kwargs):
    model_bundle = get_model_bundle(desired_model_key)
    if not model_bundle:
        raise RuntimeError(f"Unknown model key: {desired_model_key}")

    model_path = os.path.join(models_dir, model_bundle.model.file)
    if not os.path.exists(model_path):
        raise RuntimeError(f"Model file for '{desired_model_key}' not found at {model_path}.")

    low_vram_flags = ["--mmprojcpu", "--flashattention"] if low_vram else []
    mmproj_file = os.path.join(models_dir, model_bundle.vision.file)
    if not os.path.exists(mmproj_file):
        raise RuntimeError(f"Vision projector not found at {mmproj_file}.")
    
    kobold_command = [
        koboldcpp_exe, 
        "--model", model_path, 
        "--mmproj", mmproj_file, 
        "--quiet", 
        "--port", "5001", 
        "--host", "127.0.0.1", 
        "--jinja",
        *low_vram_flags
    ]
    
    c_flags = 0
    if sys.platform == "win32":
        c_flags = 0x08000000
    
    proc = subprocess.Popen(kobold_command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=c_flags)
    
    try:
        for _ in range(60):
            try:
                if requests.get("http://127.0.0.1:5001/api/v1/info/version", timeout=1).status_code == 200:
                    gen_params = parse_generation_params(config)
                    process_images_loop_kobold("http://127.0.0.1:5001/v1/chat/completions", gen_params, **kwargs)
                    return
            except Exception:
                time.sleep(1)
        raise RuntimeError("KoboldCPP failed to start within the timeout period.")
    finally:
        if proc.poll() is None:
            proc.kill()
