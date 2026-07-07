import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from logos import initials, placeholder_color, resolve_logo_path
from models import Fixture
from titling import MONTHS_NL, build_title

FONT_DIR = Path(__file__).parent / "assets" / "fonts"
HEADLINE_FONT = FONT_DIR / "BigShoulders-Bold.ttf"
CAPTION_FONT = FONT_DIR / "WorkSans-Regular.ttf"
CAPTION_FONT_BOLD = FONT_DIR / "WorkSans-Bold.ttf"

WIDTH = 1080
MARGIN = 64

BG_BLUE = (27, 48, 122)
BG_BLUE_DARK = (20, 36, 92)
DOT_PURPLE = (92, 62, 156)
RED = (185, 33, 41)
RED_DARK = (150, 24, 31)
WHITE = (255, 255, 255)
OFFWHITE = (223, 229, 248)

HEADER_HEIGHT = 330
FOOTER_HEIGHT = 110
TARGET_ROWS = 5
BASE_BLOCK_HEIGHT = 232
MIN_BLOCK_HEIGHT = 160
MAX_BLOCK_HEIGHT = 260

WEEKDAYS_NL = {
    1: "MAANDAG", 2: "DINSDAG", 3: "WOENSDAG", 4: "DONDERDAG",
    5: "VRIJDAG", 6: "ZATERDAG", 7: "ZONDAG",
}


def _fit_font(text: str, font_path: Path, max_width: int, start_size: int, min_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size > min_size:
        font = ImageFont.truetype(str(font_path), size)
        if font.getlength(text) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(str(font_path), min_size)


def _draw_halftone_background(width: int, height: int) -> Image.Image:
    img = Image.new("RGB", (width, height), BG_BLUE)
    # subtle vertical gradient toward a darker blue at the bottom
    grad = Image.new("L", (1, height))
    for y in range(height):
        grad.putpixel((0, y), int(255 * (y / height) * 0.55))
    grad = grad.resize((width, height))
    dark_layer = Image.new("RGB", (width, height), BG_BLUE_DARK)
    img = Image.composite(dark_layer, img, grad)

    dots = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ddraw = ImageDraw.Draw(dots)
    spacing = 34
    rng = random.Random(42)
    for row_i, y in enumerate(range(-spacing, height + spacing, spacing)):
        offset = (spacing // 2) if row_i % 2 else 0
        for x in range(-spacing, width + spacing, spacing):
            # halftone effect: dots are bigger near the top, fading out toward the middle
            fade = max(0.0, 1 - (y / (height * 0.6)))
            r = 2 + fade * 5.5
            if r < 1.2:
                continue
            jx = x + offset + rng.uniform(-3, 3)
            jy = y + rng.uniform(-3, 3)
            alpha = int(70 + 90 * fade)
            ddraw.ellipse([jx - r, jy - r, jx + r, jy + r], fill=(*DOT_PURPLE, alpha))
    img.paste(Image.alpha_composite(img.convert("RGBA"), dots).convert("RGB"), (0, 0))
    return img


def _draw_corner_stripes(img: Image.Image) -> None:
    width, height = img.size
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    def stripe_wedge(anchor_x: int, anchor_y: int, flip_x: int, flip_y: int, size: int) -> None:
        # solid dark navy triangle at the very corner
        od.polygon(
            [
                (anchor_x, anchor_y),
                (anchor_x + flip_x * size, anchor_y),
                (anchor_x, anchor_y + flip_y * size),
            ],
            fill=(*BG_BLUE_DARK, 255),
        )
        # a fan of parallel diagonal red/white stripes just inside the triangle
        n_stripes = 6
        stripe_w = 10
        gap = 16
        for i in range(n_stripes):
            offset = size * 0.55 + i * (stripe_w + gap)
            color = RED if i % 2 == 0 else WHITE
            x0 = anchor_x + flip_x * offset
            y0 = anchor_y
            x1 = anchor_x
            y1 = anchor_y + flip_y * offset
            od.line([(x0, y0), (x1, y1)], fill=(*color, 255), width=stripe_w)

    stripe_wedge(width, 0, -1, 1, 210)
    stripe_wedge(0, height, 1, -1, 210)
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def _rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def _paste_logo(canvas: Image.Image, team_name: str, center: tuple[int, int], diameter: int) -> None:
    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, diameter, diameter], fill=255)

    logo_path = resolve_logo_path(team_name)
    if logo_path is not None:
        logo = Image.open(logo_path).convert("RGBA")
        side = min(logo.size)
        logo = logo.crop((0, 0, side, side)).resize((diameter, diameter))
        badge = logo
    else:
        from logos import slugify
        color = placeholder_color(slugify(team_name))
        badge = Image.new("RGBA", (diameter, diameter), (*color, 255))
        bd = ImageDraw.Draw(badge)
        label = initials(team_name)
        font = _fit_font(label, CAPTION_FONT_BOLD, diameter * 0.72, int(diameter * 0.42), 10)
        bbox = bd.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        bd.text((diameter / 2 - tw / 2 - bbox[0], diameter / 2 - th / 2 - bbox[1]), label, font=font, fill=WHITE)

    ring = Image.new("RGBA", (diameter + 8, diameter + 8), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, diameter + 8, diameter + 8], fill=(255, 255, 255, 255))
    ring.paste(badge, (4, 4), mask)
    cx, cy = center
    canvas.paste(ring, (cx - (diameter + 8) // 2, cy - (diameter + 8) // 2), ring)


def render_poster(fixtures: list[Fixture], category_label: str) -> Image.Image:
    n = len(fixtures)
    scale = min(1.0, TARGET_ROWS / max(n, 1))
    block_height = max(MIN_BLOCK_HEIGHT, min(MAX_BLOCK_HEIGHT, int(BASE_BLOCK_HEIGHT * scale)))
    height = HEADER_HEIGHT + block_height * n + FOOTER_HEIGHT

    canvas = _draw_halftone_background(WIDTH, height)
    _draw_corner_stripes(canvas)
    draw = ImageDraw.Draw(canvas)

    line1, line2 = build_title(fixtures, category_label)
    f_line1 = ImageFont.truetype(str(HEADLINE_FONT), 66)
    f_line2 = ImageFont.truetype(str(HEADLINE_FONT), 66)
    draw.text((MARGIN, 70), line1, font=f_line1, fill=WHITE)
    draw.text((MARGIN, 150), line2, font=f_line2, fill=WHITE)

    cap1_size = max(20, int(30 * scale))
    cap2_size = max(18, int(26 * scale))
    pill_h = max(56, int(84 * scale))
    logo_d = max(56, int(92 * scale))
    pill_font_size = max(18, int(30 * scale))
    vs_d = max(40, int(58 * scale))

    y = HEADER_HEIGHT
    for fx in fixtures:
        block_top = y
        cap1 = f"{WEEKDAYS_NL[fx.match_date.isoweekday()]} {fx.match_date.day} {MONTHS_NL[fx.match_date.month]}"
        f_cap1 = ImageFont.truetype(str(CAPTION_FONT_BOLD), cap1_size)
        w = draw.textlength(cap1, font=f_cap1)
        draw.text((WIDTH / 2 - w / 2, block_top + 6), cap1, font=f_cap1, fill=OFFWHITE)

        parts = [p for p in [fx.time, fx.venue] if p]
        cap2 = " ".join(parts) if parts else ""
        f_cap2 = ImageFont.truetype(str(CAPTION_FONT), cap2_size)
        w2 = draw.textlength(cap2, font=f_cap2)
        draw.text((WIDTH / 2 - w2 / 2, block_top + 6 + cap1_size + 6), cap2, font=f_cap2, fill=OFFWHITE)

        row_y = block_top + cap1_size + cap2_size + 34
        row_center_y = row_y + pill_h // 2
        pill_gap = 46
        pill_w = (WIDTH - 2 * MARGIN - pill_gap) // 2

        left_box = [MARGIN, row_y, MARGIN + pill_w, row_y + pill_h]
        right_box = [WIDTH - MARGIN - pill_w, row_y, WIDTH - MARGIN, row_y + pill_h]
        _rounded_rect(draw, left_box, pill_h // 2, RED)
        _rounded_rect(draw, right_box, pill_h // 2, RED)

        text_pad = 14
        # safe zone excludes the logo overlap at the outer edge of each pill
        home_zone = (left_box[0] + logo_d * 0.55, left_box[2] - text_pad)
        away_zone = (right_box[0] + text_pad, right_box[2] - logo_d * 0.55)
        home_zone_w = home_zone[1] - home_zone[0]
        away_zone_w = away_zone[1] - away_zone[0]

        home_txt = fx.home_team.upper()
        away_txt = fx.away_team.upper()
        home_font = _fit_font(home_txt, CAPTION_FONT_BOLD, home_zone_w, pill_font_size, 12)
        away_font = _fit_font(away_txt, CAPTION_FONT_BOLD, away_zone_w, pill_font_size, 12)

        def _draw_centered(text: str, font: ImageFont.FreeTypeFont, zone_x: float, zone_w: float) -> None:
            bbox = draw.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            x = zone_x + (zone_w - tw) / 2 - bbox[0]
            y = row_center_y - th / 2 - bbox[1]
            draw.text((x, y), text, font=font, fill=WHITE)

        _draw_centered(home_txt, home_font, home_zone[0], home_zone_w)
        _draw_centered(away_txt, away_font, away_zone[0], away_zone_w)

        vs_box = [WIDTH / 2 - vs_d / 2, row_center_y - vs_d / 2, WIDTH / 2 + vs_d / 2, row_center_y + vs_d / 2]
        draw.ellipse(vs_box, fill=WHITE)
        f_vs = ImageFont.truetype(str(CAPTION_FONT_BOLD), int(vs_d * 0.42))
        vs_w = draw.textlength("VS", font=f_vs)
        draw.text((WIDTH / 2 - vs_w / 2, row_center_y - vs_d * 0.24), "VS", font=f_vs, fill=RED_DARK)

        _paste_logo(canvas, fx.home_team, (left_box[0] + 4, row_center_y), logo_d)
        _paste_logo(canvas, fx.away_team, (right_box[2] - 4, row_center_y), logo_d)

        y += block_height

    footer_font = ImageFont.truetype(str(CAPTION_FONT_BOLD), 30)
    footer_text = "www.vvpekela.nl"
    fw = draw.textlength(footer_text, font=footer_font)
    draw.text((WIDTH / 2 - fw / 2, height - FOOTER_HEIGHT / 2 - 18), footer_text, font=footer_font, fill=WHITE)

    return canvas
