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

LM_HOST = 'http://127.0.0.1:1234'


def _headers():
    headers = {'Accept': 'application/json'}
    token = os.environ.get('LM_STUDIO_API_KEY') or os.environ.get('LM_API_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _request_json(method, endpoint, **kwargs):
    url = f'{LM_HOST}{endpoint}'
    response = requests.request(method, url, headers=_headers(), **kwargs)
    if response.status_code != 200:
        message = response.text.strip()
        try:
            payload = response.json()
            error = payload.get('error')
            if isinstance(error, dict):
                message = error.get('message') or message
            elif isinstance(error, str):
                message = error
            elif payload.get('message'):
                message = payload.get('message')
        except Exception:
            pass
        raise RuntimeError(f'LM Studio API error {response.status_code}: {message}')
    try:
        return response.json()
    except Exception as e:
        raise RuntimeError(f'LM Studio returned invalid JSON: {e}')


def _select_model_key(models):
    llm_models = [m for m in models if m.get('type') in (None, 'llm')]

    for model in llm_models:
        if (model.get('loaded_instances') or []) and model.get('capabilities', {}).get('vision'):
            return model.get('key') or model.get('id')

    for model in llm_models:
        if model.get('loaded_instances') or []:
            return model.get('key') or model.get('id')

    for model in llm_models:
        if model.get('capabilities', {}).get('vision'):
            return model.get('key') or model.get('id')

    if llm_models:
        return llm_models[0].get('key') or llm_models[0].get('id')
    return None


def _resolve_model_key(timeout=10, selected_model_key=''):
    payload = _request_json('GET', '/api/v1/models', timeout=timeout)
    models = payload.get('models') or []

    if selected_model_key:
        for model in models:
            if (model.get('key') or model.get('id')) == selected_model_key:
                if model.get('type') not in (None, 'llm'):
                    raise RuntimeError('Selected LM Studio model is not an LLM.')
                if not model.get('capabilities', {}).get('vision'):
                    raise RuntimeError('Selected LM Studio model does not support vision input.')
                return selected_model_key
        raise RuntimeError('Selected LM Studio model was not found. Refresh the model list and select it again.')

    model_key = _select_model_key(models)
    if not model_key:
        raise RuntimeError('No LM Studio LLM model was found. Load a vision model in LM Studio first.')
    return model_key


def _build_chat_payload(model_key, prompt, data_url, context_length=0):
    payload = {
        'model': model_key,
        'input': [
            {'type': 'image', 'data_url': data_url},
            {'type': 'text', 'content': prompt},
        ],
        'stream': False,
        'store': False,
    }
    if context_length and int(context_length) > 0:
        payload['context_length'] = int(context_length)
    return payload


def _text_from_value(value):
    if value is None:
        return ''
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        parts = [_text_from_value(item) for item in value]
        return '\n'.join(part for part in parts if part).strip()
    if isinstance(value, dict):
        preferred_keys = ('content', 'text', 'message', 'output_text', 'value')
        parts = []
        for key in preferred_keys:
            if key in value:
                part = _text_from_value(value.get(key))
                if part:
                    parts.append(part)
        if parts:
            return '\n'.join(parts).strip()
    return ''


def _extract_message_text(payload):
    if not isinstance(payload, dict):
        return ''

    output = payload.get('output')
    if isinstance(output, list):
        messages = []
        fallback_text = []
        for item in output:
            if not isinstance(item, dict):
                continue
            item_type = item.get('type')
            text = _text_from_value(item.get('content')) or _text_from_value(item.get('text'))
            if item_type == 'message' and text:
                messages.append(text)
            elif text:
                fallback_text.append(text)
        if messages:
            return '\n'.join(messages).strip()
        if fallback_text:
            return '\n'.join(fallback_text).strip()

    for key in ('output_text', 'content', 'message', 'text'):
        text = _text_from_value(payload.get(key))
        if text:
            return text

    return ''


def _summarize_response_shape(payload):
    if not isinstance(payload, dict):
        return type(payload).__name__
    output = payload.get('output')
    if isinstance(output, list):
        types = [str(item.get('type', 'unknown')) for item in output if isinstance(item, dict)]
        stats = payload.get('stats') if isinstance(payload.get('stats'), dict) else {}
        return f"output item types={types}, stats={stats}"
    return f"top-level keys={list(payload.keys())}"


def _generate_once(model_key, prompt, data_url, timeout, context_length=0):
    request_payload = _build_chat_payload(model_key, prompt, data_url, context_length=context_length)
    response_payload = _request_json('POST', '/api/v1/chat', json=request_payload, timeout=timeout)
    text = _extract_message_text(response_payload)
    if not text:
        raise RuntimeError(f'LM Studio returned no text content. {_summarize_response_shape(response_payload)}')
    return text


def process_images_loop_lm(gen_params, model_key, resize_max=1280, image_format='auto', context_length=0, request_pause_seconds=0.0, **kwargs):
    image_files = list_image_files(kwargs['input_dir'])
    if not image_files:
        raise ValueError('No images found in the input folder.')

    total_images = len(image_files)
    start_time = time.time()
    timeout = int(gen_params.get('timeout', 600))
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

        base64_image, mime_type = encode_image(
            input_image_path,
            resize_max=resize_max,
            image_format=image_format,
            return_mime=True,
        )
        data_url = f'data:{mime_type};base64,{base64_image}'

        raw_output = _generate_once(model_key, prompt, data_url, timeout, context_length=context_length)

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


def run_lm_studio_generation(config, selected_model_key='', **kwargs):
    send_json_message('status', 'Contacting LM Studio... Resolving selected model.')

    timeout = config.getint('generation_params', 'timeout', fallback=600)
    resize_max = config.getint('generation_params', 'resize_max', fallback=1280)
    image_format = config.get('generation_params', 'image_format', fallback='auto')
    context_length = config.getint('generation_params', 'context_length', fallback=16384)
    request_pause_seconds = config.getfloat('generation_params', 'request_pause_seconds', fallback=0.25)

    model_key = _resolve_model_key(timeout=min(timeout, 30), selected_model_key=selected_model_key)
    process_images_loop_lm(
        {'timeout': timeout},
        model_key=model_key,
        resize_max=resize_max,
        image_format=image_format,
        context_length=context_length,
        request_pause_seconds=request_pause_seconds,
        **kwargs,
    )
