"""A page-turn, social-first BookTrace teaser using only real product footage."""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "python-packages"))

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).parent
OUT = ROOT / "booktrace-douyin-page-turn.mp4"
W, H, FPS, DURATION = 1080, 1920, 20, 16
FONT = "C:/Windows/Fonts/msyh.ttc"
SERIF = "C:/Windows/Fonts/STSONG.TTF"
PAPER = (249, 247, 240)
INK = (17, 44, 33)
GREEN = (40, 105, 76)
MUTED = (112, 125, 113)


def f(size: int, serif: bool = False):
    path = SERIF if serif and Path(SERIF).exists() else FONT
    return ImageFont.truetype(path, size, index=0)


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cover(source: Image.Image, box: tuple[int, int]) -> Image.Image:
    tw, th = box
    scale = max(tw / source.width, th / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def text_center(draw: ImageDraw.ImageDraw, text: str, y: int, face, fill, max_width=950, gap=10):
    lines, current = [], ""
    for char in text:
        tentative = current + char
        if draw.textbbox((0, 0), tentative, font=face)[2] <= max_width:
            current = tentative
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    for line in lines:
        b = draw.textbbox((0, 0), line, font=face)
        draw.text(((W - (b[2] - b[0])) / 2, y), line, font=face, fill=fill)
        y += b[3] - b[1] + gap


def line(draw, points, fill, width):
    draw.line(points, fill=fill, width=width, joint="curve")


SHELF = Image.open(ROOT / "bookshelf.png").convert("RGB")
RECOVERY = Image.open(ROOT / "reader-recovery.png").convert("RGB")


def frame(t: float) -> Image.Image:
    base = Image.new("RGB", (W, H), PAPER)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Stage 1: actual shelf, shown close enough to feel tangible.
    shelf = cover(SHELF, (W, H))
    shelf_alpha = 1.0 if t < 3.4 else max(0.0, 1 - ease((t - 3.4) / 0.45))
    if shelf_alpha:
        shelf_rgba = shelf.convert("RGBA")
        shelf_rgba.putalpha(round(255 * shelf_alpha))
        layer.alpha_composite(shelf_rgba)
        shade = Image.new("RGBA", (W, H), (6, 20, 14, 135))
        shade.putalpha(round(135 * shelf_alpha))
        layer.alpha_composite(shade)
        draw = ImageDraw.Draw(layer)
        text_center(draw, "不是再读一遍", 1270, f(88, True), (255, 253, 245, round(255 * shelf_alpha)), max_width=920)
        text_center(draw, "而是从你停下的地方继续", 1405, f(36), (232, 243, 233, round(255 * shelf_alpha)), max_width=860)
        line(draw, [(116, 1514), (550, 1514), (930, 1514)], (159, 197, 168, round(220 * shelf_alpha)), 3)
        draw.ellipse((536, 1498, 564, 1526), fill=(232, 243, 233, round(255 * shelf_alpha)))

    # Stage 2: a clean physical page-turn brings in the real recovery screen.
    if t >= 2.4:
        p = ease((t - 2.4) / 1.7)
        reader = cover(RECOVERY, (W, H))
        reader_layer = reader.convert("RGBA")
        reader_layer.putalpha(round(255 * p))
        layer.alpha_composite(reader_layer)

        # A curved paper leading edge moves away; this is the only decorative transition.
        if p < 1:
            curl_x = int(W * (1 - p))
            shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            sd = ImageDraw.Draw(shadow)
            sd.polygon([(0, 0), (curl_x + 120, 0), (curl_x - 70, H), (0, H)], fill=(22, 38, 29, 75))
            shadow = shadow.filter(ImageFilter.GaussianBlur(18))
            layer.alpha_composite(shadow)
            curl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            cd = ImageDraw.Draw(curl)
            cd.polygon([(0, 0), (curl_x + 60, 0), (curl_x - 110, H), (0, H)], fill=(249, 247, 240, 255))
            cd.line([(curl_x + 60, 0), (curl_x - 110, H)], fill=(214, 220, 209, 255), width=4)
            layer.alpha_composite(curl)

    # Stage 3: direct recovery message. No feature laundry list.
    if t >= 4.5:
        a = ease((t - 4.5) / 0.6)
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.rounded_rectangle((54, 104, 1026, 274), radius=42, fill=(249, 247, 240, round(239 * a)))
        od.text((101, 142), "隔了几天？", font=f(31), fill=(*MUTED, round(255 * a)))
        od.text((101, 185), "先接回这一页需要的前情", font=f(48, True), fill=(*INK, round(255 * a)))
        layer.alpha_composite(overlay)

    # Stage 4: end card floats on the true product screen instead of replacing it.
    if t >= 11.4:
        a = ease((t - 11.4) / 0.65)
        shade = Image.new("RGBA", (W, H), (15, 35, 25, round(158 * a)))
        layer.alpha_composite(shade)
        ed = ImageDraw.Draw(layer)
        text_center(ed, "书脉", 585, f(104, True), (255, 252, 243, round(255 * a)))
        text_center(ed, "读得清脉络，记得住来处", 724, f(38), (218, 234, 220, round(255 * a)))
        text_center(ed, "一个会记住阅读上下文的开源 AI 阅读器", 1045, f(43), (255, 252, 243, round(255 * a)), max_width=850)
        text_center(ed, "github.com/anti-ai-member/booktrace-ai", 1258, f(29), (210, 231, 215, round(255 * a)), max_width=900)

    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def main():
    writer = imageio_ffmpeg.write_frames(
        str(OUT), (W, H), fps=FPS, codec="libx264", pix_fmt_in="rgb24", pix_fmt_out="yuv420p",
        macro_block_size=1, output_params=["-movflags", "+faststart", "-crf", "18"],
    )
    writer.send(None)
    try:
        for idx in range(DURATION * FPS):
            writer.send(frame(idx / FPS).tobytes())
    finally:
        writer.close()
    print(OUT)


if __name__ == "__main__":
    main()
