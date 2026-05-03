import os
import base64
import json
import io
import re
import math
from PIL import Image, ImageOps

IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp')


def list_image_files(input_dir):
    """Returns image filenames in the app's stable numeric order."""
    return sorted(
        [f for f in os.listdir(input_dir) if f.lower().endswith(IMAGE_EXTENSIONS)],
        key=lambda x: int(os.path.splitext(x)[0]) if os.path.splitext(x)[0].isdigit() else -1
    )


def parse_generation_params(config):
    """Reads numeric generation params from an INI section without changing legacy parsing."""
    gen_params = {}
    if not config.has_section('generation_params'):
        return gen_params

    for key, value in config['generation_params'].items():
        try:
            gen_params[key] = float(value) if '.' in value else int(value)
        except Exception:
            gen_params[key] = value
    return gen_params


def encode_image(image_path, resize_max=1536):
    """Encodes an image to base64, with optional resizing for stability."""
    try:
        with Image.open(image_path) as img:
            img = ImageOps.exif_transpose(img)
            if max(img.width, img.height) > resize_max:
                img.thumbnail((resize_max, resize_max), Image.Resampling.LANCZOS)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=100)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        raise RuntimeError(f"Failed to process image {image_path}: {e}")

ARTIFACT_PATTERNS = [
    r'</?image>', r'</?caption>', r'</?output>', r'</?tag>',
    r'</?s>', r'</?\|scene\|>', r'```', r'<\|', r'\|>'
]

def _safe_int(value, fallback):
    try:
        return int(value)
    except Exception:
        return fallback

def sanitize_artifacts(text):
    """Removes common chat/template artifacts from model output."""
    clean_text = text or ""
    for pattern in ARTIFACT_PATTERNS:
        clean_text = re.sub(pattern, "", clean_text, flags=re.IGNORECASE)
    clean_text = re.sub(r"^\s*(caption|description|output|tags|keywords)\s*[:\-]\s*", "", clean_text, flags=re.IGNORECASE)
    return clean_text.strip().strip('"\'')

def _normalize_prompt_limits(prompt, max_items, gen_type):
    prompt = (prompt or "").replace("{max_words}", str(max_items))
    if gen_type == "captions":
        prompt = re.sub(r"up to \d+ words", f"up to {max_items} words", prompt, flags=re.IGNORECASE)
        prompt = re.sub(r"max \d+ words", f"max {max_items} words", prompt, flags=re.IGNORECASE)
    else:
        prompt = re.sub(
            r"aim\s+\d+\s*(?:-|\u2013)\s*\d+\s+tags",
            f"use up to {min(max_items, 200)} tags",
            prompt,
            flags=re.IGNORECASE
        )
        prompt = re.sub(r"exactly \d+ tags or fewer", f"exactly {min(max_items, 200)} tags or fewer", prompt, flags=re.IGNORECASE)
    return prompt

def build_user_prompt(gen_type, prompt_template, max_words, trigger_words="", prompt_enrichment=""):
    """Builds one stable prompt with backend-owned hard limits."""
    max_items = max(1, _safe_int(max_words, 30))
    trigger = (trigger_words or "").strip()
    prompt_body = _normalize_prompt_limits(prompt_template, max_items, gen_type)
    prefix_parts = []

    if gen_type == "captions":
        if max_items <= 60:
            detail_instruction = "Keep it concise and mention only the most important visible details."
        elif max_items <= 150:
            detail_instruction = "Include the important visible subjects, actions, setting, colors, and mood."
        else:
            detail_instruction = "Write a detailed visual description covering subjects, actions, setting, colors, composition, lighting, and mood."
        prefix_parts.append(
            f"Output contract: write one plain caption in English, at most {max_items} words, ending with a complete sentence. "
            "No labels, quotes, markdown, XML/HTML tags, or multiple alternatives. "
            f"{detail_instruction}"
        )
        if trigger:
            prefix_parts.append(f'The caption must include "{trigger}" once, naturally.')
    else:
        max_tags = min(max_items, 200)
        if max_tags < 40:
            quantity_instruction = f"Use up to {max_tags} tags; do not aim for 40-80 tags when the UI limit is smaller."
        elif max_tags < 80:
            quantity_instruction = f"Use up to {max_tags} useful tags."
        else:
            quantity_instruction = f"Prefer 40-80 useful tags, but never exceed {max_tags} tags."
        prefix_parts.append(
            "Output contract: write exactly one comma-separated tag line. "
            f"{quantity_instruction} Use short noun or adjective phrases, not sentences. "
            "No labels, quotes, markdown, XML/HTML tags, numbering, or extra text."
        )
        if trigger:
            prefix_parts.append(f'The first tag must be "{trigger}".')

    if prompt_body:
        prefix_parts.append(prompt_body)
    enrichment = (prompt_enrichment or "").strip()
    if enrichment:
        prefix_parts.append(enrichment)
    return " ".join(prefix_parts)

def calculate_output_tokens(gen_type, max_words, configured_max_tokens):
    """Converts the UI limit into a generation budget, using config as a safety cap."""
    max_items = max(1, _safe_int(max_words, 30))
    configured = max(48, _safe_int(configured_max_tokens, 900))
    if gen_type == "tags":
        max_tags = min(max_items, 200)
        target = max(64, math.ceil(max_tags * 4.5) + 32)
    else:
        target = max(64, math.ceil(max_items * 2.2) + 48)
    return min(configured, target)

def _truncate_words(text, max_words):
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).strip()

def _finish_sentence(text):
    text = text.strip()
    if not text:
        return text
    sentence_ends = [m.end() for m in re.finditer(r"[.!?](?:\s|$)", text)]
    if sentence_ends and sentence_ends[-1] >= max(12, int(len(text) * 0.45)):
        text = text[:sentence_ends[-1]].strip()
    elif not sentence_ends:
        clause_ends = [m.start() for m in re.finditer(r"[,;:](?:\s|$)", text)]
        if clause_ends and clause_ends[-1] >= max(12, int(len(text) * 0.45)):
            text = text[:clause_ends[-1]].strip()
    text = re.sub(r"[,;:\-\u2013\s]+$", "", text).strip()
    if text and text[-1] not in ".!?":
        text += "."
    return text

def clean_caption_output(raw_text, max_words, single_paragraph=True, trigger_words=""):
    """Normalizes captions and enforces the UI word limit after generation."""
    max_count = max(1, _safe_int(max_words, 30))
    trigger = (trigger_words or "").strip()
    text = sanitize_artifacts(raw_text)
    text = re.sub(r"\s+", " ", text).strip() if single_paragraph else text.strip()

    if trigger:
        pattern = re.compile(re.escape(trigger), re.IGNORECASE)
        text = pattern.sub("", text)
        text = re.sub(r"\s{2,}", " ", text).strip().lstrip(".,;:!? ")
        text = f"{trigger}. {text}".strip()

    text = _truncate_words(text, max_count)
    text = _finish_sentence(text)
    return text

def format_tags(raw_text_from_ai, max_tags=None, trigger_words=""):
    """Cleans raw model output into one comma-separated tag line."""
    max_count = max(1, _safe_int(max_tags, 200)) if max_tags is not None else None
    trigger = (trigger_words or "").strip()
    text = sanitize_artifacts(raw_text_from_ai)
    text = text.replace("_", " ")
    text = re.sub(r"[\r\n;|]+", ",", text)
    text = re.sub(r"\s+", " ", text).strip(" {}")

    parts = re.split(r",", text)
    if len(parts) == 1:
        parts = re.split(r"[.!?]", text)

    tags = []
    seen = set()
    for part in parts:
        tag = re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", part).strip().strip('"\'`.,:; ')
        tag = re.sub(r"\s+", " ", tag)
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)

    if trigger:
        tags = [tag for tag in tags if tag.lower() != trigger.lower()]
        tags.insert(0, trigger)

    if max_count is not None:
        tags = tags[:max_count]
    return ", ".join(tags)

def send_json_message(msg_type, message_or_data):
    """Sends a structured JSON message to stdout for the Electron app to hear."""
    payload = {"type": msg_type}
    if msg_type in ["status", "error"]:
        payload["message"] = message_or_data
    else:
        payload["data"] = message_or_data
    print(json.dumps(payload), flush=True)
