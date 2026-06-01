# Caption Creator

[![Downloads](https://img.shields.io/github/downloads/Merserk/Caption-Creator/total.svg?style=flat-square&label=Downloads)](https://github.com/Merserk/Caption-Creator/releases)
![Version](https://img.shields.io/badge/Version-11.2.0-111111?style=flat-square)
[![Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)](https://www.microsoft.com/windows)
[![Python](https://img.shields.io/badge/Python-3.13.13-3776AB?style=flat-square&logo=python)](https://www.python.org/)
![Portable](https://img.shields.io/badge/Type-Portable-success?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

**Caption Creator** is a portable Windows app for generating high-quality text from images. Create captions, tags, JSON, YAML, Illustrious prompts, or fully custom outputs for image datasets, LoRA training, AI prompting, and folder organization.

<img width="1201" height="750" alt="1" src="https://github.com/user-attachments/assets/9fff32a9-ce61-4e4c-afe2-8861258e4bd3" />

<img width="1201" height="750" alt="2" src="https://github.com/user-attachments/assets/ec306994-3238-48b0-8b89-263ac67de6ac" />

Run everything locally with built-in GGUF models, or connect your own vision model through **LM Studio** or **Ollama**. Your images stay on your computer.

**[Website](https://caption-creator.merserk.com)** · **[Online Version](https://aitools.merserk.com/caption-creator)** · **[Releases](https://github.com/Merserk/Caption-Creator/releases)** · **[Patreon](https://www.patreon.com/MM744)**

---

## Highlights

- **Multiple output types:** Captions, Tags, JSON, YAML, Illustrious, and Custom prompts.
- **Single or batch workflow:** Process one image, many images, or queue multiple jobs.
- **Local-first generation:** Use bundled models, LM Studio, or Ollama vision models.
- **Model management:** Download, select, delete, load, and eject models from the app.
- **Professional workflow controls:** Max words, trigger words, prompt enrichment, Low-VRAM mode, custom output folder, and original filename preservation.
- **Fast result actions:** Copy output, open the run folder, or export the current run as a ZIP archive.
- **Modern desktop UI:** Frameless dark interface with live status, progress, previews, gallery output, and an About panel.

---

## Model Options

| Option | Best for |
| --- | --- |
| **6GB VRAM (E2B Q4_K_P)** | Smaller GPUs and lighter local runs |
| **8GB VRAM (E4B Q4_K_P)** | Balanced local captioning and tagging |
| **10GB+ VRAM (E4B Q8_K_P)** | Higher-quality local generation |
| **8GB VRAM (NSFW Q4_K_M)** | NSFW-focused local generation |
| **12GB VRAM (NSFW Q8_0)** | Higher-quality NSFW-focused local generation |
| **Custom (LM Studio)** | Any compatible local vision model served by LM Studio |
| **Custom (Ollama)** | Any compatible local vision model served by Ollama |

---

## How to Use

1. **Download and unpack** the latest release.
2. Launch **`Caption Creator.exe`**.
3. Open **Model / VRAM Configuration**.
   - Download a built-in model that matches your GPU, or
   - choose **Custom (LM Studio)** / **Custom (Ollama)** and select a running vision model.
4. Choose **Single Image** or **Batch Processing**, then add images by clicking, dragging, or pasting in Single Image mode.
5. Pick an output type: **Captions**, **Tags**, **JSON**, **YAML**, **Illustrious**, or **Custom**.
6. Adjust optional settings, then click **Generate** or add the job to the **Queue**.
7. Copy the result, open the output folder, or save the run as a ZIP archive.

---

## License

MIT License. See the repository license for details.
