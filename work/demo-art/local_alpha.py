"""Offline sprite alpha normalization for generated opaque sprite sheets.

Runs U2-Net inference locally with ONNX Runtime. No image upload or API key.
Pre/postprocessing follows the documented U2-Net/rembg model contract:
https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py
https://github.com/danielgatis/rembg/blob/main/rembg/sessions/base.py
No downloaded model or Python runtime becomes an app dependency.
Usage: local_alpha.py MODEL SOURCE COLS ROWS OUTPUT [CUTOFF]
"""
from pathlib import Path
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

model, source, cols, rows, destination, *rest = sys.argv[1:]
cols, rows = int(cols), int(rows)
cutoff = int(rest[0]) if rest else 96
image = Image.open(source).convert('RGB')
out = Image.new('RGBA', (cols*512, rows*512))
options = ort.SessionOptions()
options.intra_op_num_threads = 4
session = ort.InferenceSession(model, options, providers=['CPUExecutionProvider'])
for row in range(rows):
    for col in range(cols):
        bounds = (max(0,round(col*image.width/cols)-24), max(0,round(row*image.height/rows)-24),
                  min(image.width,round((col+1)*image.width/cols)+24), min(image.height,round((row+1)*image.height/rows)+24))
        tile = image.crop(bounds)
        data = np.asarray(tile.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
        data /= max(float(data.max()), 1)
        data = (data - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
        batch = np.expand_dims(data.transpose(2, 0, 1), 0)
        mask = session.run(None, {session.get_inputs()[0].name: batch})[0][0, 0]
        mask = (mask-mask.min())/max(float(mask.max()-mask.min()), .000001)
        alpha = Image.fromarray(np.uint8(mask*255)).resize(tile.size, Image.Resampling.LANCZOS)
        alpha = alpha.point(lambda a: 255 if a >= cutoff else 0)
        # Thin dark outline remains intact while soft background glow is removed.
        alpha = alpha.filter(ImageFilter.MaxFilter(3))
        result = tile.convert('RGBA')
        result.putalpha(alpha)
        visible = result.getchannel('A').getbbox()
        result = result.crop(visible)
        result.thumbnail((448,448), Image.Resampling.LANCZOS)
        out.alpha_composite(result, (col*512+(512-result.width)//2, row*512+480-result.height))
        print(f'alpha cell {row*cols+col+1}/{cols*rows}', flush=True)
Path(destination).parent.mkdir(parents=True, exist_ok=True)
out.save(destination, optimize=True)
print(f'Saved {destination}', flush=True)
