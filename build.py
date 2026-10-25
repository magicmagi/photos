#!/usr/bin/env python3
"""
扫描 photos/<分类>/ 下的照片，生成网页用的缩略图、展示图和 photos.js。

用法:
    pip install pillow
    python3 build.py

目录约定:
    photos/places/xxx.jpg          子文件夹名 = config.js 里的分类 key
    photos/captions.json           可选，给照片写标题/地点/描述（脚本会自动补全新照片的空条目）

拍摄时间、相机参数自动从 EXIF 读取；没有 EXIF 时用文件修改时间，
也可以在 captions.json 里写 "date": "2023-08-14" 覆盖。
"""
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
    from PIL.ExifTags import TAGS
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "photos"
OUT = ROOT / "img"
CAPTIONS = SRC / "captions.json"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
DISPLAY_MAX = 2400  # 灯箱大图长边
THUMB_MAX = 800     # 网格缩略图长边

try:
    from pillow_heif import register_heif_opener  # 可选：支持 iPhone HEIC
    register_heif_opener()
except ImportError:
    EXTS.discard(".heic")


def exif_info(img):
    raw = img.getexif()
    data = {TAGS.get(k, k): v for k, v in raw.items()}
    try:
        data.update({TAGS.get(k, k): v for k, v in raw.get_ifd(0x8769).items()})
    except Exception:
        pass

    def num(v):
        try:
            if isinstance(v, (tuple, list)) and len(v) == 2:
                return v[0] / v[1] if v[1] else None
            return float(v)
        except Exception:
            return None

    date = None
    for key in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
        if data.get(key):
            try:
                date = datetime.strptime(str(data[key]).strip(), "%Y:%m:%d %H:%M:%S")
                break
            except ValueError:
                pass

    ex = {}
    make = str(data.get("Make", "")).replace("CORPORATION", "").replace("Corporation", "").strip()
    model = str(data.get("Model", "")).strip()
    if model:
        ex["camera"] = model if make.split(" ")[0].lower() in model.lower() else f"{make} {model}".strip()
    if data.get("LensModel"):
        ex["lens"] = str(data["LensModel"]).strip()
    f = num(data.get("FocalLength"))
    if f:
        ex["focal"] = f"{f:.0f}mm"
    a = num(data.get("FNumber"))
    if a:
        ex["aperture"] = f"f/{a:g}"
    s = num(data.get("ExposureTime"))
    if s:
        ex["shutter"] = f"1/{round(1 / s)}s" if s < 1 else f"{s:g}s"
    iso = data.get("ISOSpeedRatings") or data.get("PhotographicSensitivity")
    if iso:
        ex["iso"] = str(iso[0] if isinstance(iso, (tuple, list)) else iso)
    return date, ex


def save_resized(img, path, max_side):
    im = img.copy()
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=85, optimize=True, progressive=True)


def main():
    if not SRC.exists():
        sys.exit("没找到 photos/ 文件夹。按分类建子文件夹放照片，例如 photos/nature/")

    captions = json.loads(CAPTIONS.read_text("utf-8")) if CAPTIONS.exists() else {}
    photos = []
    files = sorted(p for p in SRC.rglob("*") if p.suffix.lower() in EXTS)

    for f in files:
        rel = f.relative_to(SRC).as_posix()
        category = f.relative_to(SRC).parts[0] if len(f.relative_to(SRC).parts) > 1 else "places"
        pid = hashlib.md5(rel.encode()).hexdigest()[:8]
        cap = captions.setdefault(rel, {"title": f.stem, "location": "", "desc": ""})

        with Image.open(f) as img:
            date, ex = exif_info(img)
            img = ImageOps.exif_transpose(img)  # 修正手机照片方向
            w, h = img.size
            disp, thumb = OUT / f"{pid}.jpg", OUT / f"{pid}_t.jpg"
            if not disp.exists() or disp.stat().st_mtime < f.stat().st_mtime:
                save_resized(img, disp, DISPLAY_MAX)
                save_resized(img, thumb, THUMB_MAX)
                print(f"  ✓ {rel}")

        if cap.get("date"):
            date = datetime.fromisoformat(cap["date"])
        date = date or datetime.fromtimestamp(f.stat().st_mtime)

        photos.append({
            "id": pid,
            "src": f"img/{pid}.jpg",
            "thumb": f"img/{pid}_t.jpg",
            "w": w, "h": h,
            "category": cap.get("category") or category,
            "title": cap.get("title") or f.stem,
            "location": cap.get("location", ""),
            "desc": cap.get("desc", ""),
            "date": date.isoformat(timespec="minutes"),
            "exif": ex,
        })

    CAPTIONS.write_text(json.dumps(captions, ensure_ascii=False, indent=2), "utf-8")
    (ROOT / "photos.js").write_text(
        "// 由 build.py 自动生成，请勿手动修改；标题等信息写在 photos/captions.json\n"
        "window.PHOTOS = " + json.dumps(photos, ensure_ascii=False, indent=1) + ";\n",
        "utf-8",
    )
    print(f"完成：{len(photos)} 张照片 → photos.js")


if __name__ == "__main__":
    main()
