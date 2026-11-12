#!/usr/bin/env python3
"""西天網站的整理工具。

新增或替換漫畫頁之後，在倉庫根目錄執行：

    python3 tools/build.py

它會：
  1. 掃描 manifest.json 裡每一卷的資料夾，重新列出頁面（含寬高，避免閱讀時畫面跳動）
  2. 產生手機用小圖 comics/<卷>/s/NNNN.webp（寬 720px，約省一半流量）
  3. 依 manifest 的 cover 設定產生每卷縮圖 comics/<卷>/thumb.webp
  4. 依 manifest 的 hero 設定產生首頁主視覺 assets/hero.webp 與分享預覽圖 og.jpg
  5. 依每一章的 cover 設定產生章節封面 assets/chapters/<章>.webp
  6. 在 HTML 引用的 css／js 加上版本號，讀者不會看到舊快取

改了網站程式（style.css、assets/*.js）之後，也請再跑一次，版本號才會更新。

卷名、簡介、更新日期、封面取景等文字資料請直接改 manifest.json，
這支工具只會更新 pages 欄位與圖片，其他欄位原樣保留。

需要 Pillow：pip install pillow
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest.json"
SMALL_WIDTH = 720
PAGE_RE = re.compile(r"^\d{4}\.webp$")


def save_webp(im, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    # 不寫入任何中繼資料（EXIF、XMP），避免外洩產圖資訊
    im.save(path, "WEBP", quality=quality, method=6)


def fit_crop(im, box, ratio):
    """在 box 範圍內，以中心為準裁出指定長寬比。"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w / h > ratio:
        nw = round(h * ratio)
        x0 += (w - nw) // 2
        x1 = x0 + nw
    else:
        nh = round(w / ratio)
        y0 += (h - nh) // 2
        y1 = y0 + nh
    return im.crop((x0, y0, x1, y1))


def is_stale(src, dst):
    return not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def build_volume(vol):
    folder = ROOT / vol["dir"]
    files = sorted(p for p in folder.iterdir() if PAGE_RE.match(p.name))
    if not files:
        sys.exit(f"找不到頁面：{folder}")

    pages = []
    for src in files:
        with Image.open(src) as im:
            w, h = im.size
            pages.append({"f": src.name, "w": w, "h": h})
            small = folder / "s" / src.name
            if w > SMALL_WIDTH and is_stale(src, small):
                rgb = im.convert("RGB")
                rgb = rgb.resize((SMALL_WIDTH, round(h * SMALL_WIDTH / w)), Image.LANCZOS)
                save_webp(rgb, small, 74)
    vol["pages"] = pages

    cover = vol.get("cover")
    if cover:
        with Image.open(folder / cover["page"]) as im:
            box = cover.get("box") or [0, 0, im.width, im.height]
            thumb = fit_crop(im.convert("RGB"), box, 16 / 9)
            thumb = thumb.resize((640, 360), Image.LANCZOS)
            save_webp(thumb, folder / "thumb.webp", 80)

    print(f"{vol['id']}：{len(pages)} 頁（{pages[0]['f']}～{pages[-1]['f']}）")


def resize_to_width(img, width):
    if img.width <= width:
        return img
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def build_hero(hero):
    """首頁主視覺：src 是電腦版（橫式），tall 是手機版（直式，可省略）。"""
    with Image.open(ROOT / hero["src"]) as im:
        rgb = im.convert("RGB")
    box = hero.get("box") or [0, 0, rgb.width, rgb.height]
    wide = rgb.crop(box)
    save_webp(resize_to_width(wide, 1920), ROOT / "assets" / "hero.webp", 82)

    if hero.get("tall"):
        with Image.open(ROOT / hero["tall"]) as im:
            tall = im.convert("RGB")
        save_webp(resize_to_width(tall, 900), ROOT / "assets" / "hero-tall.webp", 80)

    og = fit_crop(wide, [0, 0, wide.width, wide.height], 1200 / 630).resize((1200, 630), Image.LANCZOS)
    og.save(ROOT / "og.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    print("首頁主視覺與分享預覽圖已更新")


def build_chapter(ch):
    cover = ch.get("cover")
    if not cover:
        return
    with Image.open(ROOT / cover["src"]) as im:
        box = cover.get("box") or [0, 0, im.width, im.height]
        img = fit_crop(im.convert("RGB"), box, 16 / 9).resize((1280, 720), Image.LANCZOS)
    save_webp(img, ROOT / "assets" / "chapters" / f"{ch['id']}.webp", 80)
    print(f"{ch['name']} 封面已更新")


def stamp_html():
    """在 HTML 引用的 css／js 後面加上內容雜湊（?v=xxxx），更新後讀者不會卡在舊快取。"""
    import hashlib

    def digest(rel):
        return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]

    pattern = re.compile(r'(?P<attr>(?:href|src)=")(?P<path>(?:style\.css|assets/[\w-]+\.js))(?:\?v=[0-9a-f]+)?"')
    for page in ROOT.glob("*.html"):
        text = page.read_text(encoding="utf-8")
        new = pattern.sub(lambda m: f'{m["attr"]}{m["path"]}?v={digest(m["path"])}"', text)
        if new != text:
            page.write_text(new, encoding="utf-8")
    print("HTML 版本號已更新")


def dump(data):
    """輸出好讀的 JSON：一般欄位縮排，每一頁、每組座標各佔一行。"""
    text = json.dumps(data, ensure_ascii=False, indent=1)

    def one_line(match):
        return json.dumps(json.loads(match.group(0)), ensure_ascii=False)

    text = re.sub(r"\{\s*\"f\": [^{}]*?\}", one_line, text)
    text = re.sub(r"\[\s*-?\d+(?:,\s*-?\d+)*\s*\]", one_line, text)
    text = re.sub(r"\{\s*\"page\": [^{}]*?\}", one_line, text)
    text = re.sub(r"\{\s*\"src\": [^{}]*?\}", one_line, text)
    return text + "\n"


def main():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for vol in data["volumes"]:
        build_volume(vol)
    for ch in data.get("chapters", []):
        build_chapter(ch)
    if data.get("hero"):
        build_hero(data["hero"])
    MANIFEST.write_text(dump(data), encoding="utf-8")
    stamp_html()
    print("manifest.json 已更新")


if __name__ == "__main__":
    main()
