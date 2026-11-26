"""Gera os ícones do PWA e do Android a partir do logotipo oficial da Massa FM Toledo 98.5.

O logotipo (public/assets/logo-massa-fm-toledo.png, quadrado com fundo laranja) é apenas
redimensionado e centralizado sobre o mesmo laranja: nunca é recortado, distorcido ou redesenhado.

Uso (precisa do Pillow):  python scripts/generate_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LOGO = Image.open(ROOT / "public/assets/logo-massa-fm-toledo.png").convert("RGB")
ORANGE = LOGO.getpixel((0, 0))  # o laranja do próprio arquivo oficial
RES = ROOT / "android/app/src/main/res"


def canvas(width: int, height: int, logo_size: int) -> Image.Image:
    """Fundo laranja com o logotipo centralizado no tamanho pedido."""
    img = Image.new("RGB", (width, height), ORANGE)
    logo = LOGO.resize((logo_size, logo_size), Image.LANCZOS)
    img.paste(logo, ((width - logo_size) // 2, (height - logo_size) // 2))
    return img


def round_icon(size: int) -> Image.Image:
    """Ícone redondo: o mesmo quadrado, com máscara circular suavizada."""
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    out = canvas(size, size, round(size * 0.86)).convert("RGBA")
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


# PWA (o logotipo já tem margem suficiente para a área segura dos ícones "maskable").
canvas(192, 192, 192).save(ROOT / "public/assets/icon-192.png", optimize=True)
canvas(512, 512, 512).save(ROOT / "public/assets/icon-512.png", optimize=True)

# Android: ícones clássicos, redondos e o primeiro plano do ícone adaptativo
# (logotipo em 62% da tela, dentro da área segura de 66%).
for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    folder = RES / f"mipmap-{density}"
    canvas(size, size, size).save(folder / "ic_launcher.png", optimize=True)
    round_icon(size).save(folder / "ic_launcher_round.png", optimize=True)
    fg = round(size * 108 / 48)
    canvas(fg, fg, round(fg * 0.62)).save(folder / "ic_launcher_foreground.png", optimize=True)

# Telas de abertura: laranja com o logotipo ao centro, sem ampliar além do tamanho original.
for splash in sorted(RES.glob("drawable*/splash.png")):
    width, height = Image.open(splash).size
    canvas(width, height, min(512, round(min(width, height) * 0.5))).save(splash, optimize=True)

print("ícones gerados; laranja do logotipo: #%02x%02x%02x" % ORANGE)
