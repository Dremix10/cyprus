"""Generates titsu-icon.svg (App Store / home screen icon) and titsu-splash.svg (launch emblem,
transparent). Render each to a 1024x1024 PNG with a browser (see README in this folder)."""
import math

def leaves(cx, cy, R, a0, a1, n, side):
    out = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + (a1 - a0) * t
        ar = math.radians(a)
        x, y = cx + R * math.cos(ar), cy + R * math.sin(ar)
        tang = a + 90 if side == 'L' else a - 90  # direction the branch grows
        size = 1.0 - 0.30 * t
        L, W = 46 * size, 17 * size
        for sgn in (-1, 1):
            ang = tang + sgn * 38
            c = (x + math.cos(math.radians(ang)) * L * 0.92, y + math.sin(math.radians(ang)) * L * 0.92)
            out.append(f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="{L:.1f}" ry="{W:.1f}" transform="rotate({ang:.1f} {c[0]:.1f} {c[1]:.1f})"/>')
    a = math.radians(a1)
    x, y = cx + R * math.cos(a), cy + R * math.sin(a)
    tang = a1 + 90 if side == 'L' else a1 - 90
    c = (x + math.cos(math.radians(tang)) * 31, y + math.sin(math.radians(tang)) * 31)
    out.append(f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="34" ry="13" transform="rotate({tang:.1f} {c[0]:.1f} {c[1]:.1f})"/>')
    return '\n      '.join(out)

def arc(cx, cy, R, a0, a1):
    p0 = (cx + R * math.cos(math.radians(a0)), cy + R * math.sin(math.radians(a0)))
    p1 = (cx + R * math.cos(math.radians(a1)), cy + R * math.sin(math.radians(a1)))
    return f'M{p0[0]:.1f},{p0[1]:.1f} A{R},{R} 0 0 {1 if a1 > a0 else 0} {p1[0]:.1f},{p1[1]:.1f}'

CX, CY, R = 512, 532, 330
DEFS = '''
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="#2A4180"/>
      <stop offset="0.55" stop-color="#15204A"/>
      <stop offset="1" stop-color="#0A1028"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7DE92"/>
      <stop offset="0.5" stop-color="#D9B65C"/>
      <stop offset="1" stop-color="#A9852F"/>
    </linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9A2A38"/>
      <stop offset="1" stop-color="#5E1520"/>
    </linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFBF0"/>
      <stop offset="1" stop-color="#EFE3C4"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>'''

BACK_CARD = '''<rect x="377" y="330" width="270" height="380" rx="28" fill="url(#back)" stroke="url(#gold)" stroke-width="9"/>
        <rect x="399" y="352" width="226" height="336" rx="16" fill="none" stroke="#E2C26B" stroke-opacity="0.55" stroke-width="4"/>'''

EMBLEM = f'''
    <g fill="url(#gold)">
      <path d="{arc(CX, CY, R, 98, 236)}" fill="none" stroke="url(#gold)" stroke-width="10" stroke-linecap="round"/>
      <path d="{arc(CX, CY, R, 82, -56)}" fill="none" stroke="url(#gold)" stroke-width="10" stroke-linecap="round"/>
      {leaves(CX, CY, R, 98, 236, 11, 'L')}
      {leaves(CX, CY, R, 82, -56, 11, 'R')}
    </g>
    <g transform="translate(512 520) scale(1.12) translate(-512 -520)">
      <g transform="rotate(-18 512 800)">
        {BACK_CARD}
      </g>
      <g transform="rotate(18 512 800)">
        {BACK_CARD}
      </g>
      <g filter="url(#shadow)">
        <rect x="377" y="318" width="270" height="390" rx="28" fill="url(#face)" stroke="url(#gold)" stroke-width="9"/>
      </g>
      <rect x="397" y="338" width="230" height="350" rx="16" fill="none" stroke="#C9A84C" stroke-width="4"/>
      <text x="512" y="612" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="300" fill="#16264A">T</text>
    </g>'''

HEAD = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
open('titsu-icon.svg', 'w').write(f'{HEAD}{DEFS}\n  <rect width="1024" height="1024" fill="url(#bg)"/>{EMBLEM}\n</svg>\n')
open('titsu-splash.svg', 'w').write(f'{HEAD}{DEFS}{EMBLEM}\n</svg>\n')
print('wrote titsu-icon.svg, titsu-splash.svg')
