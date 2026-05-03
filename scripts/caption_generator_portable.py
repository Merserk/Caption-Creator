import os
import sys
import configparser
import traceback

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from utils import send_json_message
from lm_studio_backend import run_lm_studio_generation
from koboldcpp_backend import run_koboldcpp_generation

def main():
    try:
        if len(sys.argv) < 14:
            raise ValueError("Insufficient arguments.")
        
        input_dir, output_dir, config_path, koboldcpp_exe, models_dir, desired_model_key, \
        low_vram_str, gen_type, trigger_words, single_paragraph_str, max_words_str, \
        prompt_enrichment, _mode = sys.argv[1:14]

        shared_params = {
            "input_dir": input_dir, 
            "output_dir": output_dir, 
            "gen_type": gen_type, 
            "max_words": int(max_words_str), 
            "trigger_words": trigger_words, 
            "single_paragraph": single_paragraph_str.lower() == 'true', 
            "prompt_enrichment": prompt_enrichment
        }
        
        config = configparser.ConfigParser()
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")
        config.read(config_path)
        
        prompt_captions = config.get('prompts', 'captions', fallback="")
        prompt_tags = config.get('prompts', 'tags', fallback="")

        # Optional global quality instructions
        quality_caption = ""
        quality_tags = ""
        quality_path = os.path.join(os.path.dirname(config_path), "quality-prompt-instruction.ini")
        if os.path.exists(quality_path):
            qcfg = configparser.ConfigParser()
            qcfg.read(quality_path)
            quality_caption = qcfg.get('quality', 'caption_instruction', fallback="").strip()
            quality_tags = qcfg.get('quality', 'tags_instruction', fallback="").strip()
            if not quality_caption and not quality_tags:
                # Backward compatibility
                quality_caption = qcfg.get('quality', 'instruction', fallback="").strip()
                quality_tags = quality_caption

        if quality_caption:
            quality_caption = quality_caption.replace("{max_words}", str(shared_params["max_words"]))
            prompt_captions = f"{prompt_captions} {quality_caption}".strip()

        if quality_tags:
            quality_tags = quality_tags.replace("{max_words}", str(shared_params["max_words"]))
            prompt_tags = f"{prompt_tags} {quality_tags}".strip()

        shared_params.update({
            'prompt_captions': prompt_captions, 
            'prompt_tags': prompt_tags
        })
        
        # Routing to specialized backends
        if desired_model_key == "Custom (LM Studio)":
            run_lm_studio_generation(config, **shared_params)
        else:
            run_koboldcpp_generation(config, koboldcpp_exe, models_dir, desired_model_key, low_vram_str.lower() == 'true', **shared_params)
        
        send_json_message("status", "Task complete!")

    except Exception as e:
        send_json_message("error", f"{str(e)}\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
