import os
import time
import requests
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import encode_image, send_json_message, format_tags

def _select_model_id(models):
    # Prefer loaded vision-capable models
    for m in models:
        if m.get("loaded_instances") and m.get("capabilities", {}).get("vision"):
            return m["loaded_instances"][0].get("id")
    # Then any loaded model
    for m in models:
        if m.get("loaded_instances"):
            return m["loaded_instances"][0].get("id")
    # Then any vision-capable model key
    for m in models:
        if m.get("capabilities", {}).get("vision"):
            return m.get("id") or m.get("key")
    # Fallback to first model
    if models:
        return models[0].get("id") or models[0].get("key")
    return None

def process_images_loop_lm(api_url, gen_params, model_id=None, resize_max=1120, **kwargs):
    """Specialized loop for LM Studio with stability fixes."""
    
    image_files = sorted([f for f in os.listdir(kwargs['input_dir']) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))],
                         key=lambda x: int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else -1)
    
    if not image_files:
        raise ValueError("No images found in the input folder.")

    total_images = len(image_files)
    start_time = time.time()
    
    for i, image_file in enumerate(image_files, start=1):
        # 1. Stability Delay
        if i > 1:
            time.sleep(2)
            
        input_image_path = os.path.join(kwargs['input_dir'], image_file)
        send_json_message("status", f"Processing image {i} of {total_images}...")
        
        # 2. Prompt Construction
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
        
        # 3. Image Encoding (Balanced Resolution)
        base64_image = encode_image(input_image_path, resize_max=resize_max)
        
        # 4. Native v1 Payload
        payload = {
            "model": model_id if model_id else "local-model",
            "input": [
                {"type": "text", "content": user_prompt_text},
                {"type": "image", "data_url": f"data:image/jpeg;base64,{base64_image}"}
            ],
            "temperature": gen_params.get("temperature", 0.1),
            "top_p": gen_params.get("top_p", 0.9),
            "repeat_penalty": gen_params.get("repeat_penalty", 1.2),
            "max_output_tokens": gen_params.get("max_tokens", 800),
            "stop": ["</image>", "<image>", "</caption>", "<caption>", "```"]
        }

        success = False
        raw_output = ""
        max_retries = 3
        retry_delay = 5

        for attempt in range(max_retries):
            # 5. Session Per Request (Stability)
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
                    except: pass
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

        # Sanitize known LLM artifact tokens from raw output (lightweight, targeted only)
        ARTIFACT_PATTERNS = [
            r'</?image>', r'</?caption>', r'</?output>', r'</?tag>',
            r'</?s>', r'</?\|scene\|>', r'```', r'<\|', r'\|>'
        ]
        for pat in ARTIFACT_PATTERNS:
            raw_output = re.sub(pat, '', raw_output, flags=re.IGNORECASE)

        # 6. Cleaning and Saving
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
                # Remove any existing occurrence of the trigger word (case-insensitive)
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
            # Normalize trailing dots left behind when the LLM EOS token (</s>) is
            # stripped by the sanitizer, leaving stray "." or ".." at the tail.
            final_output = re.sub(r'(?:\s+\.)+\s*$', '.', final_output)
            final_output = re.sub(r'\.{2,}$', '.', final_output)

        output_file_name = os.path.splitext(image_file)[0] + ".txt"
        with open(os.path.join(kwargs['output_dir'], output_file_name), "w", encoding="utf-8") as f:
            f.write(final_output)

        # 7. Progress Update
        elapsed = time.time() - start_time
        time_per_img = elapsed / i
        eta = (total_images - i) * time_per_img
        send_json_message("progress", {"current": i, "total": total_images, "percentage": (i / total_images) * 100, "elapsed": elapsed, "eta": eta, "time_per_img": time_per_img})
        send_json_message("image-complete", {"index": i})

def run_lm_studio_generation(config, **kwargs):
    from utils import send_json_message
    
    send_json_message("status", "Contacting LM Studio... Resolving model ID.")
    model_id = None
    try:
        resp = requests.get("http://127.0.0.1:1234/api/v1/models", timeout=5)
        if resp.status_code == 200:
            resp_json = resp.json()
            # Capture both possible formats (data or models)
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
