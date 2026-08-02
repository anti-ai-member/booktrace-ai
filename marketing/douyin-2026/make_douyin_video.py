"""Render a silent vertical product teaser from captured BookTrace screens.

Run from the repository root with the bundled Python runtime. The generated MP4
is intentionally caption-led so it can be posted as-is or paired with the
voiceover in publish-copy.md.
"""

from __future__ import annotations

import math
from pathlib import Path

try:
    import imageio_ffmpeg
except ImportError as exc:  # pragma: no cover - helper script dependency guard
    raise SystemExit(
        "Missing dependency: imageio_ffmpeg. Install with "
        "`pip install -r marketing/douyin-2026/requirements.txt`."
    ) from exc
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).parent
OUT = ROOT / "booktrace-douyin-teaser.mp4"
WIDTH, HEIGHT, FPS = 1080, 1920, 20
PAPER = "#F8F7F2"
INK = "#18362B"
MUTED = "#728176"
ACCENT = "#2D6A4F"
FONT = "C:/Windows/Fonts/msyh.ttc"
SERIF = "C:/Windows/Fonts/STSONG.TTF"


def font(size: int, serif: bool = False):
    path = SERIF if serif and Path(SERIF).exists() else FONT
    return ImageFont.truetype(path, size, index=0)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap(draw, text, face, max_width):
    lines, current = [], ""
    for char in text:
        proposal = current + char
        if draw.textbbox((0, 0), proposal, font=face)[2] <= max_width:
            current = proposal
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def draw_centered(draw, text, y, face, fill, max_width=940, gap=16):
    lines = wrap(draw, text, face, max_width)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=face)
        draw.text(((WIDTH - (bbox[2] - bbox[0])) / 2, y), line, font=face, fill=fill)
        y += (bbox[3] - bbox[1]) + gap
    return y


def source_card(path: Path, scale: float, x: int, y: int) -> Image.Image:
    source = Image.open(path).convert("RGB")
    max_w, max_h = int(925 * scale), int(610 * scale)
    source.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    card = Image.new("RGBA", (source.width + 28, source.height + 28), (255, 255, 255, 0))
    shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded(sd, (8, 12, card.width - 4, card.height - 2), 26, (38, 51, 42, 42))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    card.alpha_composite(shadow)
    cd = ImageDraw.Draw(card)
    rounded(cd, (0, 0, card.width - 14, card.height - 14), 24, (255, 255, 252, 255), (220, 226, 216, 255), 2)
    inner = source.convert("RGBA")
    card.alpha_composite(inner, (14, 14))
    return card


def compose(t: float) -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # A quiet paper texture and hairline motif that echoes the reader themes.
    for i in range(9):
        alpha = 11 if i % 2 else 8
        draw.ellipse((20 + i * 50, 1150 - i * 46, 970 + i * 18, 2050 - i * 20), outline=(83, 130, 98, alpha), width=2)
    draw.rectangle((0, 0, WIDTH, 13), fill=(45, 106, 79, 255))

    if t < 4.2:
        draw_centered(draw, "读着读着", 360, font(46), MUTED)
        draw_centered(draw, "人物、前因后果\n全散了？", 458, font(82, serif=True), INK, max_width=860, gap=24)
        draw_centered(draw, "不是你记性不好。\n是阅读缺少一条回去的路。", 790, font(38), MUTED, max_width=760, gap=18)
        draw_centered(draw, "书脉", 1420, font(72, serif=True), ACCENT)
        draw_centered(draw, "读得清脉络，记得住来处", 1518, font(33), MUTED)

    elif t < 9.0:
        local = t - 4.2
        title_y = 145
        draw_centered(draw, "你的书架，不只收藏书", title_y, font(58, serif=True), INK)
        draw_centered(draw, "也记住每一次读到的地方", title_y + 92, font(36), MUTED)
        card = source_card(ROOT / "bookshelf.png", 1.02, 0, 0)
        wobble = int(math.sin(local * 1.4) * 8)
        layer.alpha_composite(card, ((WIDTH - card.width) // 2, 420 + wobble))
        draw_centered(draw, "导入书籍 · 分类 · 恢复上次阅读", 1450, font(33), ACCENT)

    elif t < 16.5:
        local = t - 9.0
        draw_centered(draw, "隔了几天再回来", 118, font(38), MUTED)
        draw_centered(draw, "不必从头翻找", 184, font(62, serif=True), INK)
        card = source_card(ROOT / "reader-recovery.png", 0.86, 0, 0)
        drift = int((1 - math.cos(local * 0.7)) * 12)
        layer.alpha_composite(card, ((WIDTH - card.width) // 2, 355 + drift))
        rounded(draw, (104, 1470, 976, 1620), 28, (232, 241, 233, 238))
        draw_centered(draw, "AI 只带你接回理解当前页所需的前情", 1503, font(31), ACCENT, max_width=800)

    elif t < 22.0:
        local = t - 16.5
        draw_centered(draw, "回到正文", 130, font(62, serif=True), INK)
        draw_centered(draw, "重点、人物、事件与证据，都留在阅读里", 224, font(34), MUTED, max_width=900)
        card = source_card(ROOT / "reader-page.png", 0.92, 0, 0)
        x = (WIDTH - card.width) // 2 + int(math.sin(local * 0.5) * 9)
        layer.alpha_composite(card, (x, 400))
        draw_centered(draw, "不是更长的总结，而是更准确的回忆", 1492, font(36), ACCENT, max_width=880)

    else:
        local = t - 22.0
        draw_centered(draw, "书脉", 300, font(92, serif=True), INK)
        draw_centered(draw, "读得清脉络，记得住来处", 418, font(42), ACCENT)
        rounded(draw, (150, 710, 930, 960), 36, (237, 243, 235, 255), (214, 226, 213, 255), 2)
        draw_centered(draw, "一个会记住阅读上下文的\n开源 AI 阅读器", 770, font(48), INK, max_width=700, gap=20)
        draw_centered(draw, "github.com/anti-ai-member/booktrace-ai", 1190, font(30), MUTED)
        draw_centered(draw, "欢迎试读，也欢迎一起把它做对。", 1345, font(36), ACCENT)

    canvas = Image.alpha_composite(canvas.convert("RGBA"), layer).convert("RGB")
    return canvas


def main():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    writer = imageio_ffmpeg.write_frames(
        str(OUT),
        (WIDTH, HEIGHT),
        fps=FPS,
        codec="libx264",
        pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p",
        macro_block_size=1,
        output_params=["-movflags", "+faststart", "-crf", "19"],
    )
    writer.send(None)
    duration = 27
    try:
        for index in range(duration * FPS):
            frame = compose(index / FPS)
            writer.send(frame.tobytes())
    finally:
        writer.close()
    print(OUT)


if __name__ == "__main__":
    main()
