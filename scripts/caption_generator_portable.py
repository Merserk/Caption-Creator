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
        
        prompt_templates = {
            'captions': config.get('prompts', 'captions', fallback=""),
            'tags': config.get('prompts', 'tags', fallback=""),
            'json': config.get('prompts', 'json', fallback=""),
            'yaml': config.get('prompts', 'yaml', fallback=""),
        }
        if gen_type not in prompt_templates:
            raise ValueError(f"Unknown generation type: {gen_type}")
        if not prompt_templates[gen_type]:
            raise ValueError(f"Missing prompt for generation type: {gen_type}")

        # Prompt text now comes only from the selected backend config.

        shared_params.update({
            'prompt_templates': prompt_templates
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
