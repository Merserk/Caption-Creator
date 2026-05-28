import os
import sys
import time

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import (
    build_user_prompt,
    build_progress_payload,
    encode_image,
    format_generation_output,
    list_image_files,
    send_json_message,
    write_generation_output,
)


def _base_url(config):
    base_url = config.get('generation_params', 'base_url', fallback='http://127.0.0.1:11434')
    return base_url.rstrip('/')


def _headers():
    headers = {'Accept': 'application/json'}
    token = os.environ.get('OLLAMA_API_KEY')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _request_json(config, method, endpoint, **kwargs):
    url = f'{_base_url(config)}{endpoint}'
    headers = _headers()
    if 'json' in kwargs:
        headers['Content-Type'] = 'application/json'
    response = requests.request(method, url, headers=headers, **kwargs)
    if response.status_code != 200:
        message = response.text.strip()
        try:
            payload = response.json()
            error = payload.get('error')
            if isinstance(error, str):
                message = error
            elif payload.get('message'):
                message = payload.get('message')
        except Exception:
            pass
        raise RuntimeError(f'Ollama API error {response.status_code}: {message}')
    try:
        return response.json()
    except Exception as e:
        raise RuntimeError(f'Ollama returned invalid JSON: {e}')


def _validate_model(config, model_key, timeout=30):
    if not model_key:
        raise RuntimeError('No Ollama model was selected. Select an Ollama vision model first.')

    payload = _request_json(config, 'POST', '/api/show', json={'model': model_key}, timeout=timeout)
    capabilities = payload.get('capabilities') or []
    if 'vision' not in capabilities:
        raise RuntimeError('Selected Ollama model does not support vision input.')
    return model_key


def _normalize_keep_alive(value):
    text = str(value).strip()
    try:
        return int(text)
    except Exception:
        return text


def _extract_response_text(payload):
    text = payload.get('response')
    if isinstance(text, str) and text.strip():
        return text.strip()
    message = payload.get('message')
    if isinstance(message, dict):
        content = message.get('content')
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ''


def _generate_once(config, model_key, prompt, base64_image, timeout, context_length=0, keep_alive='-1'):
    payload = {
        'model': model_key,
        'prompt': prompt,
        'images': [base64_image],
        'stream': False,
        'keep_alive': keep_alive,
    }
    if context_length and int(context_length) > 0:
        payload['options'] = {'num_ctx': int(context_length)}

    response_payload = _request_json(config, 'POST', '/api/generate', json=payload, timeout=timeout)
    text = _extract_response_text(response_payload)
    if not text:
        raise RuntimeError(f'Ollama returned no text content. Response keys={list(response_payload.keys())}')
    return text


def process_images_loop_ollama(config, model_key, resize_max=1280, image_format='auto', context_length=0, keep_alive='-1', request_pause_seconds=0.0, **kwargs):
    image_files = list_image_files(kwargs['input_dir'])
    if not image_files:
        raise ValueError('No images found in the input folder.')

    total_images = len(image_files)
    start_time = time.time()
    timeout = config.getint('generation_params', 'timeout', fallback=600)
    context_length = int(context_length or 0)
    request_pause_seconds = float(request_pause_seconds or 0.0)

    for index, image_file in enumerate(image_files, start=1):
        input_image_path = os.path.join(kwargs['input_dir'], image_file)
        send_json_message('status', f'Processing image {index} of {total_images}...')

        gen_type = kwargs['gen_type']
        prompt_template = kwargs['prompt_templates'][gen_type]
        prompt = build_user_prompt(
            gen_type,
            prompt_template,
            kwargs['max_words'],
            kwargs.get('trigger_words', ''),
            kwargs.get('prompt_enrichment', ''),
        )

        base64_image = encode_image(
            input_image_path,
            resize_max=resize_max,
            image_format=image_format,
            return_mime=False,
        )

        raw_output = _generate_once(
            config,
            model_key,
            prompt,
            base64_image,
            timeout,
            context_length=context_length,
            keep_alive=keep_alive,
        )

        final_output = format_generation_output(
            gen_type,
            raw_output,
            kwargs['max_words'],
            kwargs['single_paragraph'],
            kwargs.get('trigger_words', ''),
        )

        write_generation_output(kwargs['output_dir'], image_file, gen_type, final_output)
        send_json_message('progress', build_progress_payload(index, total_images, start_time))
        send_json_message('image-complete', {'index': index})
        if request_pause_seconds > 0 and index < total_images:
            time.sleep(request_pause_seconds)


def run_ollama_generation(config, selected_model_key='', **kwargs):
    send_json_message('status', 'Contacting Ollama... Resolving selected model.')

    timeout = config.getint('generation_params', 'timeout', fallback=600)
    resize_max = config.getint('generation_params', 'resize_max', fallback=1280)
    image_format = config.get('generation_params', 'image_format', fallback='auto')
    context_length = config.getint('generation_params', 'context_length', fallback=24576)
    keep_alive = _normalize_keep_alive(config.get('generation_params', 'keep_alive', fallback='-1'))
    request_pause_seconds = config.getfloat('generation_params', 'request_pause_seconds', fallback=0.25)

    model_key = _validate_model(config, selected_model_key, timeout=min(timeout, 30))
    process_images_loop_ollama(
        config,
        model_key=model_key,
        resize_max=resize_max,
        image_format=image_format,
        context_length=context_length,
        keep_alive=keep_alive,
        request_pause_seconds=request_pause_seconds,
        **kwargs,
    )
