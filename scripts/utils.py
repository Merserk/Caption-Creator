import os
import base64
import json
import io
import re
from PIL import Image, ImageOps

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

def format_tags(raw_text_from_ai):
    """Cleans the raw output from the AI to get a perfect, single line of tags."""
    lines = raw_text_from_ai.strip().split('\n')
    first_meaningful_line = ""
    for line in lines:
        if line.strip():
            first_meaningful_line = line.strip()
            break
    clean_line = first_meaningful_line.replace('_', ' ')
    clean_line = clean_line.strip(' {}')
    return clean_line

def send_json_message(msg_type, message_or_data):
    """Sends a structured JSON message to stdout for the Electron app to hear."""
    payload = {"type": msg_type}
    if msg_type in ["status", "error"]:
        payload["message"] = message_or_data
    else:
        payload["data"] = message_or_data
    print(json.dumps(payload), flush=True)
