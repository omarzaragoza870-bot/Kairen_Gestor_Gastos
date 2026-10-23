"""Geometría paramétrica del ícono "Anillo con orejas" (Kairen Finanzas).

Una sola figura: anillo abierto (hueco abajo a la izquierda) con dos orejas de
cachorro, más un punto central (la meta). Todo en un lienzo de 1024 que
representa la capa de 108 dp del ícono adaptable de Android; la zona segura es
un círculo de radio ~310 centrado en (512, 512).
"""
import math, json, sys, os

P = dict(
    R=248,          # radio exterior del anillo (antes 244)
    t=108,          # grosor del anillo (antes 104)
    gap=64,         # aire entre el anillo y el punto (antes 56)
    hueco=(110, 155),  # ángulos del hueco del anillo (grados, pantalla: 0=derecha, 90=abajo)
    ear_axis=26,    # inclinación de cada oreja respecto a la vertical
    ear_chord=198,  # ancho de la oreja donde toca el anillo (antes ~176, +12 %)
    ear_h=122,      # altura del vértice de la oreja sobre el anillo
    apex_r=47,      # redondeo de la punta (antes 40)
    fillet=32,      # redondeo cóncavo oreja-anillo (antes 28)
    seguro=308,     # radio máximo permitido desde (512,512)
)

def v(a, b): return (b[0] - a[0], b[1] - a[1])
def add(a, b): return (a[0] + b[0], a[1] + b[1])
def mul(a, k): return (a[0] * k, a[1] * k)
def norm(a):
    l = math.hypot(*a); return (a[0] / l, a[1] / l)
def polar(c, r, deg):
    a = math.radians(deg); return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
def ang(c, p): return math.degrees(math.atan2(p[1] - c[1], p[0] - c[0])) % 360
def f(n): return f'{n:.2f}'.rstrip('0').rstrip('.')
def pt(p): return f'{f(p[0])} {f(p[1])}'


def oreja(C, R, lado):
    """Devuelve la secuencia de segmentos de una oreja: puntos de tangencia y radios."""
    eje = 270 - P['ear_axis'] if lado == 'izq' else 270 + P['ear_axis']
    media = math.degrees(math.asin((P['ear_chord'] / 2) / R))
    b1 = polar(C, R, eje - media)      # base (en sentido horario, primero la de afuera en la izq.)
    b2 = polar(C, R, eje + media)
    apex = polar(C, R + P['ear_h'], eje)
    # Redondeo de la punta: círculo tangente a ambos lados
    d1, d2 = norm(v(apex, b1)), norm(v(apex, b2))
    medio = math.acos(max(-1, min(1, d1[0] * d2[0] + d1[1] * d2[1]))) / 2
    bis = norm(add(d1, d2))
    dc = P['apex_r'] / math.sin(medio)
    ac = add(apex, mul(bis, dc))
    tlen = P['apex_r'] / math.tan(medio)
    a1, a2 = add(apex, mul(d1, tlen)), add(apex, mul(d2, tlen))
    # Redondeo cóncavo entre cada lado y el círculo exterior
    def concavo(p_lado, d_hacia_base, base):
        # El centro del filete está a distancia R+fl de C y a fl de la recta (del lado de afuera de la oreja)
        fl = P['fillet']
        n = (-d_hacia_base[1], d_hacia_base[0])
        eje_dir = norm(v(C, apex))
        largo = math.hypot(*v(p_lado, base))   # el punto de tangencia debe quedar antes de la base
        mejores = []
        for s in (1, -1):
            nn = mul(n, s)
            q = add(p_lado, mul(nn, fl))      # punto de la recta desplazada
            # intersección de la recta desplazada (q + u*d) con el círculo radio R+fl
            dx, dy = q[0] - C[0], q[1] - C[1]
            b = 2 * (d_hacia_base[0] * dx + d_hacia_base[1] * dy)
            cc = dx * dx + dy * dy - (R + fl) ** 2
            disc = b * b - 4 * cc
            if disc < 0: continue
            for u in ((-b - math.sqrt(disc)) / 2, (-b + math.sqrt(disc)) / 2):
                fc = add(q, mul(d_hacia_base, u))
                t_lado = add(fc, mul(nn, -fl))
                t_circ = add(C, mul(norm(v(C, fc)), R))
                # válido si el punto en el lado está entre la punta y la base, y el centro queda fuera de la oreja
                proy = (t_lado[0] - p_lado[0]) * d_hacia_base[0] + (t_lado[1] - p_lado[1]) * d_hacia_base[1]
                dist_eje = abs((fc[0] - C[0]) * eje_dir[1] - (fc[1] - C[1]) * eje_dir[0])
                mejores.append((0 < proy < largo, dist_eje, fc, t_lado, t_circ))
        validos = [m for m in mejores if m[0]]
        validos.sort(key=lambda m: -m[1])   # el centro más alejado del eje = afuera de la oreja
        return validos[0][2:]
    fc1, lado1, circ1 = concavo(a1, d1, b1)
    fc2, lado2, circ2 = concavo(a2, d2, b2)
    return dict(eje=eje, circ1=circ1, lado1=lado1, a1=a1, a2=a2, ac=ac, lado2=lado2, circ2=circ2, apex=apex)


def construir(cy):
    C = (512, cy)
    R, t = P['R'], P['t']
    r = R - t
    rd = r - P['gap']
    m = (R + r) / 2
    fe, fs = P['hueco']           # el anillo va de fs (155°) en sentido horario hasta fe+360 (470°)
    oi, od = oreja(C, R, 'izq'), oreja(C, R, 'der')
    s = []
    p0 = polar(C, R, fs)
    s.append(f'M{pt(p0)}')
    def arco_ext(hacia, desde_ang):
        a_to = ang(C, hacia)
        delta = (a_to - desde_ang) % 360
        s.append(f'A{f(R)} {f(R)} 0 {1 if delta > 180 else 0} 1 {pt(hacia)}')
        return a_to
    a = fs
    for o in (oi, od):
        a = arco_ext(o['circ1'], a)
        s.append(f'A{f(P["fillet"])} {f(P["fillet"])} 0 0 0 {pt(o["lado1"])}')
        s.append(f'L{pt(o["a1"])}')
        s.append(f'A{f(P["apex_r"])} {f(P["apex_r"])} 0 0 1 {pt(o["a2"])}')
        s.append(f'L{pt(o["lado2"])}')
        s.append(f'A{f(P["fillet"])} {f(P["fillet"])} 0 0 0 {pt(o["circ2"])}')
        a = ang(C, o['circ2'])
    pe_out = polar(C, R, fe)
    arco_ext(pe_out, a)
    pe_in = polar(C, r, fe)
    s.append(f'A{f(t / 2)} {f(t / 2)} 0 0 1 {pt(pe_in)}')
    ps_in = polar(C, r, fs)
    s.append(f'A{f(r)} {f(r)} 0 1 0 {pt(ps_in)}')
    s.append(f'A{f(t / 2)} {f(t / 2)} 0 0 1 {pt(p0)}Z')
    d = ''.join(s)

    # Medidas de control: distancia máxima a (512,512) — puntas de oreja (arco) y anillo
    def lejos_arco(cen, rad):
        dd = math.hypot(cen[0] - 512, cen[1] - 512); return dd + rad
    max_oreja = max(lejos_arco(o['ac'], P['apex_r']) for o in (oi, od))
    max_anillo = math.hypot(0, cy - 512) + R
    top = min(o['ac'][1] - P['apex_r'] for o in (oi, od))
    return dict(d=d, C=C, r=r, rd=rd, max_oreja=max_oreja, max_anillo=max_anillo, top=top, bottom=cy + R)


if __name__ == '__main__':
    salida = sys.argv[1]
    # centramos verticalmente la caja (puntas de oreja → base del anillo) y bajamos 6 u por el peso de las orejas
    cy = 512
    for _ in range(20):
        g = construir(cy)
        centro = (g['top'] + g['bottom']) / 2
        cy += (512 + 6) - centro
    g = construir(cy)
    print(json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in g.items() if k != 'd'}, ensure_ascii=False))
    assert g['max_oreja'] <= P['seguro'] and g['max_anillo'] <= P['seguro'], 'fuera de la zona segura'
    cx, cyy = g['C']
    dot = lambda color: f'<circle cx="{f(cx)}" cy="{f(cyy)}" r="{f(g["rd"])}" fill="{color}"/>'
    marca = lambda color: f'<path d="{g["d"]}" fill="{color}"/>'
    svgs = {
        'dark.svg': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0A0A0A"/>{marca("#F5F5F7")}{dot("#30D158")}</svg>',
        'light.svg': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#F5F5F7"/>{marca("#0A0A0A")}{dot("#248A3D")}</svg>',
        'glyph.svg': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{marca("#000000")}{dot("#000000")}</svg>',
        'foreground.svg': f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{marca("#F5F5F7")}{dot("#30D158")}</svg>',
    }
    os.makedirs(salida, exist_ok=True)
    for n, s in svgs.items():
        open(os.path.join(salida, n), 'w', encoding='utf-8').write(s)
    json.dump({'d': g['d'], 'cx': cx, 'cy': cyy, 'rd': g['rd']}, open(os.path.join(salida, 'geometria.json'), 'w'))
    print('ok')
