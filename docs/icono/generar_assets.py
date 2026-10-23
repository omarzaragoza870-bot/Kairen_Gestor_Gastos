"""Genera todos los íconos de Kairen (iOS, Android, web) desde la geometría final.

Uso: python generar_assets.py <carpeta_final> <raiz_proyecto> <carpeta_trabajo>
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

FINAL, PROYECTO, TRABAJO = sys.argv[1:4]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
g = json.load(open(os.path.join(FINAL, 'geometria.json')))
D, CX, CY, RD = g['d'], g['cx'], g['cy'], g['rd']
os.makedirs(TRABAJO, exist_ok=True)

BLANCO, NEGRO, VERDE = '#F5F5F7', '#0A0A0A', '#30D158'
VISIBLE = 1024 * 18 / 108          # recorte del área visible del ícono adaptable (72 de 108 dp)


ESCALA_ANDROID = 0.82            # en Android la marca ocupa ~52 dp de los 72 visibles (guía: ~48-52 dp)


def svg(fondo=None, marca=BLANCO, punto=VERDE, vb='0 0 1024 1024', escala=1.0):
    rect = f'<rect x="-2000" y="-2000" width="6000" height="6000" fill="{fondo}"/>' if fondo else ''
    g = f'<g transform="translate(512 512) scale({escala}) translate(-512 -512)">'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="1024" height="1024">{rect}{g}'
            f'<path d="{D}" fill="{marca}"/><circle cx="{CX}" cy="{CY}" r="{RD}" fill="{punto}"/></g></svg>')


def render(nombre, contenido_svg, transparente):
    """Renderiza un SVG a PNG 1024x1024 con Chrome (alfa real si transparente)."""
    ruta_svg = os.path.join(TRABAJO, nombre + '.svg')
    ruta_html = os.path.join(TRABAJO, nombre + '.html')
    ruta_png = os.path.join(TRABAJO, nombre + '.png')
    open(ruta_svg, 'w', encoding='utf-8').write(contenido_svg)
    open(ruta_html, 'w', encoding='utf-8').write(
        f'<!doctype html><html><body style="margin:0;background:transparent">'
        f'<img src="{nombre}.svg" width="1024" height="1024" style="display:block"></body></html>')
    args = [CHROME, '--headless=old', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
            '--window-size=1024,1024', '--virtual-time-budget=1000', f'--screenshot={ruta_png}']
    if transparente:
        args.append('--default-background-color=00000000')
    args.append('file:///' + ruta_html.replace('\\', '/'))
    subprocess.run(args, check=True, capture_output=True)
    im = Image.open(ruta_png).convert('RGBA')
    assert im.size == (1024, 1024), im.size
    return im


def escalar(im, lado):
    return im.resize((lado, lado), Image.LANCZOS)


def guardar(im, ruta, opaco=False):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    (im.convert('RGB') if opaco else im).save(ruta, optimize=True)
    print('  ', os.path.relpath(ruta, PROYECTO), im.size)


def esquinas(im, radio_frac):
    mascara = Image.new('L', im.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=int(im.size[0] * radio_frac), fill=255)
    out = im.copy(); out.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), mascara))
    return out


def circulo(im):
    mascara = Image.new('L', im.size, 0)
    ImageDraw.Draw(mascara).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = im.copy(); out.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), mascara))
    return out


print('Renderizando…')
completo = render('completo', svg(fondo=NEGRO), False)                                  # ícono a sangre
frente = render('frente', svg(escala=ESCALA_ANDROID), True)                                                   # capa frontal adaptable
recorte = render('recorte', svg(fondo=NEGRO, vb=f'{VISIBLE} {VISIBLE} {1024 - 2 * VISIBLE} {1024 - 2 * VISIBLE}', escala=ESCALA_ANDROID), False)
tintado = render('tintado', svg(fondo='#000000', marca='#FFFFFF', punto='#FFFFFF'), False)  # iOS 18 tintado

res = os.path.join(PROYECTO, 'android', 'app', 'src', 'main', 'res')
ios = os.path.join(PROYECTO, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
pub = os.path.join(PROYECTO, 'public')

print('iOS')
guardar(completo, os.path.join(ios, 'AppIcon-512@2x.png'), opaco=True)
guardar(completo, os.path.join(ios, 'AppIcon-dark.png'), opaco=True)
guardar(tintado, os.path.join(ios, 'AppIcon-tinted.png'), opaco=True)

print('Android')
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in DENS.items():
    carpeta = os.path.join(res, f'mipmap-{d}')
    guardar(escalar(frente, round(108 * k)), os.path.join(carpeta, 'ic_launcher_foreground.png'))
    legado = escalar(recorte, round(48 * k))
    guardar(esquinas(legado, 0.18), os.path.join(carpeta, 'ic_launcher.png'))
    guardar(circulo(legado), os.path.join(carpeta, 'ic_launcher_round.png'))

print('Pantallas de arranque (Android)')
marca_sola = frente
for carpeta in sorted(os.listdir(res)):
    if not carpeta.startswith(('drawable-port', 'drawable-land')):
        continue
    ruta = os.path.join(res, carpeta, 'splash.png')
    if not os.path.exists(ruta):
        continue
    w, h = Image.open(ruta).size
    lienzo = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    lado = int(min(w, h) * 0.62 / ESCALA_ANDROID)   # la marca ocupa ~33 % del lado corto (la capa trae margen)
    m = escalar(marca_sola, lado)
    lienzo.alpha_composite(m, ((w - lado) // 2, (h - lado) // 2))
    guardar(lienzo, ruta, opaco=True)

print('Web / PWA')
guardar(esquinas(escalar(completo, 32), 0.22), os.path.join(pub, 'favicon-32.png'))
guardar(escalar(completo, 192), os.path.join(pub, 'favicon-192.png'), opaco=True)
guardar(escalar(completo, 512), os.path.join(pub, 'favicon-512.png'), opaco=True)
guardar(escalar(completo, 512), os.path.join(pub, 'favicon.png'), opaco=True)
guardar(escalar(completo, 180), os.path.join(pub, 'apple-touch-icon.png'), opaco=True)
# SVG para pestañas modernas: ícono redondeado con el recorte visible
vb = f'{VISIBLE * 0.6} {VISIBLE * 0.6} {1024 - 1.2 * VISIBLE} {1024 - 1.2 * VISIBLE}'
lado_vb = 1024 - 1.2 * VISIBLE
favicon_svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
               f'<rect x="{VISIBLE * 0.6}" y="{VISIBLE * 0.6}" width="{lado_vb}" height="{lado_vb}" rx="{lado_vb * 0.22}" fill="{NEGRO}"/>'
               f'<path d="{D}" fill="{BLANCO}"/><circle cx="{CX}" cy="{CY}" r="{RD}" fill="{VERDE}"/></svg>')
open(os.path.join(pub, 'favicon.svg'), 'w', encoding='utf-8').write(favicon_svg)
print('   public/favicon.svg')
print('listo')
