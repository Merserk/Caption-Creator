# Caption-Creator
Caption Creator is a fast and portable tool for generating high-quality image captions and tags—ideal for custom dataset creation, especially for (FLUX Dev, Pony, SDXL 1.0 Base, Illustrious), and more. Works seamlessly for both training and image generation.

Features:

- Supports Tags/Captions: Use for both tag and caption generation.

- Batch Processing: Process entire folders of images.

- Memory Optimizations: Choose a model size to fit your GPU VRAM.

- Fast Model Downloader: Download models quickly.

- Portable: No installation required.

- Uncensored Output: Full, unrestricted captions/tags.

- Easy to Use: Minimal setup, intuitive workflow.

How to Use:

1. Due to Civitai's 30 MB file size limit, I provided a download link from .txt file or download from link.

2. Unpack .zip archive

3. Run `Download the model.bat` and select your VRAM (5GB, 8GB, 10GB, or 20GB). Larger models work on smaller VRAM but may be slower and uses more RAM.

4. Place images to process in the `input` folder.

6. Run `run_portable_auto.bat`

6.1. Select Captions or Tags generation

6.2. Enable or disable Low-VRAM model. (Reduces ~1GB VRAM, may be slightly slower)

6.3. Select model

7. Processed files will be saved in the `output` folder as: `1.png`, `1.txt`, `2.png`, `2.txt`, etc.

8. Ready

Ideal For

- Image captioning/tagging

- Extract prompt from image

- Training dataset creation

Structure
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
├── run_portable_auto.bat           <-- Start the program
├── models/                         <-- Downloaded models
├── bin/                            <-- Runtime libraries
├── config.ini                      <-- Configuration file
└── README.md                       <-- Introduces and explains a program 
```

Screenshots
![image](https://github.com/user-attachments/assets/4d2bc0e4-e679-4544-a468-6ec5692b2f22)
![image](https://github.com/user-attachments/assets/04bcb8ca-2800-42e8-b7cd-68be008e4231)

Output Example (image by Keith Griego)
![image](https://github.com/user-attachments/assets/1f78cc8c-bb73-4872-b4ab-d22873a44113)

Captions:

Digital artwork of a young woman in profile view, facing left. The subject has short, straight, white hair with bright pink neon highlights that glow intensely against the dark background. Her skin is pale and smooth, with delicate features including a small nose and full lips. She wears a high-collared black jacket adorned with intricate patterns and subtle orange accents.

The background is an abstract blur of vibrant colors, primarily pinks, blues, and whites, resembling a cityscape at night filled with neon lights. The neon lights create a futuristic atmosphere, casting a soft glow around her head and shoulders.

Her eyes are large and expressive, with a hint of purple irises visible despite the shadow cast by her profile. A series of glowing pink lines and geometric shapes overlay her right ear and cheek, adding a cybernetic or digital element to her appearance.

The overall style combines elements of anime and cyberpunk aesthetics, characterized by its vivid color palette, sharp contrasts, and emphasis on neon lighting. The texture of the artwork is smooth and polished, with clean lines and a high level of detail in both the character's face and clothing. The composition draws attention to the contrast between the glowing neon and the dark, blurred background, creating a dynamic and visually striking image.

Tags:

digital art, anime style, neon lights, cyberpunk city background, female character, side profile, short pink bob haircut with glowing neon highlights, large expressive eyes, dark glossy jacket with reflective patterns, bright colorful city lights in background, soft light on face, sharp contrast between neon and shadows, futuristic aesthetic, vibrant colors, high detail, intricate lighting effects, urban night scene, modern digital illustration, glowing outlines, sleek and stylish appearance, subtle facial expression, dynamic composition, vivid color palette, detailed textures, realistic shading, illuminated hair strands, urban environment, cityscape elements in background, atmospheric lighting, contemporary digital artwork.

VirusTotal
![image](https://github.com/user-attachments/assets/b37d8455-6c6f-45e6-9d1a-18a8d2f2b82c)

Tags

#caption-creator #dataset #tagging #portable #uncensored #batch-processing #memory-optimized

Support on Patreon - https://www.patreon.com/MM744
