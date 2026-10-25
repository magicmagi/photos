#!/usr/bin/env python3
"""
扫描 photos/<分类>/ 下的照片，生成网页用的图片和 photos.js。

用法:
    pip install pillow cryptography
    python3 build.py              # 会提示输入“查看原图”的密码（输入时不显示）

目录约定:
    photos/places/xxx.jpg          子文件夹名 = config.js 里的分类 key
    photos/captions.json           可选，给照片写标题/地点/描述（脚本会自动补全新照片的空条目）

生成内容:
    img/<id>.jpg, img/<id>_t.jpg   公开的展示图和缩略图：长边 1600 / 800，带水印，不含 EXIF
    secure/<id>.bin                原图（无水印、不含 EXIF），用密码加密，只有输对密码才能在网页上解开
    secure/meta.bin                加密的拍摄参数（相机、镜头、光圈……）
    secure/key.json                加密用的盐和校验值（不含密码本身）

拍摄时间、相机参数自动从 EXIF 读取；没有 EXIF 时用文件修改时间，
也可以在 captions.json 里写 "date": "2023-08-14" 覆盖。
"""
import base64
import getpass
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    from PIL.ExifTags import TAGS
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")
try:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    sys.exit("需要 cryptography：pip install cryptography")

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "photos"
OUT = ROOT / "img"
SECURE = ROOT / "secure"
CAPTIONS = SRC / "captions.json"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
DISPLAY_MAX = 1600   # 公开大图长边
THUMB_MAX = 800      # 网格缩略图长边
ORIGINAL_MAX = None  # 加密原图长边；None = 保留原始分辨率（文件较大），可改成 4000 之类
WATERMARK = None     # 水印文字；None = 用 config.js 里的名字，生成 “© 名字”
ITERATIONS = 600_000  # 密码派生次数，网页端必须一致（app.js 会从 key.json 读取）
FONTS = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

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


# ---------- 水印 ----------
def watermark_text():
    if WATERMARK:
        return WATERMARK
    m = re.search(r'name:\s*"([^"]*)"', (ROOT / "config.js").read_text("utf-8"))
    return f"© {m.group(1)}" if m and m.group(1).strip() else ""


def load_font(size):
    for path in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default(size=size)


def add_watermark(im, text):
    if not text:
        return im
    im = im.convert("RGB")
    W, H = im.size
    long_side = max(W, H)
    font = load_font(max(12, round(long_side * 0.022)))
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    margin = round(long_side * 0.025)
    x, y = W - (r - l) - margin - l, H - (b - t) - margin - t
    shadow = max(1, round(long_side / 800))
    d.text((x + shadow, y + shadow), text, font=font, fill=(0, 0, 0, 70))
    d.text((x, y), text, font=font, fill=(255, 255, 255, 150))
    return Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")


def resized(img, max_side):
    im = img.copy()
    if max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    return im if im.mode in ("RGB", "L") else im.convert("RGB")


def jpeg_bytes(im, quality):
    buf = BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)  # 不传 exif = 不写入任何元数据
    return buf.getvalue()


# ---------- 加密（AES-GCM，格式与浏览器 WebCrypto 一致：12 字节 IV + 密文 + 16 字节 tag） ----------
CHECK_PLAIN = b"album-key-ok"


def derive_key(password, salt):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
    return AESGCM(kdf.derive(password.encode("utf-8")))


def encrypt(aes, data):
    iv = os.urandom(12)
    return iv + aes.encrypt(iv, data, None)


def decrypt(aes, blob):
    return aes.decrypt(blob[:12], blob[12:], None)


def get_password():
    pw = os.environ.get("ALBUM_PASSWORD")
    if pw:
        return pw
    pw = getpass.getpass("查看原图的密码（输入时不显示）: ")
    if not pw:
        sys.exit("密码不能为空")
    return pw


def setup_key():
    """返回 (aes, key_changed)。沿用已有的盐；密码变了就换盐并重新加密全部原图。"""
    key_file = SECURE / "key.json"
    pw = get_password()
    if key_file.exists():
        info = json.loads(key_file.read_text())
        aes = derive_key(pw, base64.b64decode(info["salt"]))
        try:
            if decrypt(aes, base64.b64decode(info["check"])) == CHECK_PLAIN:
                return aes, False
        except Exception:
            pass
        ans = input("这个密码和上次不同。用新密码重新加密全部原图？(y/N) ").strip().lower()
        if ans != "y":
            sys.exit("已取消，没有改动任何文件")
    elif not os.environ.get("ALBUM_PASSWORD") and getpass.getpass("再输入一次确认: ") != pw:
        sys.exit("两次输入的密码不一致")

    salt = os.urandom(16)
    aes = derive_key(pw, salt)
    SECURE.mkdir(exist_ok=True)
    key_file.write_text(json.dumps({
        "salt": base64.b64encode(salt).decode(),
        "iterations": ITERATIONS,
        "check": base64.b64encode(encrypt(aes, CHECK_PLAIN)).decode(),
    }, indent=1))
    return aes, True


def main():
    if not SRC.exists():
        sys.exit("没找到 photos/ 文件夹。按分类建子文件夹放照片，例如 photos/nature/")

    aes, key_changed = setup_key()
    wm = watermark_text()
    # 水印或尺寸设置变了，就重新生成全部公开图片
    sig = json.dumps({"display": DISPLAY_MAX, "thumb": THUMB_MAX, "wm": wm, "orig": ORIGINAL_MAX})
    sig_file = OUT / ".build.json"
    settings_changed = not sig_file.exists() or sig_file.read_text() != sig
    OUT.mkdir(exist_ok=True)

    captions = json.loads(CAPTIONS.read_text("utf-8")) if CAPTIONS.exists() else {}
    photos, meta = [], {}
    files = sorted(p for p in SRC.rglob("*") if p.suffix.lower() in EXTS)

    for f in files:
        rel = f.relative_to(SRC).as_posix()
        category = f.relative_to(SRC).parts[0] if len(f.relative_to(SRC).parts) > 1 else "places"
        pid = hashlib.md5(rel.encode()).hexdigest()[:8]
        cap = captions.setdefault(rel, {"title": f.stem, "location": "", "desc": ""})
        disp, thumb, orig = OUT / f"{pid}.jpg", OUT / f"{pid}_t.jpg", SECURE / f"{pid}.bin"
        src_mtime = f.stat().st_mtime

        with Image.open(f) as img:
            date, ex = exif_info(img)
            img = ImageOps.exif_transpose(img)  # 修正手机照片方向
            w, h = img.size
            if settings_changed or not disp.exists() or disp.stat().st_mtime < src_mtime:
                disp.write_bytes(jpeg_bytes(add_watermark(resized(img, DISPLAY_MAX), wm), 85))
                thumb.write_bytes(jpeg_bytes(add_watermark(resized(img, THUMB_MAX), wm), 82))
                print(f"  ✓ {rel}")
            if key_changed or settings_changed or not orig.exists() or orig.stat().st_mtime < src_mtime:
                orig.write_bytes(encrypt(aes, jpeg_bytes(resized(img, ORIGINAL_MAX), 92)))
                print(f"  🔒 {rel}")

        if cap.get("date"):
            date = datetime.fromisoformat(cap["date"])
        date = date or datetime.fromtimestamp(src_mtime)
        ex.update(cap.get("exif") or {})
        meta[pid] = {**ex, "w": w, "h": h}

        dw, dh = resized(Image.new("1", (w, h)), DISPLAY_MAX).size
        photos.append({
            "id": pid,
            "src": f"img/{pid}.jpg",
            "thumb": f"img/{pid}_t.jpg",
            "w": dw, "h": dh,
            "category": cap.get("category") or category,
            "title": cap.get("title") or f.stem,
            "location": cap.get("location", ""),
            "desc": cap.get("desc", ""),
            "date": date.isoformat(timespec="minutes"),
        })

    # 删掉已不在 photos/ 里的照片对应的生成文件
    keep = {p["id"] for p in photos}
    for d in (OUT, SECURE):
        for g in d.glob("*"):
            stem = g.stem.removesuffix("_t")
            if g.suffix in (".jpg", ".bin") and stem != "meta" and stem not in keep:
                g.unlink()

    (SECURE / "meta.bin").write_bytes(encrypt(aes, json.dumps(meta, ensure_ascii=False).encode()))
    sig_file.write_text(sig)
    CAPTIONS.write_text(json.dumps(captions, ensure_ascii=False, indent=2), "utf-8")
    (ROOT / "photos.js").write_text(
        "// 由 build.py 自动生成，请勿手动修改；标题等信息写在 photos/captions.json\n"
        "window.PHOTOS = " + json.dumps(photos, ensure_ascii=False, indent=1) + ";\n",
        "utf-8",
    )
    print(f"完成：{len(photos)} 张照片 → photos.js（水印：{wm or '无'}）")


if __name__ == "__main__":
    main()
