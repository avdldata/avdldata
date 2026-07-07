import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from logos import initials, placeholder_color, resolve_logo_path
from models import Fixture
from titling import MONTHS_NL, build_title

FONT_DIR = Path(__file__).parent / "assets" / "fonts"
HEADLINE_FONT = FONT_DIR / "Poppins-ExtraBold.ttf"
PILL_FONT = FONT_DIR / "Poppins-Bold.ttf"
CAPTION_FONT = FONT_DIR / "Poppins-Regular.ttf"
CAPTION_FONT_BOLD = FONT_DIR / "Poppins-SemiBold.ttf"

WIDTH = 1080
MARGIN = 64

# Exact colors sampled from the club's own Canva background export.
BG_BLUE = (44, 89, 165)        # #2C59A5
DOT_MAGENTA = (124, 4, 130)    # #7C0482
RED = (186, 10, 0)             # #BA0A00 (confirmed by club)
VS_TEXT_NAVY = (24, 44, 99)    # #182C63
WHITE = (255, 255, 255)
OFFWHITE = (223, 229, 248)

HEADER_HEIGHT = 330
FOOTER_HEIGHT = 110
TARGET_ROWS = 4  # matches the club's own reference template
BASE_BLOCK_HEIGHT = 225
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


def _diamond_halftone_layer(width: int, height: int, corners: list[tuple[int, int]]) -> Image.Image:
    """Rotated-square (diamond) halftone, fading out with distance from the given corners."""
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    spacing = 28
    diamond_r = 10
    falloff = max(width, height) * 0.42
    row_i = 0
    for gy in range(-spacing, height + spacing, spacing):
        offset = (spacing // 2) if row_i % 2 else 0
        row_i += 1
        for gx in range(-spacing, width + spacing, spacing):
            cx, cy = gx + offset, gy
            d = min(math.hypot(cx - ax, cy - ay) for ax, ay in corners)
            t = max(0.0, 1 - d / falloff)
            if t <= 0.05:
                continue
            s = diamond_r * (0.6 + 0.4 * t)
            alpha = int(255 * min(1.0, t))
            draw.polygon([(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)],
                         fill=(*DOT_MAGENTA, alpha))
    return layer


def _diagonal_bar(draw: ImageDraw.ImageDraw, cx: float, cy: float, length: float, width: float, color) -> None:
    angle = math.radians(45)
    dx, dy = math.cos(angle) * length / 2, math.sin(angle) * length / 2
    draw.line([(cx - dx, cy + dy), (cx + dx, cy - dy)], fill=color, width=int(width))


def _chevron_block(draw: ImageDraw.ImageDraw, cx: float, cy: float, n_bars: int = 2,
                    bar_len: float = 130, bar_w: float = 34, gap: float = 30, color=WHITE) -> None:
    # bars are stacked perpendicular to their own 45-degree direction, so they read as
    # parallel stripes rather than one continuous line
    perp = (1 / math.sqrt(2), 1 / math.sqrt(2))
    step = bar_w + gap
    for i in range(n_bars):
        offset = (i - (n_bars - 1) / 2) * step
        ox, oy = cx + perp[0] * offset, cy + perp[1] * offset
        _diagonal_bar(draw, ox, oy, bar_len, bar_w, color)


def _dash_cluster(draw: ImageDraw.ImageDraw, center_x: float, y: float, n: int = 7,
                   dash_len: float = 46, dash_w: float = 11, gap: float = 20, color=RED) -> None:
    step = (dash_len * 0.72 + gap)
    start_x = center_x - step * (n - 1) / 2
    for i in range(n):
        cx = start_x + i * step
        _diagonal_bar(draw, cx, y, dash_len, dash_w, color)


def _draw_background(width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), BG_BLUE)
    diamonds = _diamond_halftone_layer(width, height, corners=[(0, 0), (width, height)])
    canvas = Image.alpha_composite(canvas.convert("RGBA"), diamonds)
    draw = ImageDraw.Draw(canvas)

    # corner chevron flourishes (top-right / bottom-left), plus echoes further down/up the edges
    _chevron_block(draw, width - 40, 40, n_bars=3, bar_len=105, bar_w=24, gap=16)
    _chevron_block(draw, 40, height - 40, n_bars=3, bar_len=105, bar_w=24, gap=16)
    _chevron_block(draw, 20, height * 0.32, n_bars=2, bar_len=110, bar_w=24, gap=18)
    _chevron_block(draw, width - 20, height * 0.68, n_bars=2, bar_len=110, bar_w=24, gap=18)

    # short red dash accents along the very top and bottom edges
    _dash_cluster(draw, width * 0.52, 18)
    _dash_cluster(draw, width * 0.48, height - 18)

    return canvas.convert("RGB")


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
        font = _fit_font(label, PILL_FONT, diameter * 0.72, int(diameter * 0.42), 10)
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

    canvas = _draw_background(WIDTH, height)
    draw = ImageDraw.Draw(canvas)

    line1, line2 = build_title(fixtures, category_label)
    title_max_width = WIDTH - 2 * MARGIN - 70
    f_line1 = _fit_font(line1, HEADLINE_FONT, title_max_width, 80, 42)
    f_line2 = _fit_font(line2, HEADLINE_FONT, title_max_width, 80, 42)
    w1 = draw.textlength(line1, font=f_line1)
    w2 = draw.textlength(line2, font=f_line2)
    draw.text((WIDTH / 2 - w1 / 2, 66), line1, font=f_line1, fill=WHITE)
    draw.text((WIDTH / 2 - w2 / 2, 150), line2, font=f_line2, fill=WHITE)

    cap1_size = max(22, int(34 * scale))
    cap2_size = max(20, int(30 * scale))
    pill_h = max(60, int(92 * scale))
    logo_d = max(58, int(96 * scale))
    pill_font_size = min(max(22, int(44 * scale)), int(pill_h * 0.55))
    vs_d = max(42, int(60 * scale))

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
        # safe zone excludes the logo's reach into the pill (logo center sits 4px inside
        # the pill edge, radius logo_d/2, plus a fixed clearance) so text can never run under it
        logo_margin = logo_d / 2 + 4 + 16
        home_zone = (left_box[0] + logo_margin, left_box[2] - text_pad)
        away_zone = (right_box[0] + text_pad, right_box[2] - logo_margin)
        home_zone_w = home_zone[1] - home_zone[0]
        away_zone_w = away_zone[1] - away_zone[0]

        home_txt = fx.home_team.upper()
        away_txt = fx.away_team.upper()
        home_font = _fit_font(home_txt, PILL_FONT, home_zone_w, pill_font_size, 12)
        away_font = _fit_font(away_txt, PILL_FONT, away_zone_w, pill_font_size, 12)

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
        f_vs = ImageFont.truetype(str(PILL_FONT), int(vs_d * 0.42))
        vs_w = draw.textlength("VS", font=f_vs)
        draw.text((WIDTH / 2 - vs_w / 2, row_center_y - vs_d * 0.26), "VS", font=f_vs, fill=VS_TEXT_NAVY)

        _paste_logo(canvas, fx.home_team, (left_box[0] + 4, row_center_y), logo_d)
        _paste_logo(canvas, fx.away_team, (right_box[2] - 4, row_center_y), logo_d)

        y += block_height

    footer_font = ImageFont.truetype(str(CAPTION_FONT_BOLD), 34)
    footer_text = "www.vvpekela.nl"
    fw = draw.textlength(footer_text, font=footer_font)
    draw.text((WIDTH / 2 - fw / 2, height - FOOTER_HEIGHT / 2 - 18), footer_text, font=footer_font, fill=WHITE)

    return canvas
