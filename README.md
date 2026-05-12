# Caption Creator

[![Downloads](https://img.shields.io/github/downloads/Merserk/Caption-Creator/total.svg?style=flat-square&label=Downloads)](https://github.com/Merserk/Caption-Creator/releases)
[![Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![Python](https://img.shields.io/badge/Python-3.13.13-3776AB?style=flat-square&logo=python)](https://www.python.org/)
![Portable](https://img.shields.io/badge/Type-Portable-success?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

**Caption Creator** is a simple Windows app that helps you create text for images. It can write natural captions or clean comma-separated tags, so it is useful for image datasets, LoRA training, AI image prompting, or organizing image folders.

The app runs on your own computer. Your images stay local, and you can use either the built-in local models or your own model through LM Studio.

Official Website: **[caption-creator.merserk.com](https://caption-creator.merserk.com)**

Online version: **[aitools.merserk.com/caption-creator](https://aitools.merserk.com/caption-creator)**

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
-   **Captions or Tags:** Choose between full image descriptions or short comma-separated tags.
-   **Clean Tag Output:** Tags are automatically cleaned and formatted into one easy-to-copy line.
-   **Single Image or Batch Mode:** Work with one image, or process many images in one run.
-   **Portable App:** No full setup needed. Unpack the folder and run the app.
-   **Local AI Option:** Use included local models so images are processed on your own computer.
-   **Modern Dark Interface:** Clear dark UI with live status, progress, and preview panels.
-   **LM Studio Support:** Use a model already running in LM Studio instead of the built-in model option.
-   **Paste Images Directly:** Paste an image from your clipboard in Single Image mode with Ctrl+V.
-   **Model Management:** Download or delete the built-in models from inside the app.
-   **Prompt Enrichment:** Add extra instructions when you want the AI to focus on something specific.
-   **Save as ZIP:** Package the current result folder into a ZIP file with one click.
-   **Model Choices by GPU Memory:** Pick from 6GB, 8GB, or 10GB+ model options depending on your graphics card.
-   **Low-VRAM Mode:** Helps the app run on lower-memory graphics cards, but generation may be slower.
-   **Keep Model Loaded:** Keep the model ready after a run so the next generation can start faster.
-   **Flexible Text Controls:** Add trigger words and choose the maximum caption or tag length.
-   **Easy Result Actions:** Copy the generated text or open the output folder from the app.

---

## How to Use

1.  **Download and Unpack**  
    Download the program and unpack the `.zip` archive into a folder.

2.  **Launch the Application**  
    Double-click **`Caption Creator.exe`** to launch the program.

3.  **Manage Your Model**
    -   Click the "Model / VRAM Configuration" button to open the model list.
    -   **To use a built-in model:** Click **Download** next to the model that matches your graphics card.
    -   **To use LM Studio:** Open LM Studio, start its local server, load a vision model, then select **Custom (LM Studio)** in Caption Creator.
    -   Select the model you want to use.

4.  **Load Image(s)**
    -   **Single Mode:** **Drag & drop** an image, **click** to browse, or **paste** an image from your clipboard.
    -   **Batch Mode:** **Drag & drop** multiple images or **click** to select several images.

5.  **Configure and Generate**
    -   Choose **Captions** or **Tags**.
    -   Adjust options such as Max Words, Trigger Words, Prompt Enrichment, Low-VRAM Mode, Keep Model Loaded, or Shut down PC after generation.
    -   Click **Generate**.

6.  **Get Results**  
    Processed images and matching `.txt` files are saved in the `output` folder, organized by mode, date, and run number.
