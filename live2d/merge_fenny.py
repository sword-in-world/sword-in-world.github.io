"""合成芬妮 Spine 分层 PNG 为一张完整透明背景图"""
import json
import os
from PIL import Image

BASE = r"E:\芬妮-辉耀 绽于恋时_by_尘白禁区_a4c392f5a61cc919f177af7b82daa28a\芬妮-辉耀 绽于恋时"
IMG_DIR = os.path.join(BASE, "images")
JSON_PATH = os.path.join(BASE, "芬妮-辉耀 绽于恋时_拆分.json")
OUTPUT = r"E:\myblog\static\live2d\fenny.png"

with open(JSON_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

slots = data["slots"]
skins = data["skins"]["default"]

# 收集所有部件信息
parts = []
for slot in slots:
    name = slot["name"]
    attachment = slot["attachment"]
    if name in skins and attachment in skins[name]:
        info = skins[name][attachment]
        parts.append({
            "name": name,
            "x": info["x"],
            "y": info["y"],
            "width": info["width"],
            "height": info["height"],
        })

# 计算画布范围
min_left = float("inf")
min_top = float("inf")
max_right = float("-inf")
max_bottom = float("-inf")

for p in parts:
    left = p["x"] - p["width"] / 2
    top = -p["y"] - p["height"] / 2
    right = left + p["width"]
    bottom = top + p["height"]
    min_left = min(min_left, left)
    min_top = min(min_top, top)
    max_right = max(max_right, right)
    max_bottom = max(max_bottom, bottom)

canvas_w = int(max_right - min_left) + 20
canvas_h = int(max_bottom - min_top) + 20
offset_x = -min_left + 10
offset_y = -min_top + 10

print(f"Canvas: {canvas_w} x {canvas_h}")
print(f"Parts: {len(parts)}")

# 创建透明画布
canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

# 按 slots 顺序叠加（第一个在最底层）
for i, p in enumerate(parts):
    img_path = os.path.join(IMG_DIR, f"{p['name']}.png")
    if not os.path.exists(img_path):
        print(f"  MISSING: {p['name']}.png")
        continue

    img = Image.open(img_path).convert("RGBA")

    # Spine 坐标 -> 画布坐标
    # 图片中心在画布上的位置
    cx = p["x"] + offset_x
    cy = -p["y"] + offset_y
    # 左上角
    px = int(cx - img.width / 2)
    py = int(cy - img.height / 2)

    canvas.alpha_composite(img, (px, py))
    print(f"  [{i+1:2d}/{len(parts)}] {p['name']}.png  -> ({px}, {py})  {img.size}")

# 裁剪透明边距
bbox = canvas.getbbox()
if bbox:
    # 留一点边距
    pad = 10
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
            min(canvas_w, bbox[2] + pad), min(canvas_h, bbox[3] + pad))
    canvas = canvas.crop(bbox)

print(f"\nFinal size: {canvas.size}")
canvas.save(OUTPUT, "PNG")
print(f"Saved to: {OUTPUT}")
