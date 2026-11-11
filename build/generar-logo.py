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



def white_symbol(sym, origin, env=(686, 314, 1074, 558)):
    """Versión BLANCA del símbolo (para usar sobre azul): la C en blanco y el sobre en blanco con sus líneas azules transparentes."""
    arr = np.asarray(sym).astype(np.float32)
    a = arr[..., 3] / 255.0
    lum = (0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]) / 255.0
    x0, y0, x1, y1 = env[0] - origin[0], env[1] - origin[1], env[2] - origin[0], env[3] - origin[1]
    alpha = a * np.clip((0.93 - lum) / 0.08, 0, 1)   # lo casi blanco de fuera del sobre (brillos del original) queda transparente: solo la C es blanca
    sl = (slice(max(0, y0), y1), slice(max(0, x0), x1))
    alpha[sl] = a[sl] * np.clip((lum[sl] - 0.55) / 0.30, 0, 1)   # en el sobre: lo claro es blanco, las líneas oscuras se vacían
    out = np.zeros(arr.shape, dtype=np.uint8); out[..., :3] = 255; out[..., 3] = (alpha * 255).astype('uint8')
    return Image.fromarray(out, 'RGBA')


def blue_gradient(w, h, c0=(0, 170, 255), c1=(0, 62, 196)):
    """Degradado azul de la marca (de arriba-izquierda a abajo-derecha)."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32); t = np.clip((x / max(w - 1, 1) * 0.45 + y / max(h - 1, 1) * 0.55), 0, 1)[..., None]
    rgb = (np.array(c0, dtype=np.float32) * (1 - t) + np.array(c1, dtype=np.float32) * t).astype('uint8')
    return Image.fromarray(np.dstack([rgb, np.full((h, w), 255, 'uint8')]), 'RGBA')


def blue_tile(size, radius=0.22, content=0.64, rounded=True):
    """Icono de app: baldosa azul con el símbolo en blanco."""
    t = blue_gradient(size, size)
    if rounded:
        m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius), fill=255); t.putalpha(m)
    return center(t, fit(symbol_white, int(size * content), int(size * content)))

# ---- piezas ----
SYMBOL_ROWS = 731  # por debajo empieza la palabra "CasaMail"
sym_box = trim_box(src, rows=(0, SYMBOL_ROWS), pad=10)
sym_rgb = src.crop((sym_box[0], sym_box[1], sym_box[2], min(sym_box[3], SYMBOL_ROWS)))
symbol = to_rgba(sym_rgb)                      # símbolo con fondo transparente
full_box = trim_box(src, pad=24)
full_rgb = src.crop(full_box)                  # logo completo (símbolo + nombre) sobre blanco
full = to_rgba(full_rgb)                       # logo completo, fondo transparente
symbol_white = white_symbol(symbol, (sym_box[0], sym_box[1]))   # símbolo blanco para fondos azules/oscuros



def tile(size, radius=0.22, fill=(255, 255, 255, 255), content=0.64):
    """Icono de app: baldosa blanca con esquinas redondeadas y el símbolo en el centro."""
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(t).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius), fill=fill)
    return center(t, fit(symbol, int(size * content), int(size * content)))


# Logo completo en blanco (símbolo + nombre) para fondos azules
fw = Image.new('RGBA', full_rgb.size, (0, 0, 0, 0))
fw.alpha_composite(symbol_white, (sym_box[0] - full_box[0], sym_box[1] - full_box[1]))
ta = np.asarray(full_rgb).astype(np.float32); tl = (0.299 * ta[..., 0] + 0.587 * ta[..., 1] + 0.114 * ta[..., 2]) / 255.0
ty = SYMBOL_ROWS - full_box[1]
txt_alpha = np.zeros(tl.shape, np.float32); txt_alpha[ty:] = np.clip((0.97 - tl[ty:]) / 0.55, 0, 1)
tw = np.zeros(ta.shape[:2] + (4,), np.uint8); tw[..., :3] = 255; tw[..., 3] = (txt_alpha * 255).astype('uint8')
fw.alpha_composite(Image.fromarray(tw, 'RGBA'))
full_white = fw

# Escritorio / instaladores: baldosa AZUL con el símbolo blanco
blue_tile(1024).save(P('build', 'icon.png'))
center(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), fit(symbol, 240, 240)).save(P('build', 'tray.png'))
full.save(P('build', 'logo.png'))                                   # logo completo con fondo TRANSPARENTE
src.crop(full_box).save(P('build', 'logo-fondo-blanco.png'))        # el mismo sobre blanco (por si hace falta)
full_white.save(P('build', 'logo-blanco.png'))                      # para fondos azules u oscuros
g = blue_gradient(1600, 900); g.alpha_composite(fit(full_white, 1300, 760).copy() if False else center(Image.new('RGBA', (1600, 900), (0, 0, 0, 0)), fit(full_white, 1300, 760))); g.save(P('build', 'logo-azul.png'))
center(Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)), fit(symbol, 1000, 1000)).save(P('build', 'mark.png'))
if os.path.exists(P('build', 'logo-transparente.png')): os.remove(P('build', 'logo-transparente.png'))

# Interfaz web: símbolo de color (tema claro) y símbolo blanco (tema oscuro), sin cajas blancas
center(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), fit(symbol, 248, 248)).save(P('public', 'mark.png'))
center(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), fit(symbol_white, 248, 248)).save(P('public', 'mark-claro.png'))
blue_tile(256).save(P('public', 'icon-app.png'))   # pestaña del navegador y notificaciones: baldosa azul

# Android: lanzador (baldosa azul) y primer plano del icono adaptable (símbolo blanco sobre degradado azul)
RES = P('android', 'app', 'src', 'main', 'res')
for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    blue_tile(1024).resize((px, px), Image.LANCZOS).save(os.path.join(RES, f'mipmap-{d}', 'ic_launcher.png'))
for d, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    center(Image.new('RGBA', (px, px), (0, 0, 0, 0)), fit(symbol_white, int(px * 0.58), int(px * 0.58))).save(os.path.join(RES, f'mipmap-{d}', 'ic_launcher_foreground.png'))
open(os.path.join(RES, 'drawable', 'ic_launcher_background.xml'), 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<!-- Fondo del icono adaptable: degradado azul de la marca -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#00AAFF" android:endColor="#003EC4" />
</shape>
''') if os.makedirs(os.path.join(RES, 'drawable'), exist_ok=True) is None else None

# Google Play: icono 512 y gráfico de funciones en azul
blue_tile(1024, rounded=False).resize((512, 512), Image.LANCZOS).save(P('android', 'play', 'icon-512.png'))   # Play aplica sus propias esquinas
gf = blue_gradient(1024, 500); gf.alpha_composite(center(Image.new('RGBA', (1024, 500), (0, 0, 0, 0)), fit(full_white, 940, 470))); gf.convert('RGB').save(P('android', 'play', 'feature-graphic-1024x500.png'))
print('logo listo:', symbol.size, 'símbolo;', full.size, 'completo')
