# Caption-Creator
Caption Creator is a fast and portable tool for generating high-quality image captions and tags—ideal for custom dataset creation, especially for (FLUX Dev, Pony, SDXL 1.0 Base, Illustrious), and more. Works seamlessly for both training and image generation.

Caption Creator (Created by MM744)
Support on Patreon - https://www.patreon.com/MM744                                                                           
  
**Caption Creator** is a fast and portable tool for generating high-quality image captions and tags—ideal for custom dataset creation, especially for **FLUX Dev, Pony, SDXL 1.0 Base, Illustrious**, and more. Works seamlessly for both training and image generation.

---

## Features

- **Supports Tags/Captions:** Use for both tag and caption generation.
- **Batch Processing:** Process entire folders of images.
- **Memory Optimizations:** Choose a model size to fit your GPU VRAM.
- **Fast Model Downloader:** Download models quickly.
- **Portable:** No installation required.
- **Uncensored Output:** Full, unrestricted captions/tags.
- **Easy to Use:** Minimal setup, intuitive workflow.

---

## How to Use

1. **Download Model**  
   Run `Download the model.bat` and select your VRAM (5GB, 8GB, 10GB, or 20GB).  
   *Larger models work on smaller VRAM but may be slower.*

2. **Prepare Images**  
   Place images in the `input` folder.

3. **Run Caption Creator**
   - **For Captions:** Run `run_portable_auto.bat`

4. **Get Results**  
   Processed files are saved in the `output` folder as:  
   `1.png`, `1.txt`, `2.png`, `2.txt`, etc.

---

## Ideal For

- Image captioning/tagging automation
- Extract prompt from image
- Training dataset

---

## Structure

Caption-Creator/
├── input/                          <-- Input folder for images dataset
│   ├── cat_on_sofa.jpg             <-- Input image (example)
│   └── landscape_painting.png      <-- Input image (example)
├── output/                         <-- Output folder for images/captions dataset
│   ├── 1.png                       <-- Converted .png from input folder
│   ├── 1.txt                       <-- Generated Captions for 1.png
│   ├── 2.png                       <-- Converted .png from input folder
│   └── 2.txt                       <-- Generated Captions for 1.png
├── run_portable_auto.bat           <-- Start the program
├── models/                         <-- Downloaded models
├── bin/                            <-- Runtime libraries
├── config.ini                      <-- Configuration file
└── README.md                       <-- Introduces and explains a program 

---

## Tags

`#caption-creator` `#dataset` `#tagging` `#portable` `#uncensored` `#batch-processing` `#memory-optimized`
