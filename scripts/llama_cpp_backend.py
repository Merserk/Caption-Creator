import os
import json
import subprocess
import sys
import time

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import (
    build_progress_payload,
    build_user_prompt,
    encode_image,
    format_generation_output,
    list_image_files,
    parse_generation_params,
    send_json_message,
    write_generation_output,
)
from model_catalog import get_model_bundle

LLAMA_HOST = "http://127.0.0.1:5001"
LLAMA_CHAT_ENDPOINT = f"{LLAMA_HOST}/v1/chat/completions"
LOCAL_MODEL_ALIAS = "local-model"


def _text_from_value(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        parts = [_text_from_value(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        parts = []
        for key in ("content", "text", "message", "output_text", "value"):
            if key in value:
                part = _text_from_value(value.get(key))
                if part:
                    parts.append(part)
        return "\n".join(parts).strip()
    return ""


def _extract_chat_text(payload):
    choices = payload.get("choices", []) if isinstance(payload, dict) else []
    if not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if isinstance(message, dict):
        text = _text_from_value(message.get("content"))
        if text:
            return text

    return _text_from_value(first_choice.get("text"))


def _response_error_text(response):
    message = response.text.strip()
    try:
        payload = response.json()
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message") or message
        elif isinstance(error, str):
            message = error
        elif payload.get("message"):
            message = payload.get("message")
    except Exception:
        pass
    return message or f"HTTP {response.status_code}"


def _server_endpoint_ready(endpoint):
    try:
        response = requests.get(f"{LLAMA_HOST}{endpoint}", timeout=1)
        return response.status_code == 200
    except Exception:
        return False


def _wait_for_server(proc, timeout_seconds):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"llama.cpp server exited early with code {proc.returncode}.")

        if _server_endpoint_ready("/health") or _server_endpoint_ready("/v1/models"):
            return

        time.sleep(1)

    raise RuntimeError("llama.cpp server failed to start within the timeout period.")


def _build_stop_sequences(gen_type):
    stop_sequences = ["</image>", "<image>", "</caption>", "<caption>"]
    if gen_type not in ("json", "yaml"):
        stop_sequences.append("```")
    return stop_sequences


def _build_chat_payload(prompt, data_url, gen_params, gen_type, disable_thinking=False):
    max_tokens = int(gen_params.get(
        "max_tokens",
        gen_params.get("max_completion_tokens", gen_params.get("max_length", 4096)),
    ))

    payload = {
        "model": LOCAL_MODEL_ALIAS,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": gen_params.get("temperature", 0.2),
        "top_p": gen_params.get("top_p", 0.95),
        "top_k": gen_params.get("top_k", 40),
        "repeat_penalty": gen_params.get("rep_pen", gen_params.get("repeat_penalty", 1.1)),
        "presence_penalty": gen_params.get("presence_penalty", gen_params.get("frequency_penalty", 0.0)),
        "max_tokens": max_tokens,
        "max_completion_tokens": max_tokens,
        "stop": _build_stop_sequences(gen_type),
        "stream": False,
    }

    if disable_thinking:
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    return payload


def _generate_once(session, payload, timeout):
    response = session.post(LLAMA_CHAT_ENDPOINT, json=payload, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"llama.cpp API error {response.status_code}: {_response_error_text(response)}")

    try:
        response_payload = response.json()
    except Exception as e:
        raise RuntimeError(f"llama.cpp returned invalid JSON: {e}")

    text = _extract_chat_text(response_payload)
    if not text:
        keys = list(response_payload.keys()) if isinstance(response_payload, dict) else type(response_payload).__name__
        raise RuntimeError(f"llama.cpp returned no text content. Response keys={keys}")
    return text


def process_images_loop_llama(gen_params, resize_max=1280, image_format="auto", request_pause_seconds=0.0, disable_thinking=False, **kwargs):
    image_files = list_image_files(kwargs["input_dir"])

    if not image_files:
        raise ValueError("No images found in the input folder.")

    total_images = len(image_files)
    start_time = time.time()
    timeout = int(gen_params.get("timeout", 600))
    request_pause_seconds = float(request_pause_seconds or 0.0)

    session = requests.Session()

    for index, image_file in enumerate(image_files, start=1):
        input_image_path = os.path.join(kwargs["input_dir"], image_file)
        send_json_message("status", f"Processing image {index} of {total_images}...")

        gen_type = kwargs["gen_type"]
        prompt_template = kwargs["prompt_templates"][gen_type]
        prompt = build_user_prompt(
            gen_type,
            prompt_template,
            kwargs["max_words"],
            kwargs.get("trigger_words", ""),
            kwargs.get("prompt_enrichment", ""),
        )

        base64_image, mime_type = encode_image(
            input_image_path,
            resize_max=resize_max,
            image_format=image_format,
            return_mime=True,
        )
        data_url = f"data:{mime_type};base64,{base64_image}"
        payload = _build_chat_payload(prompt, data_url, gen_params, gen_type, disable_thinking=disable_thinking)

        raw_output = ""
        max_retries = 3
        retry_delay = 3

        for attempt in range(max_retries):
            try:
                raw_output = _generate_once(session, payload, timeout)
                break
            except Exception as e:
                if attempt >= max_retries - 1:
                    raise RuntimeError(f"Failed to generate for {image_file} after {max_retries} retries: {e}")
                send_json_message("status", f"Retry {attempt + 1}/{max_retries} due to: {e}")
                time.sleep(retry_delay)
                retry_delay *= 2

        final_output = format_generation_output(
            gen_type,
            raw_output,
            kwargs["max_words"],
            kwargs["single_paragraph"],
            kwargs.get("trigger_words", ""),
        )

        write_generation_output(kwargs["output_dir"], image_file, gen_type, final_output)
        send_json_message("progress", build_progress_payload(index, total_images, start_time))
        send_json_message("image-complete", {"index": index})

        if request_pause_seconds > 0 and index < total_images:
            time.sleep(request_pause_seconds)


def _server_creation_flags():
    if sys.platform == "win32":
        return 0x08000000
    return 0


def run_llama_cpp_generation(config, llama_server_exe, models_dir, desired_model_key, low_vram, disable_thinking=False, **kwargs):
    model_bundle = get_model_bundle(desired_model_key)
    if not model_bundle:
        raise RuntimeError(f"Unknown model key: {desired_model_key}")

    if not os.path.exists(llama_server_exe):
        raise RuntimeError(f"llama.cpp server executable not found at {llama_server_exe}.")

    model_path = os.path.join(models_dir, model_bundle.model.file)
    if not os.path.exists(model_path):
        raise RuntimeError(f"Model file for '{desired_model_key}' not found at {model_path}.")

    mmproj_file = os.path.join(models_dir, model_bundle.vision.file)
    if not os.path.exists(mmproj_file):
        raise RuntimeError(f"Vision projector not found at {mmproj_file}.")

    gen_params = parse_generation_params(config)
    context_size = int(gen_params.get("context_size", gen_params.get("contextsize", 32768)))
    gpu_layers = str(gen_params.get("gpu_layers", "auto"))
    flash_attn = "on" if low_vram else "auto"
    resize_max = int(gen_params.get("resize_max", 1280))
    image_format = str(gen_params.get("image_format", "auto"))
    request_pause_seconds = float(gen_params.get("request_pause_seconds", 0.25))
    startup_timeout = int(gen_params.get("startup_timeout", 180))

    llama_command = [
        llama_server_exe,
        "--model", model_path,
        "--mmproj", mmproj_file,
        "--alias", LOCAL_MODEL_ALIAS,
        "--host", "127.0.0.1",
        "--port", "5001",
        "--ctx-size", str(context_size),
        "--jinja",
        "--no-ui",
        "--gpu-layers", gpu_layers,
        "--flash-attn", flash_attn,
    ]

    if low_vram:
        llama_command.append("--no-mmproj-offload")

    if disable_thinking:
        llama_command.extend([
            "--reasoning", "off",
            "--reasoning-budget", "0",
            "--chat-template-kwargs", json.dumps({"enable_thinking": False}, separators=(",", ":")),
        ])

    send_json_message("status", "Starting AI Engine...")
    proc = subprocess.Popen(
        llama_command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=_server_creation_flags(),
        cwd=os.path.dirname(llama_server_exe),
    )

    try:
        _wait_for_server(proc, startup_timeout)
        process_images_loop_llama(
            gen_params,
            resize_max=resize_max,
            image_format=image_format,
            request_pause_seconds=request_pause_seconds,
            disable_thinking=disable_thinking,
            **kwargs,
        )
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
