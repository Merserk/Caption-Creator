import os
import time
import requests
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
    send_json_message,
)

def _select_model_id(models):
    for m in models:
        if m.get("loaded_instances") and m.get("capabilities", {}).get("vision"):
            return m["loaded_instances"][0].get("id")

    for m in models:
        if m.get("loaded_instances"):
            return m["loaded_instances"][0].get("id")

    for m in models:
        if m.get("capabilities", {}).get("vision"):
            return m.get("id") or m.get("key")

    if models:
        return models[0].get("id") or models[0].get("key")
    return None

def process_images_loop_lm(api_url, gen_params, model_id=None, resize_max=1120, **kwargs):
    """Specialized loop for LM Studio with stability fixes."""
    
    image_files = list_image_files(kwargs['input_dir'])
    
    if not image_files:
        raise ValueError("No images found in the input folder.")

    total_images = len(image_files)
    start_time = time.time()
    
    for i, image_file in enumerate(image_files, start=1):
        if i > 1:
            time.sleep(2)
            
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
        output_tokens = calculate_output_tokens(kwargs['gen_type'], kwargs['max_words'], gen_params.get("max_tokens", 900))
        
        base64_image = encode_image(input_image_path, resize_max=resize_max)
        
        payload = {
            "model": model_id if model_id else "local-model",
            "input": [
                {"type": "text", "content": user_prompt_text},
                {"type": "image", "data_url": f"data:image/jpeg;base64,{base64_image}"}
            ],
            "temperature": gen_params.get("temperature", 0.1),
            "top_p": gen_params.get("top_p", 0.9),
            "repeat_penalty": gen_params.get("repeat_penalty", 1.2),
            "max_output_tokens": output_tokens
        }

        success = False
        raw_output = ""
        max_retries = 3
        retry_delay = 5

        for attempt in range(max_retries):
            session = requests.Session()
            try:
                response = session.post(api_url, json=payload, timeout=180)
                if response.status_code == 200:
                    json_resp = response.json()
                    output = json_resp.get("output", [])
                    for item in output:
                        if item.get("type") == "message":
                            raw_output = item.get("content", "").strip()
                            break
                    if raw_output:
                        success = True
                        break
                    else:
                        raise ValueError("Empty output content from API")
                else:
                    err_msg = response.text
                    try:
                        err_json = response.json()
                        err_msg = err_json.get("error", {}).get("message", err_msg)
                    except Exception:
                        pass
                    raise RuntimeError(f"API Error: {err_msg}")
            except Exception as e:
                send_json_message("status", f"Retry {attempt+1}/{max_retries} due to: {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
            finally:
                session.close()
        
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

def run_lm_studio_generation(config, **kwargs):
    send_json_message("status", "Contacting LM Studio... Resolving model ID.")
    model_id = None
    try:
        resp = requests.get("http://127.0.0.1:1234/api/v1/models", timeout=5)
        if resp.status_code == 200:
            resp_json = resp.json()
            data = resp_json.get("data", [])
            if not data:
                data = resp_json.get("models", [])

            if data:
                model_id = _select_model_id(data)
    except Exception as e:
        send_json_message("status", f"Warning: Model resolution issue ({e}).")
    
    if not model_id:
        model_id = "local-model"
    
    gen_params = {
        "temperature": config.getfloat('generation_params', 'temperature', fallback=0.1),
        "top_p": config.getfloat('generation_params', 'top_p', fallback=0.9),
        "max_tokens": config.getint('generation_params', 'max_tokens', fallback=800),
        "repeat_penalty": config.getfloat('generation_params', 'repeat_penalty', fallback=1.2)
    }
    
    process_images_loop_lm("http://127.0.0.1:1234/api/v1/chat", gen_params, model_id=model_id, resize_max=1120, **kwargs)
