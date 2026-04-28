# Binary Dependencies

This folder contains third-party runtime dependencies that are **not** included in this repository.

## Required Components

### 1. KoboldCpp
Place the KoboldCpp executable and its dependencies inside `bin/koboldcpp/`.

- Download from: https://github.com/LostRuins/koboldcpp
- Required file: `koboldcpp-launcher.exe` (or `koboldcpp.exe`)

### 2. Embedded Python (optional)
The app expects an embedded Python runtime at `bin/python-3.13.12-embed-amd64/`.
You can adjust the path in `main.js` if you prefer using a system-installed Python instead.

- Download from: https://www.python.org/downloads/windows/
- Or use your own Python installation and update `PYTHON_EXE` in `main.js`.

### 3. Models
Downloaded model files are stored in `bin/models/`.
These are fetched automatically by the app's built-in downloader, or you can place them manually.
