# Caption Creator

[![Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![Python](https://img.shields.io/badge/Python-3.13.13-3776AB?style=flat-square&logo=python)](https://www.python.org/)
![Portable](https://img.shields.io/badge/Type-Portable-success?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

Experience the next evolution of dataset creation with **Caption Creator**. This fast, fully portable GUI tool is designed to generate exceptional image captions and tags with unparalleled ease. It's the ultimate assistant for creating high-quality datasets, perfect for both LoRA training and advanced image prompting.

The application runs entirely on your local machine, ensuring privacy and uncensored output.

Official Website: **[caption-creator.merserk.com](https://caption-creator.merserk.com)**

Support the developer on Patreon: **[patreon.com/MM744](https://www.patreon.com/MM744)**

---

## Screenshots

**Single Image Mode:**
<img width="1200" height="750" alt="Screenshot 2026-03-20 211137" src="https://github.com/user-attachments/assets/5de2c0a1-8ae5-4425-a7a2-d829772fba45" />

**Batch Processing Mode:**
<img width="1200" height="750" alt="Screenshot 2026-03-20 215115" src="https://github.com/user-attachments/assets/cc359824-6859-4fcb-a367-b6ab1dc2f420" />

---

## Features

#### Core Functionality
-   **Dual Generation Modes:** Seamlessly switch between generating detailed **Captions** or concise, comma-separated **Tags**.
-   **Intelligent Tag Formatting:** Automatically cleans AI output for tags into a perfect, single-line, comma-separated list.
-   **Powerful Batch Processing:** Process entire folders of images with a clear, gallery-style progress view.
-   **Portable & Self-Contained:** No installation needed. Runs from a single folder with its own embedded Python.
-   **Uncensored Local AI:** Utilizes locally run models for full creative freedom without content filters.
-   **Complete UI Overhaul:** A sleek, modern, and responsive dark-theme interface.
-   **LM Studio Integration:** Connect directly to a running LM Studio instance to use any compatible model.
-   **Direct Image Pasting:** Instantly process an image by simply pasting it from your clipboard (Ctrl+V).
-   **Interactive Model Management:** Download, delete, and manage models directly from within the application.
-   **Prompt Enrichment:** Add extra context or instructions to the AI on the fly.
-   **Built-in ZIP Archiving:** Save your entire generation run into a single ZIP archive with one click.
-   **VRAM Optimization:** Choose from models tailored for different GPU VRAM capacities (6GB, 8GB, 10GB+).
-   **Low-VRAM Mode (No KV Offload):** A dedicated checkbox to avoid offloading KV Cache or scratch buffers to VRAM. This allows more model layers to fit into GPU memory but may result in a significant decrease in generation speed.
-   **Keep Model Loaded:** An option to keep the AI model in VRAM, dramatically speeding up subsequent generations.
-   **Flexible Formatting:** Use Trigger Words, define a Max Word count, and format captions as a single paragraph.
-   **Convenient Actions:** Instantly copy text to the clipboard or open the output folder from the UI.

---

## How to Use

1.  **Download and Unpack**  
    Download the program and unpack the `.zip` archive into a folder.

2.  **Launch the Application**  
    Double-click **`Caption Creator.exe`** to launch the program.

3.  **Manage Your Model**
    -   Click the "Model / VRAM Configuration" button to open the model selection panel.
    -   **To use a built-in model:** If a model is not "Available," click the download icon (📥) next to it.
    -   **To use LM Studio:** Select the "Custom (LM Studio)" option and click "Connect".
    -   Select your desired model from the list to make it active.

4.  **Load Image(s)**
    -   **Single Mode:** **Drag & drop** an image, **click** to browse, or **paste** an image from your clipboard.
    -   **Batch Mode:** **Drag & drop** multiple images or **click** to select a batch.

5.  **Configure and Generate**
    -   Choose your generation type (**Captions** or **Tags**).
    -   Adjust settings like Max Words, Trigger Words.
    -   Click **Generate**.

6.  **Get Results**  
    Processed images and their corresponding `.txt` files are saved in the `output` folder, neatly organized by run.

---

## Ideal For

-   Automating image captioning and tagging.
-   Extracting detailed prompts from existing images.
-   Creating high-quality training datasets for AI models.
-   Archiving and organizing image collections with descriptive metadata.

---


## Output Example

**Captions (Format as Single Paragraph enabled):**

> The image is a digital illustration of a female character from the video game "Street Fighter II." She has blonde hair styled in two braids, each tied with red ribbons. Her skin tone is fair, and she has blue eyes that are focused intently forward. She wears a red beret hat with a white button on the front center, a green sleeveless tank top, and red fingerless gloves. Her right arm is extended forward, her fist clenched as if preparing for a punch or throwing a punch... The entire image conveys a sense of strength and readiness for combat.

**Tags:**

> digital art, female character, muscular build, green tank top, red beret with white button, red fingerless gloves, blonde hair in braid, intense expression, right arm extended forward, clenched teeth, dark blue gradient background, vibrant colors, anime style, strong pose, upper body, dynamic lighting, high contrast, Illustrious quality, fighting game character, Camilla (Street Fighter), serious demeanor, confident stance, athletic physique, determined look...

---

## Tags

`#caption-creator` `#dataset` `#tagging` `#portable` `#uncensored` `#batch-processing` `#gui` `#ui-ux` `#lm-studio` `#local-ai`
