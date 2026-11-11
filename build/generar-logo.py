#!/usr/bin/env python3
"""Genera todos los archivos de logo de CasaMail a partir de la imagen original (build/fuente/logo-casamail.jpg).
Uso (desde la raíz del repo):  python3 build/generar-logo.py      Requiere: Pillow y numpy."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'build', 'fuente', 'logo-casamail.jpg')
P = lambda *a: os.path.join(ROOT, *a)

src = Image.open(SRC).convert('RGB')
W, H = src.size


def trim_box(img, thr=235, pad=0, rows=None):
    a = np.asarray(img).astype(int)
    nw = a.min(axis=2) < thr
    if rows:
        nw[rows[1]:] = False
    ys, xs = np.where(nw)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad))


def to_rgba(img, thr=238):
    """Quita el fondo blanco conectado al borde (lo de dentro del dibujo, como el brillo del sobre, se conserva) y suaviza el contorno."""
    a = np.asarray(img).astype(np.float32)
    near = np.pad(a.min(axis=2) >= thr, 1, constant_values=True)
    L = Image.fromarray((near * 255).astype('uint8')).copy()
    ImageDraw.floodfill(L, (0, 0), 128, thresh=0)
    bg = (np.asarray(L) == 128)[1:-1, 1:-1]
    alpha = Image.fromarray(np.where(bg, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.9))
    al = np.asarray(alpha).astype(np.float32) / 255.0
    al = np.where(bg & (al < 0.5), 0, np.maximum(al, np.where(bg, 0, 1)))  # el interior no se aclara
    # quita el halo blanco del borde: color = (c - blanco*(1-alpha)) / alpha
    out = a.copy()
    edge = (al > 0) & (al < 1)
    for ch in range(3):
        c = out[..., ch]
        c[edge] = np.clip((c[edge] - 255 * (1 - al[edge])) / np.maximum(al[edge], 0.05), 0, 255)
    rgba = np.dstack([out, al * 255]).astype('uint8')
    return Image.fromarray(rgba, 'RGBA')


def fit(img, w, h):
    k = min(w / img.width, h / img.height)
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


def center(canvas, img):
    canvas.alpha_composite(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas


# ---- piezas ----
SYMBOL_ROWS = 731  # por debajo empieza la palabra "CasaMail"
sym_box = trim_box(src, rows=(0, SYMBOL_ROWS), pad=10)
sym_rgb = src.crop((sym_box[0], sym_box[1], sym_box[2], min(sym_box[3], SYMBOL_ROWS)))
symbol = to_rgba(sym_rgb)                      # símbolo con fondo transparente
full_box = trim_box(src, pad=24)
full_rgb = src.crop(full_box)                  # logo completo (símbolo + nombre) sobre blanco
full = to_rgba(full_rgb)                       # logo completo, fondo transparente


def tile(size, radius=0.22, fill=(255, 255, 255, 255), content=0.64):
    """Icono de app: baldosa blanca con esquinas redondeadas y el símbolo en el centro."""
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(t).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius), fill=fill)
    return center(t, fit(symbol, int(size * content), int(size * content)))


# Escritorio / instaladores
tile(1024).save(P('build', 'icon.png'))
center(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), fit(symbol, 240, 240)).save(P('build', 'tray.png'))
src.crop(full_box).save(P('build', 'logo.png'))
full.save(P('build', 'logo-transparente.png'))
center(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), fit(symbol, 1000, 1000)).save(P('build', 'mark.png'))

# Interfaz web (cabecera, bienvenida, pestaña del navegador, notificaciones)
center(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), fit(symbol, 248, 248)).save(P('public', 'mark.png'))

# Android: iconos de lanzador (legacy cuadrado redondeado + primer plano del icono adaptable)
for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    tile(1024).resize((px, px), Image.LANCZOS).save(P('android', 'app', 'src', 'main', 'res', f'mipmap-{d}', 'ic_launcher.png'))
for d, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    fg = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    center(fg, fit(symbol, int(px * 0.58), int(px * 0.58))).save(P('android', 'app', 'src', 'main', 'res', f'mipmap-{d}', 'ic_launcher_foreground.png'))

# Google Play
tile(1024).resize((512, 512), Image.LANCZOS).save(P('android', 'play', 'icon-512.png'))
fg = Image.new('RGB', (1024, 500), (255, 255, 255))
logo = fit(full_rgb, 940, 470); fg.paste(logo, ((1024 - logo.width) // 2, (500 - logo.height) // 2)); fg.save(P('android', 'play', 'feature-graphic-1024x500.png'))
print('logo listo:', symbol.size, 'símbolo;', full.size, 'completo')
