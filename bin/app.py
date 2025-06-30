import gradio as gr
import os
import subprocess
import time
import shutil
import sys
import configparser
import requests
import atexit
import zipfile
import re
import threading
import webview

# Import ctypes to interact with the Windows API for hiding the console
if sys.platform == "win32":
    import ctypes

# --- Global State and Configuration ---
KOBOLDCPP_PROCESS = None
CURRENTLY_LOADED_MODEL = None
STOP_REQUESTED = False  # Flag to signal stop request

# app.py is now in the 'bin' directory, so we need to go one level up for the project root.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN_DIR = os.path.join(PROJECT_ROOT, "bin")
INPUT_DIR = os.path.join(PROJECT_ROOT, "input")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
CONFIG_PATH = os.path.join(PROJECT_ROOT, "config.ini")
KOBOLDCPP_EXE = os.path.join(BIN_DIR, "koboldcpp.exe")
PYTHON_EXE = os.path.join(BIN_DIR, "python-3.13.5-embed-amd64", "python.exe")
CAPTION_SCRIPT = os.path.join(BIN_DIR, "caption_generator_portable.py")
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
MODELS = {
    "5GB VRAM (Q2_K)": "llama-joycaption-beta-one-hf-llava.q2_k.gguf",
    "8GB VRAM (Q4_K)": "llama-joycaption-beta-one-hf-llava-q4_k.gguf",
    "10GB VRAM (Q8_0)": "llama-joycaption-beta-one-hf-llava-q8_0.gguf",
    "20GB VRAM (F16)": "llama-joycaption-beta-one-hf-llava-f16.gguf"
}
ZIP_FILE_PATH = os.path.join(OUTPUT_DIR, "Dataset_Caption_Creator.zip")
atexit.register(lambda: os.remove(ZIP_FILE_PATH) if os.path.exists(ZIP_FILE_PATH) else None)

# --- Helper Functions ---
def hide_console_window():
    """Hides the console window on Windows systems. Called after the GUI is confirmed to be ready."""
    if sys.platform == "win32":
        try:
            # Get a handle to the console window and hide it.
            console_window = ctypes.windll.kernel32.GetConsoleWindow()
            if console_window != 0:
                ctypes.windll.user32.ShowWindow(console_window, 0) # 0 = SW_HIDE
        except Exception as e:
            # If this fails, it's not a critical error. The console will just stay visible.
            print(f"[WARNING] Could not hide the console window: {e}")

def check_for_default_config():
    if not os.path.exists(CONFIG_PATH):
        print("[INFO] config.ini not found. Creating a default configuration file.")
        config = configparser.ConfigParser()
        config['prompts'] = { 'captions': 'Create extreme precise caption about what you see on image. Make it up to 300 words. Caption must include only output text.','tags': 'Act as an expert prompt engineer for AI image generators like Illustrious. Your task is to create a single, comprehensive, one-line prompt designed to generate a highly detailed image of a specific character. Crucially, you must ONLY use the comma-separated keywords from the image. Ignore any text in parentheses, brackets, or any other descriptive notes that are not part of the core keyword list. Do not create any "Note:". Do not use underscore. Do not create any emoji.' }
        config['generation_params'] = { 'temperature': '0.2', 'top_p': '0.95', 'top_k': '40', 'repeat_penalty': '1.1', 'frequency_penalty': '0.8', 'presence_penalty': '0', 'max_tokens': '600' }
        with open(CONFIG_PATH, 'w') as configfile: config.write(configfile)

def get_model_choices_and_default():
    print("\n--- Checking for available models ---")
    choices, default_value = [], None
    for model_key, filename in MODELS.items():
        full_path = os.path.join(MODELS_DIR, filename)
        status = "(Available)" if os.path.exists(full_path) else "(Not downloaded)"
        if status == "(Available)" and default_value is None: default_value = model_key
        choices.append((f"{model_key} {status}", model_key))
    if default_value is None and choices: default_value = choices[0][1]
    print(f"Default model set to: {default_value}\n-------------------------------------\n")
    return choices, default_value

def stop_koboldcpp_server():
    global KOBOLDCPP_PROCESS, CURRENTLY_LOADED_MODEL
    print("Attempting to stop KoboldCPP server...")
    if KOBOLDCPP_PROCESS and KOBOLDCPP_PROCESS.poll() is None:
        KOBOLDCPP_PROCESS.kill(); print("KoboldCPP process killed.")
    KOBOLDCPP_PROCESS, CURRENTLY_LOADED_MODEL = None, None
    try:
        if sys.platform == "win32": subprocess.run(["taskkill", "/F", "/IM", "koboldcpp.exe"], check=True, capture_output=True, text=True)
    except (subprocess.CalledProcessError, FileNotFoundError): pass
    print("KoboldCPP server stopped.")

def shutdown_computer():
    """Issues a shutdown command based on the operating system."""
    print("Issuing shutdown command...")
    if sys.platform == "win32":
        # /s for shutdown, /t 20 for a 20-second timer
        subprocess.run(["shutdown", "/s", "/t", "20"], check=True)
    elif sys.platform == "darwin":  # macOS
        subprocess.run(["sudo", "shutdown", "-h", "now"], check=True)
    else:  # Linux
        subprocess.run(["sudo", "shutdown", "-h", "now"], check=True)

def clear_input_folder():
    if os.path.exists(INPUT_DIR):
        for f in os.listdir(INPUT_DIR): os.remove(os.path.join(INPUT_DIR, f))

def clear_output_folder():
    if os.path.exists(OUTPUT_DIR):
        for f in os.listdir(OUTPUT_DIR):
             if not f.lower().endswith('.zip'):
                file_path = os.path.join(OUTPUT_DIR, f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)


def handle_batch_uploads(files):
    if not files: return None, "No files uploaded."
    clear_input_folder()
    filenames = []
    for file_obj in files:
        filename = os.path.basename(file_obj.name)
        shutil.copy(file_obj.name, os.path.join(INPUT_DIR, filename))
        filenames.append(filename)
    
    status_message = f"Successfully uploaded {len(filenames)} files:\n" + "\n".join(filenames)
    return None, status_message

def create_zip_archive():
    files_to_zip = [f for f in os.listdir(OUTPUT_DIR) if not f.lower().endswith('.zip')]
    if not files_to_zip:
        return None, "No files in the output folder to zip."
    if os.path.exists(ZIP_FILE_PATH):
        os.remove(ZIP_FILE_PATH)
    print(f"Creating archive: {ZIP_FILE_PATH}")
    with zipfile.ZipFile(ZIP_FILE_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(OUTPUT_DIR):
            for file in files:
                if not file.lower().endswith('.zip'):
                    file_path = os.path.join(root, file)
                    # Create a relative path for the archive
                    arcname = os.path.relpath(file_path, OUTPUT_DIR)
                    zipf.write(file_path, arcname)
    archive_name = os.path.basename(ZIP_FILE_PATH)
    status_message = f"Archive '{archive_name}' created successfully in the output folder."
    print(status_message)
    return ZIP_FILE_PATH, status_message

def open_output_folder():
    """Opens the output folder in the system's file explorer."""
    if not os.path.isdir(OUTPUT_DIR):
        print(f"Output directory not found: {OUTPUT_DIR}. Cannot open.")
        return

    print(f"Opening output folder: {OUTPUT_DIR}")
    if sys.platform == "win32":
        os.startfile(OUTPUT_DIR)
    elif sys.platform == "darwin":  # macOS
        subprocess.run(["open", OUTPUT_DIR])
    else:  # Assumes Linux/other Unix-like
        try:
            subprocess.run(["xdg-open", OUTPUT_DIR])
        except FileNotFoundError:
            print(f"Could not open folder. Please navigate to it manually: {OUTPUT_DIR}")

def create_kohya_structure(instance_prompt, class_prompt, repeats):
    """Organizes output files into a kohya_ss compatible training structure.
    Returns: (success_bool, message_string, new_base_path)
    """
    print(f"Starting Kohya_SS export. Instance: '{instance_prompt}', Class: '{class_prompt}', Repeats: {repeats}")

    # 1. Define paths
    dataset_folder_name = f"{instance_prompt.replace(' ', '_')}_Dataset"
    dataset_path = os.path.join(OUTPUT_DIR, dataset_folder_name)
    log_path = os.path.join(dataset_path, "log")
    model_path = os.path.join(dataset_path, "model")
    image_subfolder_name = f"{repeats}_{instance_prompt} {class_prompt}"
    final_image_dir = os.path.join(dataset_path, "img", image_subfolder_name)

    # 2. Create directory structure
    print(f"Creating directory structure at: {final_image_dir}")
    os.makedirs(final_image_dir, exist_ok=True)
    os.makedirs(log_path, exist_ok=True)
    os.makedirs(model_path, exist_ok=True)

    # 3. Move files
    files_to_move = [f for f in os.listdir(OUTPUT_DIR) if os.path.isfile(os.path.join(OUTPUT_DIR, f)) and f.lower().endswith(('.png', '.txt'))]

    if not files_to_move:
        msg = f"Export structure created in '{dataset_folder_name}', but no generated files were found to move."
        return True, msg, final_image_dir

    moved_count = 0
    for filename in files_to_move:
        source_path = os.path.join(OUTPUT_DIR, filename)
        destination_path = os.path.join(final_image_dir, filename)
        try:
            shutil.move(source_path, destination_path)
            moved_count += 1
        except Exception as e:
            print(f"[ERROR] Could not move file {filename}: {e}")

    num_pairs = moved_count // 2
    print(f"Moved {num_pairs} image/text pairs to the Kohya_SS directory.")
    msg = f"Successfully exported {num_pairs} image/text pairs to '{dataset_folder_name}'."
    return True, msg, final_image_dir

def request_stop():
    """Sets the global stop flag."""
    global STOP_REQUESTED
    STOP_REQUESTED = True
    print("Stop requested by user.")
    return gr.update(value="Stopping...")

def update_ui_mode(mode):
    single_visible = (mode == "Single Image")
    batch_visible = (mode == "Batch Processing")
    return (
        gr.update(visible=single_visible), # single_upload_column
        gr.update(visible=batch_visible),  # batch_upload_column
        gr.update(visible=single_visible), # single_output_group
        gr.update(visible=batch_visible)   # batch_output_group
    )

def update_captioning_options(gen_type):
    is_captions_mode = (gen_type == "Captions")
    
    if is_captions_mode:
        placeholder = "e.g., The character is Lara Croft from Tomb Raider."
        info = "Added to the start of every generated caption, followed by a space."
    else: # Tags
        placeholder = "e.g., Tomb Raider, 1girl"
        info = "Added to the start of every tag list, followed by a comma."
    
    return [
        gr.update(placeholder=placeholder, info=info),
        gr.update(visible=is_captions_mode)
    ]

# --- RESTORED FUNCTIONS ---
def handle_single_upload(filepath):
    """When a file is uploaded, show the preview and hide the uploader."""
    if filepath is None:
        return (
            None,                 # Clear the preview's value
            None,                 # Clear the state's value
            gr.update(visible=True),  # Keep the file uploader visible but clear it
            gr.update(visible=False), # Hide the image preview
            gr.update(visible=False)  # Hide the 'Change Image' button
        )
    
    return (
        filepath,                 # Update the preview's value
        filepath,                 # Update the state's value
        gr.update(visible=False, value=None), # Hide the file uploader and clear its value
        gr.update(visible=True),  # Show the image preview
        gr.update(visible=True)   # Show the 'Change Image' button
    )

def show_uploader():
    """When 'Change Image' is clicked, show the uploader and hide the preview."""
    return (
        None,                     # Clear the preview's value
        None,                     # Clear the state's value
        gr.update(visible=True, value=None),  # Show the file uploader and clear its value
        gr.update(visible=False), # Hide the image preview
        gr.update(visible=False)  # Hide the 'Change Image' button
    )

def trigger_file_dialog():
    """Triggers the file dialog to open immediately and manages UI state."""
    return (
        None,                     # Clear the preview's value
        None,                     # Clear the state's value
        gr.update(visible=True, value=None),  # Show the file uploader and clear its value
        gr.update(visible=False), # Hide the image preview
        gr.update(visible=False), # Hide the 'Change Image' button
        gr.update(value=None)     # Clear the hidden file input
    )

def handle_hidden_upload(filepath):
    """Handle upload from the hidden file input."""
    if filepath is None:
        return handle_single_upload(None)
    return handle_single_upload(filepath)
# --- END RESTORED FUNCTIONS ---


def create_progress_bar(percentage, width=20):
    """Creates a text-based progress bar string."""
    if percentage >= 100:
        return f"[{'█' * width}]"
    
    filled_width = int(width * percentage / 100)
    
    if filled_width > 0:
        bar = '█' * (filled_width - 1) + '▓'
    else:
        bar = ''
        
    bar = bar.ljust(width, '░')
    return f"[{bar}]"

BLUR_TRANSITION_DURATION = "1.0s" 

def get_blur_style_single_image(blur_amount_px):
    if blur_amount_px <= 0:
        return f"<style>#single_image_preview img {{ filter: none !important; animation: none !important; transition: filter {BLUR_TRANSITION_DURATION} linear; }}</style>"
    return f"<style>#single_image_preview img {{ filter: blur({blur_amount_px}px) !important; animation: none !important; transition: filter {BLUR_TRANSITION_DURATION} linear; }}</style>"

def get_blur_style_gallery(base_blur_amount_px, unblurred_indices=None, disable_clicks=False):
    if unblurred_indices is None:
        unblurred_indices = set()

    pointer_events_gallery_item_general = "pointer-events: none;" if disable_clicks else "pointer-events: auto;"
    
    style_string = "<style>"
    style_string += f"""
        #batch_gallery_output .thumbnail-item {{
            {pointer_events_gallery_item_general}
        }}
        #batch_gallery_output .thumbnail-item img {{ 
            filter: blur({base_blur_amount_px}px); 
            transition: filter {BLUR_TRANSITION_DURATION} linear;
        }}
    """
    
    for idx in unblurred_indices:
        # CSS nth-child is 1-indexed, so we add 1
        style_string += f" #batch_gallery_output .thumbnail-item:nth-child({idx + 1}) img {{ filter: none !important; }}"
        if not disable_clicks:
             style_string += f" #batch_gallery_output .thumbnail-item:nth-child({idx + 1}) {{ pointer-events: auto !important; }}"

    if base_blur_amount_px <= 0 and not disable_clicks:
        style_string += """
            #batch_gallery_output .thumbnail-item img { filter: none !important; }
            #batch_gallery_output .thumbnail-item { pointer-events: auto !important; }
        """
    elif base_blur_amount_px <= 0 and disable_clicks:
         style_string += """
            #batch_gallery_output .thumbnail-item img { filter: none !important; }
            #batch_gallery_output .thumbnail-item { pointer-events: none !important; }
        """
        
    style_string += "</style>"
    return style_string

def run_generation(mode, single_image_path, gen_type, trigger_words, single_paragraph, max_words, desired_model_key, low_vram, keep_model_loaded, shutdown_pc, kohya_export, instance_prompt, class_prompt, repeats):
    # --- [NEW] PRE-FLIGHT VALIDATION for Kohya_ss ---
    if kohya_export:
        error_message = None
        if not instance_prompt or not class_prompt:
            error_message = "ERROR: Please input data to Kohya_ss folder output boxes."
        else:
            try:
                if int(repeats) <= 0:
                    error_message = "ERROR: Repeats for Kohya_ss export must be a positive whole number."
            except (ValueError, TypeError):
                error_message = "ERROR: Repeats for Kohya_ss export must be a valid whole number."
        
        if error_message:
            # If an error is found, create a specific UI state to yield.
            error_outputs = {
                "status": error_message, "batch_gallery": None, "single_image": None, 
                "single_text": None, "batch_text": None, "gallery_state": None, "animation_style": "",
                "start_button": gr.update(visible=True),  # Keep start button visible
                "stop_button": gr.update(visible=False) # Keep stop button hidden
            }
            yield list(error_outputs.values())
            return # IMPORTANT: Exit the function immediately.

    global KOBOLDCPP_PROCESS, CURRENTLY_LOADED_MODEL, STOP_REQUESTED
    STOP_REQUESTED = False
    process = None

    outputs = {
        "status": "Starting generation process...", "batch_gallery": None, "single_image": None, 
        "single_text": None, "batch_text": None, "gallery_state": None, "animation_style": "",
        "start_button": gr.update(visible=False), "stop_button": gr.update(visible=True, value="Stop Generation")
    }
    yield list(outputs.values())

    try:
        initial_blur_single = 12 
        initial_blur_batch = 8    
        mid_blur_api_wait_single = 6 
        min_blur_processing_single = 2 
        final_blur = 0 
        processed_indices_in_batch = set()

        if desired_model_key != CURRENTLY_LOADED_MODEL and CURRENTLY_LOADED_MODEL is not None:
            outputs["status"] = "Model configuration changed. Restarting backend AI engine..."; yield list(outputs.values())
            stop_koboldcpp_server(); time.sleep(2)
        
        clear_output_folder()

        if mode == "Single Image":
            if not single_image_path: 
                outputs["status"] = "ERROR: Please upload an image."; raise ValueError(outputs["status"])
            
            clear_input_folder()
            shutil.copy(single_image_path, os.path.join(INPUT_DIR, os.path.basename(single_image_path)))
            
            outputs["single_image"] = single_image_path 
            outputs["status"] = "Validating inputs and preparing for generation..."
            outputs["animation_style"] = get_blur_style_single_image(initial_blur_single)
            yield list(outputs.values())
        
        elif mode == "Batch Processing":
            input_files_for_batch = sorted([f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))])
            if not input_files_for_batch:
                outputs["status"] = "ERROR: Please upload files for batch processing."; raise ValueError(outputs["status"])
            
            outputs["status"] = "Validating inputs and preparing for generation..."
            input_image_paths_for_gallery = [os.path.join(INPUT_DIR, f) for f in input_files_for_batch]
            outputs["batch_gallery"] = input_image_paths_for_gallery 
            outputs["gallery_state"] = input_image_paths_for_gallery 
            outputs["animation_style"] = get_blur_style_gallery(initial_blur_batch, disable_clicks=True)
            yield list(outputs.values())
        
        if STOP_REQUESTED: raise InterruptedError("Operation stopped by user.")

        if KOBOLDCPP_PROCESS is None or KOBOLDCPP_PROCESS.poll() is not None:
            outputs["status"] = "Starting backend AI engine... Please wait."; 
            if mode == "Single Image": outputs["animation_style"] = get_blur_style_single_image(initial_blur_single)
            elif mode == "Batch Processing": outputs["animation_style"] = get_blur_style_gallery(initial_blur_batch, disable_clicks=True)
            yield list(outputs.values())

            model_file = MODELS.get(desired_model_key); full_model_path = os.path.join(MODELS_DIR, model_file)
            if not os.path.exists(full_model_path):
                outputs["status"] = f"ERROR: Model file not found: {model_file}"; raise ValueError(outputs["status"])
            
            low_vram_flags = "--mmprojcpu --flashattention" if low_vram else ""
            mmproj_file = os.path.join(MODELS_DIR, "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf")
            kobold_command = [KOBOLDCPP_EXE, "--model", full_model_path, "--mmproj", mmproj_file, "--quiet", "--port", "5001", "--host", "127.0.0.1"]
            if low_vram: kobold_command.extend(low_vram_flags.split())
            KOBOLDCPP_PROCESS = subprocess.Popen(kobold_command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            
            api_online = False
            max_api_attempts = 30
            spinner = ["/", "-", "\\", "|"]
            for i in range(max_api_attempts):
                if STOP_REQUESTED: raise InterruptedError("Operation stopped by user.")
                try:
                    if requests.get("http://127.0.0.1:5001/v1/models", timeout=1).status_code == 200:
                        api_online = True; break
                except requests.ConnectionError: time.sleep(1)
                
                spin_char = spinner[i % len(spinner)]
                outputs["status"] = f"Connecting to the AI engine... {spin_char}"
                if mode == "Single Image":
                    current_blur_val = initial_blur_single - ((i + 1) / max_api_attempts) * (initial_blur_single - mid_blur_api_wait_single)
                    outputs["animation_style"] = get_blur_style_single_image(current_blur_val)
                yield list(outputs.values())
            
            if not api_online:
                outputs["status"] = "Error: The backend AI engine failed to start."; raise RuntimeError(outputs["status"])
            CURRENTLY_LOADED_MODEL = desired_model_key

        outputs["status"] = "Connection successful! Starting generation..."
        if mode == "Single Image": outputs["animation_style"] = get_blur_style_single_image(mid_blur_api_wait_single)
        elif mode == "Batch Processing": outputs["animation_style"] = get_blur_style_gallery(initial_blur_batch, processed_indices_in_batch, disable_clicks=True)
        yield list(outputs.values())

        if STOP_REQUESTED: raise InterruptedError("Operation stopped by user.")

        gen_type_arg = "captions" if gen_type == "Captions" else "tags"
        single_paragraph_arg = "true" if single_paragraph else "false"
        caption_command = [PYTHON_EXE, CAPTION_SCRIPT, gen_type_arg, trigger_words or "", single_paragraph_arg, str(int(max_words))]
        
        processing_start_time = time.time()
        process = subprocess.Popen(caption_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8')
        
        if mode == "Single Image":
            outputs["animation_style"] = get_blur_style_single_image(min_blur_processing_single) 
            outputs["status"] = "AI is analyzing the image and generating text..."
            yield list(outputs.values())

        for output_line in process.stdout:
            if STOP_REQUESTED: raise InterruptedError("Operation stopped by user.")
            clean_output = output_line.strip() 
            
            if "BATCH_PROGRESS::" in clean_output and mode == "Batch Processing":
                try:
                    data_part = clean_output.split("::")[1]
                    params = dict(item.split("=") for item in data_part.split("|"))
                    current_index_from_script = int(params['current_index'])
                    percentage = ((current_index_from_script) / int(params['total_images'])) * 100
                    status_msg = (f"{create_progress_bar(percentage)} Processing [{current_index_from_script}/{params['total_images']}] ({percentage:.0f}%)\n"
                                  f"Time per image: {float(params['avg_time']):.1f}s | Elapsed: {int(float(params['elapsed'])//60)}m {int(float(params['elapsed'])%60)}s | ETA: {int(float(params['eta'])//60)}m {int(float(params['eta'])%60)}s\n"
                                  f"Current image: {params['current_file']}")
                    processed_indices_in_batch.add(current_index_from_script - 1) 
                    outputs["status"] = status_msg
                    outputs["animation_style"] = get_blur_style_gallery(initial_blur_batch, processed_indices_in_batch, disable_clicks=True)
                    yield list(outputs.values())
                except Exception as e:
                    print(f"Error parsing BATCH_PROGRESS: {e} - Line: '{clean_output}'")
            else:
                print(f"Script output: {clean_output}")

        process.wait() 
        duration = time.time() - processing_start_time
        
        final_status_message = ""
        task_complete = False
        if mode == "Single Image":
            with open(os.path.join(OUTPUT_DIR, "1.txt"), "r", encoding="utf-8") as f: generated_text = f.read()
            final_status_message = f"Task complete in {duration:.1f} seconds!"
            outputs.update({"status": final_status_message, "single_image": os.path.join(OUTPUT_DIR, "1.png"), "single_text": generated_text, "animation_style": get_blur_style_single_image(final_blur)})
            task_complete = True
        else: # Batch Mode
            image_filenames = [f for f in os.listdir(OUTPUT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            sorted_filenames = sorted(image_filenames, key=lambda f: int(os.path.splitext(f)[0]))
            output_files = [os.path.join(OUTPUT_DIR, f) for f in sorted_filenames]
            
            final_status_message = f"Task complete! Processed {len(output_files)} images in {duration:.1f} seconds."
            outputs.update({"status": final_status_message, "batch_gallery": output_files, "gallery_state": output_files, "animation_style": get_blur_style_gallery(final_blur, disable_clicks=False)})
            task_complete = True
            
        if task_complete:
            # First, handle the Kohya export if requested.
            if kohya_export:
                outputs["status"] = f"{final_status_message}\nExporting to Kohya_SS structure..."
                yield list(outputs.values())
                time.sleep(1)
                success, export_status, final_image_dir = create_kohya_structure(instance_prompt, class_prompt, int(repeats))
                final_status_message = f"{final_status_message}\n{export_status}"
                
                # Path Correction Logic
                if success:
                    if mode == "Batch Processing" and 'sorted_filenames' in locals():
                        new_output_paths = [os.path.join(final_image_dir, f) for f in sorted_filenames]
                        outputs["batch_gallery"] = new_output_paths
                        outputs["gallery_state"] = new_output_paths
                    elif mode == "Single Image":
                        new_single_image_path = os.path.join(final_image_dir, "1.png")
                        outputs["single_image"] = new_single_image_path

            # Then, handle shutdown or resource cleanup.
            if shutdown_pc:
                outputs["status"] = f"{final_status_message}\nSHUTTING DOWN PC IN 20 SECONDS. Save any other work!"
                yield list(outputs.values())
                threading.Timer(20.0, shutdown_computer).start()
            elif not keep_model_loaded:
                outputs["status"] = f"{final_status_message}\nCleaning up resources to free VRAM..."
                yield list(outputs.values())
                time.sleep(1)
                stop_koboldcpp_server()
                outputs["status"] = f"{final_status_message}\nReady for the next task."
            else:
                outputs["status"] = f"{final_status_message}\nModel kept in memory. Ready for the next task."
                print("Model kept loaded as per user request.")

    except InterruptedError:
        print("InterruptedError caught. Cleaning up...")
        if process and process.poll() is None: process.kill()
        stop_koboldcpp_server()
        outputs["status"] = "Operation stopped by user."
        outputs["animation_style"] = get_blur_style_gallery(final_blur) if mode == "Batch Processing" else get_blur_style_single_image(final_blur)

    except (Exception, RuntimeError, ValueError) as e:
        print(f"An error occurred in run_generation: {e}")
        if process and process.poll() is None: process.kill()
        stop_koboldcpp_server()
        outputs["status"] = str(e)
        outputs["animation_style"] = get_blur_style_gallery(final_blur) if mode == "Batch Processing" else get_blur_style_single_image(final_blur)

    finally:
        outputs["start_button"] = gr.update(visible=True)
        outputs["stop_button"] = gr.update(visible=False)
        yield list(outputs.values())

def show_batch_text(filepaths, evt: gr.SelectData):
    """ More robustly finds the text file associated with a gallery image. """
    if not filepaths or evt.index is None or evt.index >= len(filepaths):
        return "Could not determine file. Please run generation again."
    
    selected_image_path = filepaths[evt.index]
    
    # Derive text file path from the image path, regardless of its location
    base_name, _ = os.path.splitext(os.path.basename(selected_image_path))
    text_filename = f"{base_name}.txt"
    # The text file is in the same directory as the image file
    text_path = os.path.join(os.path.dirname(selected_image_path), text_filename)
    
    try:
        with open(text_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        image_name = os.path.basename(selected_image_path)
        return f"Error: Could not find text file for {image_name} (expected at {text_path})"

# --- HTML to inject into the <head> for reliable font loading ---
font_html_head = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
"""

# --- Custom CSS with fixes for titles and slider ---
custom_css = """
:root {
    --body-background-fill: #333333;
    --input-background-fill: #666666;
    --text-color: #F5F5F5;
    --interface-color: #666666;
    --group-background: #404040;
    --border-color: #888888;
    --slider-color: #007bff;
    --slider-background-fill: #666666;
}
body, .gradio-container {
    background-color: var(--body-background-fill) !important;
    font-family: 'Inter', sans-serif !important;
    color: var(--text-color) !important;
}
h1.gr-markdown {
    color: var(--text-color) !important;
    font-weight: 900 !important;
    font-size: 2.5rem !important;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
    margin-bottom: 2rem !important;
}
h3.gr-markdown, .prose p, .prose {
    color: var(--text-color) !important;
    font-weight: 700 !important;
}
.gradio-label > .name, .gr-info, .gr-check-radio .gr-info {
    color: var(--text-color) !important;
    opacity: 0.9;
}
.gradio-group, .gradio-tabs > div, .gradio-accordion {
    background-color: var(--group-background) !important;
    border: 1px solid var(--interface-color) !important;
    border-radius: 8px !important;
    box-shadow: none !important;
}
textarea, input[type="text"], input[type="file"], .gr-dropdown select, .gr-textbox, input[type=number] {
    background-color: var(--input-background-fill) !important;
    color: var(--text-color) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 4px !important;
}
input::placeholder, textarea::placeholder {
    color: #cccccc !important;
    opacity: 0.7;
}
.gradio-button {
    font-family: 'Inter', sans-serif !important;
    border-radius: 4px !important;
}
.gr-button-primary { background: #007bff !important; color: white !important; border: none !important; }
.gr-button-secondary { background: var(--interface-color) !important; color: var(--text-color) !important; border: 1px solid var(--border-color) !important; }
.gr-button-stop { background: #dc3545 !important; color: white !important; border: none !important; }
.copied-success { background: #28a745 !important; border-color: #28a745 !important; color: white !important; }
.gr-check-radio .gr-check-radio-label input[type="checkbox"],
.gr-check-radio .gr-check-radio-label input[type="radio"] {
    background-color: var(--interface-color) !important;
    border: 1px solid var(--border-color) !important;
}
.gradio-check-radio-label span { color: var(--text-color) !important; }
#model_selector_radio > div { flex-direction: column; align-items: stretch; }
#single_image_preview img, #batch_gallery_output .thumbnail-item {
    background-color: #2a2a2a !important;
    border-radius: 4px !important;
}
#single_image_preview img { max-height: 400px; object-fit: contain; }
#batch_gallery_output .thumbnail-item img { object-fit: cover !important; }
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background-color: var(--slider-color);
    height: 18px;
    width: 18px;
    border-radius: 50%;
    border: 2px solid var(--text-color);
    margin-top: -6px; /* Fine-tuned for vertical alignment */
}
input[type=range]::-moz-range-thumb { /* For Firefox */
    background-color: var(--slider-color);
    height: 18px;
    width: 18px;
    border-radius: 50%;
    border: 2px solid var(--text-color);
}
footer {
    display: none !important;
}
"""

with gr.Blocks(
    theme=gr.themes.Base(),
    title="Caption Creator",
    css=custom_css,
    head=font_html_head
) as demo:
    gr.Markdown("# CAPTION CREATOR", elem_classes="gr-markdown")
    model_choices, default_model = get_model_choices_and_default()
    
    animation_style_output = gr.HTML(visible=False) 
    single_image_path_state = gr.State()

    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### 1. Upload Image(s)", elem_classes="gr-markdown", visible=True)
            
            with gr.Column(visible=True) as single_upload_column:
                single_file_input = gr.File(
                    label="Upload Single Image",
                    file_types=[".png", ".jpg", ".jpeg"],
                    type="filepath",
                    visible=True,
                    elem_id="main_file_input"
                )
                single_image_preview = gr.Image(
                    interactive=False, visible=False, show_label=False,
                    show_download_button=False, show_share_button=False
                )
                change_image_button = gr.Button("Change Image", visible=False)

            with gr.Column(visible=False) as batch_upload_column:
                batch_file_input = gr.File(
                    label="Drag & Drop Batch Images Here",
                    file_count="multiple",
                    file_types=[".png", ".jpg", ".jpeg"]
                )
                batch_upload_status = gr.Textbox(label="Upload Status", interactive=False, lines=5)

            with gr.Column():
                start_button = gr.Button("Start Generation", variant="primary", visible=True)
                stop_button = gr.Button("Stop Generation", variant="stop", visible=False)

            gr.Markdown("### 2. Configure Generation", elem_classes="gr-markdown")
            mode_selector = gr.Radio(["Single Image", "Batch Processing"], label="Select Mode", value="Single Image")
            gen_type_input = gr.Radio(["Captions", "Tags"], label="Generation Type", value="Captions")
            
            with gr.Group():
                trigger_words_input = gr.Textbox(label="Trigger Words (Optional)", placeholder="e.g., The character is Lara Croft from Tomb Raider.", info="Added to the start of every generated caption, followed by a space.")
                max_words_slider = gr.Slider(minimum=1, maximum=300, value=300, step=1, label="Max Words", info="Set the maximum word count for the output.")
                single_paragraph_input = gr.Checkbox(label="Format as Single Paragraph", value=False, info="Removes line breaks from the final caption.", visible=True)

            gr.Markdown("### 3. Model & Post-Processing", elem_classes="gr-markdown")
            model_input = gr.Radio(choices=model_choices, value=default_model, label="Model / VRAM Configuration", elem_id="model_selector_radio")
            low_vram_input = gr.Checkbox(label="Enable Low-VRAM Mode", value=False, info="Saves approximately 1GB of VRAM, but may be slower")
            keep_model_loaded_input = gr.Checkbox(label="Keep model loaded after generation", value=False, info="Saves time on consecutive runs, but keeps VRAM occupied.")
            shutdown_pc_input = gr.Checkbox(label="Shut down PC after generation", value=False, info="WARNING: This will shut down your computer. Unsaved work in other apps will be lost.")
            
            kohya_export_input = gr.Checkbox(label="Export as kohya_ss folder train structure", value=False, info="Organizes the output into a folder structure for training.")
            with gr.Group(visible=False) as kohya_options_group:
                instance_prompt_input = gr.Textbox(label="Instance Prompt", placeholder="e.g., Lara Croft")
                class_prompt_input = gr.Textbox(label="Class Prompt", placeholder="e.g., Character")
                repeats_input = gr.Number(label="Repeats", value=1, precision=0, minimum=1)
        
        with gr.Column(scale=2):
            gr.Markdown("### 4. Status & Output", elem_classes="gr-markdown"); status_output = gr.Textbox(label="Live Status", lines=5, interactive=False, autoscroll=True)
            
            with gr.Group(visible=True) as single_output_group:
                single_image_output = gr.Image(label="Processed Image", interactive=False, show_download_button=False, show_fullscreen_button=False, elem_id="single_image_preview")
                single_text_output = gr.Textbox(label="Generated Text", interactive=True, lines=8)
                with gr.Row():
                    copy_button = gr.Button("Copy to Clipboard")
                    open_folder_button_single = gr.Button("📂 Open Output Folder")

            with gr.Group(visible=False) as batch_output_group:
                batch_output_gallery = gr.Gallery(label="Generated Batch Files", show_label=True, elem_id="batch_gallery_output", columns=5) 
                batch_text_output = gr.Textbox(label="Selected Image Text", interactive=False, lines=5)
                with gr.Row():
                    download_zip_button = gr.DownloadButton("Save as ZIP Archive", variant="secondary")
                    open_folder_button_batch = gr.Button("📂 Open Output Folder")
                gallery_filepaths_state = gr.State([])

    # --- Event Handlers ---
    all_inputs = [mode_selector, single_image_path_state, gen_type_input, trigger_words_input, single_paragraph_input, max_words_slider, model_input, low_vram_input, keep_model_loaded_input, shutdown_pc_input, kohya_export_input, instance_prompt_input, class_prompt_input, repeats_input]
    all_outputs = [status_output, batch_output_gallery, single_image_output, single_text_output, batch_text_output, gallery_filepaths_state, animation_style_output, start_button, stop_button]

    mode_selector.change(fn=update_ui_mode, inputs=mode_selector, outputs=[single_upload_column, batch_upload_column, single_output_group, batch_output_group])
    gen_type_input.change(fn=update_captioning_options, inputs=gen_type_input, outputs=[trigger_words_input, single_paragraph_input])
    kohya_export_input.change(fn=lambda x: gr.update(visible=x), inputs=kohya_export_input, outputs=kohya_options_group)

    single_file_input.upload(fn=handle_single_upload, inputs=[single_file_input], outputs=[single_image_preview, single_image_path_state, single_file_input, single_image_preview, change_image_button])
    
    change_image_button.click(
        fn=show_uploader, inputs=None, outputs=[single_image_preview, single_image_path_state, single_file_input, single_image_preview, change_image_button],
        js="""() => { setTimeout(() => { const fileInput = document.querySelector('#main_file_input input[type="file"]'); if (fileInput) { fileInput.value = ''; fileInput.click(); } }, 300); return []; }"""
    )
    
    batch_file_input.upload(fn=handle_batch_uploads, inputs=batch_file_input, outputs=[batch_file_input, batch_upload_status])
    
    start_button.click(fn=run_generation, inputs=all_inputs, outputs=all_outputs)
    stop_button.click(fn=request_stop, inputs=None, outputs=stop_button)
    
    batch_output_gallery.select(fn=show_batch_text, inputs=[gallery_filepaths_state], outputs=batch_text_output)
    download_zip_button.click(fn=create_zip_archive, inputs=None, outputs=[download_zip_button, status_output])
    open_folder_button_single.click(fn=open_output_folder, inputs=None, outputs=None)
    open_folder_button_batch.click(fn=open_output_folder, inputs=None, outputs=None)

    copy_button.click(fn=None,inputs=single_text_output,outputs=None, js="""(text_to_copy) => { navigator.clipboard.writeText(text_to_copy); const all_buttons = document.querySelectorAll('button'); let copy_btn; all_buttons.forEach(btn => { if (btn.innerText.includes('Copy to Clipboard') || btn.innerText.includes('Copied!')) { copy_btn = btn; } }); if (copy_btn) { const original_text = "Copy to Clipboard"; copy_btn.innerText = 'Copied!'; copy_btn.classList.add('copied-success'); setTimeout(() => { copy_btn.innerText = original_text; copy_btn.classList.remove('copied-success'); }, 2000); } }""")
    demo.unload(fn=stop_koboldcpp_server)

if __name__ == "__main__":
    check_for_default_config()

    # --- pywebview implementation ---
    server_port = 7861
    server_url = f"http://127.0.0.1:{server_port}/?__theme=dark"

    def run_gradio():
        demo.queue().launch(server_name="127.0.0.1", server_port=server_port, inbrowser=False, show_api=False)

    gradio_thread = threading.Thread(target=run_gradio, daemon=True)
    gradio_thread.start()

    print("Waiting for Gradio server to start...")
    for _ in range(30):
        try:
            if requests.get(server_url, timeout=0.5).status_code == 200:
                print("Gradio server is ready.")
                
                # Hide the console window now that the GUI is about to launch.
                hide_console_window()
                
                webview.create_window("Caption Creator", server_url, resizable=True, maximized=True)
                webview.start()
                sys.exit(0)
        except requests.ConnectionError:
            time.sleep(0.5)
    
    print("[ERROR] Gradio server failed to start. Please check logs.", file=sys.stderr)
    if sys.platform == "win32":
        os.system("pause")
    sys.exit(1)