#!/usr/bin/env python3
"""Compare two golden capture dirs. Usage: diff.py <dirA> <dirB> [--out diffdir]
Reports per-frame mean abs difference and % of pixels differing by > 24 levels."""
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
if out: os.makedirs(out, exist_ok=True)
fa, fb = sorted(f for f in os.listdir(a) if f.endswith('.png')), sorted(f for f in os.listdir(b) if f.endswith('.png'))
if fa != fb: print('frame lists differ:', set(fa) ^ set(fb))
worst = 0; bad = 0
for f in sorted(set(fa) & set(fb)):
    A, B = Image.open(os.path.join(a, f)).convert('RGB'), Image.open(os.path.join(b, f)).convert('RGB')
    d = ImageChops.difference(A, B).convert('L')
    h = d.histogram(); tot = sum(h)
    mean = sum(i * c for i, c in enumerate(h)) / tot
    big = sum(h[25:]) / tot * 100
    worst = max(worst, big)
    flag = 'OK ' if big < 0.5 and mean < 1.5 else 'DIFF'
    if flag == 'DIFF': bad += 1
    print(f'{flag} {f:34s} mean={mean:5.2f} big%={big:6.3f}')
    if out and flag == 'DIFF': d.point(lambda v: min(255, v * 6)).save(os.path.join(out, f))
print(f'\n{bad} differing frames of {len(set(fa) & set(fb))}; worst big% = {worst:.3f}')
sys.exit(1 if bad else 0)
