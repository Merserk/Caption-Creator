# Caption Creator v7.2

Experience the next evolution of dataset creation with **Caption Creator v7.2**. This fast, fully portable GUI tool is designed to generate exceptional image captions and tags with unparalleled ease. It's the ultimate assistant for creating high-quality datasets for AI models like **Pony, SDXL, and Illustrious**, perfect for both LoRA training and advanced image prompting.

The application runs entirely on your local machine, ensuring privacy and uncensored output.

Support the developer on Patreon: **[patreon.com/MM744](https://www.patreon.com/MM744)**

---

## Screenshots (New v7.2 UI)

**Single Image Mode:**
<img width="3839" height="2070" alt="Screenshot 2025-07-23 140334" src="https://github.com/user-attachments/assets/b0219dc6-13da-431e-b3ce-5a0437e39dcf" />

**Batch Processing Mode:**
<img width="1920" height="1044" alt="222222222222" src="https://github.com/user-attachments/assets/df311656-20fe-4877-b407-ce423613683a" />

---

## Features

#### Core Functionality
-   **Dual Generation Modes:** Seamlessly switch between generating detailed **Captions** or concise, comma-separated **Tags**.
-   **Intelligent Tag Formatting:** Automatically cleans AI output for tags into a perfect, single-line, comma-separated list.
-   **Powerful Batch Processing:** Process entire folders of images with a clear, gallery-style progress view.
-   **Portable & Self-Contained:** No installation needed. Runs from a single folder with its own embedded Python.
-   **Uncensored Local AI:** Utilizes locally run models for full creative freedom without content filters.

#### New in v7.2
-   **Complete UI Overhaul:** A sleek, modern, and responsive dark-theme interface.
-   **LM Studio Integration:** Connect directly to a running LM Studio instance to use any compatible model.
-   **Direct Image Pasting:** Instantly process an image by simply pasting it from your clipboard (Ctrl+V).
-   **Interactive Model Management:** Download, delete, and manage models directly from within the application.
-   **Prompt Enrichment:** Add extra context or instructions to the AI on the fly.
-   **Built-in ZIP Archiving:** Save your entire generation run into a single ZIP archive with one click.

#### Workflow & Quality of Life
-   **VRAM Optimization:** Choose from models tailored for different GPU VRAM capacities (5GB, 8GB, 10GB, 20GB).
-   **Low-VRAM Mode:** A dedicated checkbox to further reduce VRAM usage.
-   **Keep Model Loaded:** An option to keep the AI model in VRAM, dramatically speeding up subsequent generations.
-   **Full Kohya_SS Export:** Configure and export in a folder structure fully compatible for training.
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
    -   Adjust settings like Max Words, Trigger Words, or enable options like Kohya_SS export.
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

## Structure

```
Caption-Creator/
├── input/                          <-- Drop images here for processing
│   ├── cat_on_sofa.jpg             <-- Input image (example)
│   └── landscape_painting.png      <-- Input image (example)
├── output/                         <-- Output folder for generated text and images
│   ├── Captions_1-1-2024/
│   │   └── 1/                      <-- A single generation run
│   │       ├── 1.png               <-- Renamed and copied image
│   │       └── 1.txt               <-- Generated text for 1.png
├── bin/                            <-- Runtime libraries (Python, etc.)
├── models/                         <-- Downloaded AI models are stored here
├── Caption Creator.exe             <-- LAUNCH THE PROGRAM HERE
├── config.ini                      <-- Advanced configuration for prompts & parameters
└── README.md                       <-- You are here
```

---

## Output Example

**Captions (Format as Single Paragraph enabled):**

> The image is a digital illustration of a female character from the video game "Street Fighter II." She has blonde hair styled in two braids, each tied with red ribbons. Her skin tone is fair, and she has blue eyes that are focused intently forward. She wears a red beret hat with a white button on the front center, a green sleeveless tank top, and red fingerless gloves. Her right arm is extended forward, her fist clenched as if preparing for a punch or throwing a punch... The entire image conveys a sense of strength and readiness for combat.

**Tags:**

> digital art, female character, muscular build, green tank top, red beret with white button, red fingerless gloves, blonde hair in braid, intense expression, right arm extended forward, clenched teeth, dark blue gradient background, vibrant colors, anime style, strong pose, upper body, dynamic lighting, high contrast, Illustrious quality, fighting game character, Camilla (Street Fighter), serious demeanor, confident stance, athletic physique, determined look...

---

## Tags

`#caption-creator` `#dataset` `#tagging` `#portable` `#uncensored` `#batch-processing` `#gui` `#ui-ux` `#kohya-ss` `#lm-studio` `#local-ai`
