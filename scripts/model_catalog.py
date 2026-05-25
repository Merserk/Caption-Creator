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
    "Vision Projector",
    "mmproj-Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    "https://huggingface.co/HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    986,
    "628b7e999f89beef70b32396ae84f59c096e867747d7901f0134064ff672e290",
)

E4B_VISION_MODEL = ModelFile(
    "Vision Projector",
    "mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf",
    990,
    "debad39ab9c1152ab67695a674fb35e8375b2320c57bfd5075835d3ccb16c7db",
)

NSFW_VISION_MODEL = ModelFile(
    "Vision Projector",
    "mmproj-nsfwvision_v5.gguf",
    "https://huggingface.co/GitMylo/nsfwvision-v5_qwen3.5-9b-gguf/resolve/main/mmproj-nsfwvision_v5.gguf",
    879,
    "d4f0ac6ed348d3db3a380477910497cec826ef95d1e9bc5f59d9cf4753d44e5c",
)

MODEL_BUNDLES = {
    "6GB VRAM (E2B Q4_K_P)": ModelBundle(
        model=ModelFile(
            "6GB VRAM AI Model",
            "Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            3450,
            "aa866c1e514468f3d0f33971679d63c11b7c9c47acddd1cc5785fc467e52c21d",
        ),
        vision=E2B_VISION_MODEL,
    ),
    "8GB VRAM (E4B Q4_K_P)": ModelBundle(
        model=ModelFile(
            "8GB VRAM AI Model",
            "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf",
            5370,
            "05146429870f4ec4c16882f44bec29c51e4797463ad7080044a5c748cabb2486",
        ),
        vision=E4B_VISION_MODEL,
    ),
    "10GB+ VRAM (E4B Q8_K_P)": ModelBundle(
        model=ModelFile(
            "10GB VRAM AI Model",
            "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf",
            "https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive/resolve/main/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf",
            8130,
            "a4c4177f9fd7e3f56522675afb742f079a53f9226195b7db5e9888c872f053da",
        ),
        vision=E4B_VISION_MODEL,
    ),
    "8GB VRAM (NSFW Q4_K_M)": ModelBundle(
        model=ModelFile(
            "8GB VRAM AI Model (NSFW)",
            "nsfwvision_v5-Q4_K_M.gguf",
            "https://huggingface.co/GitMylo/nsfwvision-v5_qwen3.5-9b-gguf/resolve/main/nsfwvision_v5-Q4_K_M.gguf",
            5368,
            "f255b79a9619019468e1ac972d2ab17a13b9482bc145f74e6910c85ada6cea46",
        ),
        vision=NSFW_VISION_MODEL,
    ),
    "12GB VRAM (NSFW Q8_0)": ModelBundle(
        model=ModelFile(
            "12GB VRAM AI Model (NSFW)",
            "nsfwvision_v5-Q8_0.gguf",
            "https://huggingface.co/GitMylo/nsfwvision-v5_qwen3.5-9b-gguf/resolve/main/nsfwvision_v5-Q8_0.gguf",
            9086,
            "bf2992e296059a21755f919a495bc2b22ac67cc51603ed0b0b04bfed2448ed94",
        ),
        vision=NSFW_VISION_MODEL,
    ),
}


def get_model_bundle(model_key):
    return MODEL_BUNDLES.get(model_key)
