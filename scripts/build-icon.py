from argparse import ArgumentParser
from pathlib import Path

from PIL import Image


def build_icon(source_path: Path, png_path: Path, ico_path: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    alpha_box = source.getchannel("A").getbbox()
    if not alpha_box:
        raise ValueError("The source image has no visible pixels")

    subject = source.crop(alpha_box)
    canvas_size = 1024
    subject_size = 900
    scale = min(subject_size / subject.width, subject_size / subject.height)
    resized = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    position = (
        (canvas_size - resized.width) // 2,
        (canvas_size - resized.height) // 2,
    )
    canvas.alpha_composite(resized, position)

    png_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(png_path, "PNG", optimize=True)
    canvas.save(
        ico_path,
        "ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


def main() -> None:
    parser = ArgumentParser(description="Build DeskCal PNG and Windows ICO assets")
    parser.add_argument("source", type=Path)
    parser.add_argument("png", type=Path)
    parser.add_argument("ico", type=Path)
    args = parser.parse_args()
    build_icon(args.source, args.png, args.ico)


if __name__ == "__main__":
    main()
