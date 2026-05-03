from dataclasses import dataclass


@dataclass(frozen=True)
class ModelFile:
    name: str
    file: str
    url: str
    estimated_mb: int
    sha256: str | None = None


@dataclass(frozen=True)
class ModelBundle:
    model: ModelFile
    vision: ModelFile


E2B_VISION_MODEL = ModelFile(
    "Gemma 4 E2B Vision Projector",
    "mmproj-Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    "https://huggingface.co/HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    986,
    "628b7e999f89beef70b32396ae84f59c096e867747d7901f0134064ff672e290",
)

E4B_VISION_MODEL = ModelFile(
    "Gemma 4 E4B Vision Projector",
    "mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    990,
    "debad39ab9c1152ab67695a674fb35e8375b2320c57bfd5075835d3ccb16c7db",
)

MODEL_BUNDLES = {
    "6GB VRAM (E2B Q4_K_P)": ModelBundle(
        model=ModelFile(
            "Gemma 4 E2B Q4_K_P",
            "Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            3450,
            "aa866c1e514468f3d0f33971679d63c11b7c9c47acddd1cc5785fc467e52c21d",
        ),
        vision=E2B_VISION_MODEL,
    ),
    "8GB VRAM (E4B Q4_K_P)": ModelBundle(
        model=ModelFile(
            "Gemma 4 E4B Q4_K_P",
            "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            5370,
            "05146429870f4ec4c16882f44bec29c51e4797463ad7080044a5c748cabb2486",
        ),
        vision=E4B_VISION_MODEL,
    ),
    "10GB+ VRAM (E4B Q8_K_P)": ModelBundle(
        model=ModelFile(
            "Gemma 4 E4B Q8_K_P",
            "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf",
            8130,
            "a4c4177f9fd7e3f56522675afb742f079a53f9226195b7db5e9888c872f053da",
        ),
        vision=E4B_VISION_MODEL,
    ),
}


def get_model_bundle(model_key):
    return MODEL_BUNDLES.get(model_key)
