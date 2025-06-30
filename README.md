# Caption Creator
Support on Patreon - https://www.patreon.com/MM744                                                                           

**Caption Creator** is a fast and full portable GUI tool for generating high-quality image captions and tags—ideal for custom dataset creation, especially for **FLUX Dev, Pony, SDXL 1.0 Base, Illustrious**, and more. Works seamlessly for both training and image generation.

---

## Screenshots

**Single Image Mode:**
![image](https://github.com/user-attachments/assets/9597f70a-9c62-44ee-823a-c574d8589c80)


**Batch Processing Mode:**
![image](https://github.com/user-attachments/assets/40162309-53d3-4339-b32a-14932f7c62ac)


---

## Features

- **GUI Interface:** An intuitive and easy-to-use graphical interface.
- **Supports Tags/Captions:** Use for both tag and caption generation.
- **Batch Processing:** Process entire folders of images at once.
- **Memory Optimizations:** Choose a model size (5GB, 8GB, 10GB, 20GB) to fit your GPU VRAM.
- **Low-VRAM Mode:** Reduces VRAM usage by ~1GB for systems with limited memory.
- **Fast Model Downloader:** Download models quickly and easily.
- **Portable:** No installation required, run it from anywhere.
- **Uncensored Output:** Get full, unrestricted captions and tags.
- **Trigger Words:** Automatically add specific words to the start of every caption or tag list.
- **Max Word/Token Limit:** Control the length of your output to prevent overly long captions.
- **Kohya_SS Support:** Exports in a folder structure fully compatible for training.
- **Keep Model in VRAM:** Speeds up generation for subsequent tasks.
- **Convenient Actions:** Copy to clipboard, open the output folder, or save results as a ZIP archive directly from the UI.

---

## How to Use

1.  **Download the Program**  
    Due to file size limits on some platforms, you may need to download the program from a link provided in a `.txt` file or from the official source. Unpack the `.zip` archive.

2.  **Download a Model**  
    Run `Run_Downloader.bat` and select a model based on your GPU's VRAM (5GB, 8GB, 10GB, or 20GB).  
    *Larger models are more accurate but use more VRAM. They can run on lower VRAM systems, but will be slower.*

3.  **Launch the UI**  
    Run `Run_Caption_Creator_UI.bat` to start the program.

4.  **Prepare Images**  
    - **Option A (Recommended):** Place all your images in the `input` folder before running a batch process.
    - **Option B (GUI):** Drag and drop images/folders directly into the UI.

5.  **Configure and Generate**
    - Select **Single Image** or **Batch Processing** mode.
    - Choose between **Captions** or **Tags** generation.
    - Optionally, add **Trigger Words** and set a **Max Word** count.
    - Click **Start Generation**.

6.  **Get Results**  
    Processed images and their corresponding `.txt` captions/tags are saved in the `output` folder.

---

## Ideal For

-   Image captioning and tagging automation
-   Extracting prompts from images
-   Creating training datasets for AI models

---

## Structure
```
Caption-Creator/
├── input/                          <-- Input folder for images dataset
│   ├── cat_on_sofa.jpg             <-- Input image (example)
│   └── landscape_painting.png      <-- Input image (example)
├── output/                         <-- Output folder for images/captions dataset
│   ├── 1.png                       <-- Converted .png from input folder
│   ├── 1.txt                       <-- Generated Captions for 1.png
│   ├── 2.png                       <-- Converted .png from input folder
│   └── 2.txt                       <-- Generated Captions for 1.png
├── Run_Caption_Creator_UI.bat      <-- Start the program
├── Run_Downloader.bat              <-- Download the models
├── Run_Updater.bat                 <-- Update & Fix
├── models/                         <-- Downloaded models
├── bin/                            <-- Runtime libraries
├── config.ini                      <-- Configuration file
└── README.md                       <-- Introduces and explains a program 
```

---

## Output Example



**Captions (Format as Single Paragraph enabled):**
> The image is a digital illustration of a female character from the video game "Street Fighter II." She has blonde hair styled in two braids, each tied with red ribbons. Her skin tone is fair, and she has blue eyes that are focused intently forward. She wears a red beret hat with a white button on the front center, a green sleeveless tank top, and red fingerless gloves. Her right arm is extended forward, her fist clenched as if preparing for a punch or throwing a punch. Her left arm is slightly behind her body, also extending forward but less prominently positioned. The background is a gradient from dark gray at the top to black at the bottom, providing contrast to the character's bright clothing colors. The character's expression is one of determination and focus, with her mouth slightly open showing small teeth. Her muscular build is evident through the defined lines of her arms and shoulders. The overall style of the illustration is highly detailed and dynamic, typical of the "Street Fighter" series' art design. The image is framed by gray borders on both sides and top/bottom, creating a rectangular composition. This framing effect adds depth and focus to the central character. The entire image conveys a sense of strength and readiness for combat.

**Tags:**
> digital art, female character, muscular build, green tank top, red beret with white button, red fingerless gloves, blonde hair in braid, intense expression, right arm extended forward, clenched teeth, dark blue gradient background, vibrant colors, anime style, strong pose, upper body, dynamic lighting, high contrast, Illustrious quality, fighting game character, Camilla (Street Fighter), serious demeanor, confident stance, athletic physique, determined look, bold outlines, realistic shading, vivid details, medium close-up shot, action pose, character design, video game aesthetics, strong facial features, dynamic composition, energetic pose, fierce attitude, expressive eyes, powerful stance, combat-ready appearance

---

## Tags

`#caption-creator` `#dataset` `#tagging` `#portable` `#uncensored` `#batch-processing` `#memory-optimized`
