import base64
import io
import json
import os

from PIL import Image, ImageOps

IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp')


def list_image_files(input_dir):
    return sorted(
        [f for f in os.listdir(input_dir) if f.lower().endswith(IMAGE_EXTENSIONS)],
        key=lambda x: int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else -1,
    )


def parse_generation_params(config):
    gen_params = {}
    if not config.has_section('generation_params'):
        return gen_params

    for key, value in config['generation_params'].items():
        low = str(value).strip().lower()
        if low in ('true', 'false'):
            gen_params[key] = low == 'true'
            continue
        try:
            gen_params[key] = float(value) if '.' in value else int(value)
        except Exception:
            gen_params[key] = value
    return gen_params


def _choose_image_output_format(image_path, image_format, img):
    requested = (image_format or 'jpeg').strip().lower()
    ext = os.path.splitext(image_path)[1].lower()

    if requested in ('jpg', 'jpeg'):
        return 'JPEG', 'image/jpeg'
    if requested == 'png':
        return 'PNG', 'image/png'
    if requested == 'auto':
        if ext == '.png' or img.mode in ('RGBA', 'LA', 'P'):
            return 'PNG', 'image/png'
        return 'JPEG', 'image/jpeg'
    return 'JPEG', 'image/jpeg'


def encode_image(image_path, resize_max=1536, image_format='jpeg', return_mime=False):
    try:
        with Image.open(image_path) as img:
            img = ImageOps.exif_transpose(img)
            resize_max = int(resize_max or 1536)
            if max(img.width, img.height) > resize_max:
                img.thumbnail((resize_max, resize_max), Image.Resampling.LANCZOS)

            output_format, mime_type = _choose_image_output_format(image_path, image_format, img)
            buffer = io.BytesIO()

            if output_format == 'PNG':
                if img.mode not in ('RGB', 'RGBA', 'P', 'L'):
                    img = img.convert('RGBA')
                img.save(buffer, format='PNG', optimize=True)
            else:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(buffer, format='JPEG', quality=95, optimize=True)

        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')
        if return_mime:
            return encoded, mime_type
        return encoded
    except Exception as e:
        raise RuntimeError(f'Failed to process image {image_path}: {e}')


def _safe_int(value, fallback):
    try:
        return int(value)
    except Exception:
        return fallback


def _apply_max_words(text, max_words):
    return (text or '').replace('{max_words}', str(max(1, _safe_int(max_words, 30))))


def build_user_prompt(gen_type, prompt_template, max_words, trigger_words='', prompt_enrichment=''):
    prompt = _apply_max_words(prompt_template, max_words).strip()
    enrichment = _apply_max_words(prompt_enrichment, max_words).strip()
    if enrichment:
        prompt = f'{prompt} {enrichment}'.strip()
    return prompt


def clean_structured_output(raw_text):
    text = (raw_text or '').strip()
    if text.startswith('```'):
        lines = text.splitlines()
        if lines and lines[0].strip().startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith('```'):
            lines = lines[:-1]
        text = '\n'.join(lines).strip()
    return text


def clean_caption_output(raw_text, max_words, single_paragraph=True, trigger_words=''):
    text = (raw_text or '').strip()
    trigger = (trigger_words or '').strip()
    if trigger:
        return f'{trigger}. {text}'.strip()
    return text


def format_tags(raw_text_from_ai, max_tags=None, trigger_words=''):
    text = (raw_text_from_ai or '').strip()
    trigger = (trigger_words or '').strip()
    if trigger:
        return f'{trigger}, {text}'.strip().rstrip(',')
    return text


def format_generation_output(gen_type, raw_text, max_words, single_paragraph=True, trigger_words=''):
    if gen_type == 'tags':
        return format_tags(raw_text, max_tags=min(int(max_words), 200), trigger_words=trigger_words)
    if gen_type in ('json', 'yaml'):
        return clean_structured_output(raw_text)
    return clean_caption_output(raw_text, max_words, single_paragraph, trigger_words)


def get_output_extension(gen_type):
    return {
        'json': '.json',
        'yaml': '.yaml',
    }.get(gen_type, '.txt')


def caption_needs_retry(clean_text, max_words):
    return False, ''


def tags_need_retry(tag_line, max_tags):
    return False, ''


def send_json_message(msg_type, message_or_data):
    payload = {'type': msg_type}
    if msg_type in ['status', 'error']:
        payload['message'] = message_or_data
    else:
        payload['data'] = message_or_data
    print(json.dumps(payload), flush=True)
