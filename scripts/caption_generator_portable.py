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
from ollama_backend import run_ollama_generation

def get_backend_config_section(desired_model_key):
    if desired_model_key == "Custom (LM Studio)":
        return "lm_studio"
    if desired_model_key == "Custom (Ollama)":
        return "ollama"
    return "koboldcpp"


def build_runtime_config(config, backend_section):
    runtime_config = configparser.RawConfigParser()

    if config.has_section('prompts'):
        runtime_config.add_section('prompts')
        for key, value in config.items('prompts'):
            runtime_config.set('prompts', key, value)

    runtime_config.add_section('generation_params')
    source_section = backend_section if config.has_section(backend_section) else 'generation_params'
    if config.has_section(source_section):
        for key, value in config.items(source_section):
            runtime_config.set('generation_params', key, value)

    return runtime_config


def main():
    try:
        if len(sys.argv) < 14:
            raise ValueError("Insufficient arguments.")
        
        input_dir, output_dir, config_path, koboldcpp_exe, models_dir, desired_model_key, \
        low_vram_str, gen_type, trigger_words, single_paragraph_str, max_words_str, \
        prompt_enrichment, _mode = sys.argv[1:14]
        lm_studio_model_key = sys.argv[14] if len(sys.argv) > 14 else ""
        ollama_model_key = sys.argv[15] if len(sys.argv) > 15 else ""
        custom_prompt = sys.argv[16] if len(sys.argv) > 16 else ""

        shared_params = {
            "input_dir": input_dir, 
            "output_dir": output_dir, 
            "gen_type": gen_type, 
            "max_words": int(max_words_str), 
            "trigger_words": trigger_words, 
            "single_paragraph": single_paragraph_str.lower() == 'true', 
            "prompt_enrichment": prompt_enrichment
        }
        
        config = configparser.RawConfigParser()
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")
        config.read(config_path)
        config = build_runtime_config(config, get_backend_config_section(desired_model_key))
        
        prompt_templates = {
            'captions': config.get('prompts', 'captions', fallback=""),
            'tags': config.get('prompts', 'tags', fallback=""),
            'json': config.get('prompts', 'json', fallback=""),
            'yaml': config.get('prompts', 'yaml', fallback=""),
            'illustrious': config.get('prompts', 'illustrious', fallback=""),
            'custom': config.get('prompts', 'custom', fallback=""),
        }
        if gen_type == 'custom':
            prompt_templates['custom'] = custom_prompt.strip() or prompt_templates['custom'].strip()
        if gen_type not in prompt_templates:
            raise ValueError(f"Unknown generation type: {gen_type}")
        if not prompt_templates[gen_type]:
            if gen_type == 'custom':
                raise ValueError("Missing Custom prompt. Enter a Custom Prompt before starting generation.")
            raise ValueError(f"Missing prompt for generation type: {gen_type}")

        # Prompt text now comes only from the selected backend config.

        shared_params.update({
            'prompt_templates': prompt_templates
        })
        
        # Routing to specialized backends
        if desired_model_key == "Custom (LM Studio)":
            run_lm_studio_generation(config, selected_model_key=lm_studio_model_key, **shared_params)
        elif desired_model_key == "Custom (Ollama)":
            run_ollama_generation(config, selected_model_key=ollama_model_key, **shared_params)
        else:
            run_koboldcpp_generation(config, koboldcpp_exe, models_dir, desired_model_key, low_vram_str.lower() == 'true', **shared_params)
        
        send_json_message("status", "Task complete!")

    except Exception as e:
        send_json_message("error", f"{str(e)}\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    main()
