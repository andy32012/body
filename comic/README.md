這份檔案是從 [andy32012/xitian](https://github.com/andy32012/xitian) 複製到 Body 網站的 `comic/` 子目錄。自訂網域 xitian.page 已改接到這個 Body 網站；原專案內容保留未刪。

# 西天｜xitian.page

漫畫《西天》的閱讀網站，放在 GitHub Pages。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 作品首頁：主視覺、繼續閱讀、最近更新、故事簡介、章節卡 |
| `chapter.html` | 章節頁：章名、這一章的故事簡介、卷列表 |
| `read.html` | 閱讀頁：進入時先問「翻書」或「往下滑」（附動畫示範，可記住選擇、右上角隨時切換）；頁碼與跳頁、進度條、記住閱讀位置 |
| `style.css` | 全站樣式（深色主題） |
| `assets/common.js` `home.js` `read.js` | 網站程式 |
| `assets/ga.js` | Google Analytics 設定 |
| `manifest.json` | 作品簡介（`work`）、章節（`chapters`，章名與簡介）、下一章預告（`upcoming`）、各卷資料 |
| `comics/<卷>/NNNN.webp` | 漫畫原圖，檔名就是全書頁碼（第二卷是 0101～0200） |
| `comics/<卷>/s/` | 手機用小圖（自動產生） |
| `comics/<卷>/thumb.webp` `assets/hero.webp` `og.jpg` | 卷縮圖、首頁主視覺、分享預覽圖（自動產生） |
| `tools/build.py` | 產生上面那些自動檔案、更新頁面清單 |

## 新增一章

在 `manifest.json` 的 `chapters` 加一筆（`id`、`name`、`title`、`status`、`tagline`、`intro`、`cover`），把 `upcoming` 改成再下一章，該章各卷的 `stage` 填同一個 `name`，再跑 `python3 tools/build.py`。

## 新增一卷

1. 把頁面轉成 WebP，依全書頁碼命名，放進 `comics/v1-3/`（例如 `0201.webp`～`0300.webp`）。
2. 在 `manifest.json` 的 `volumes` 加一筆：

   ```json
   {
    "id": "v1-3",
    "stage": "第一章",
    "title": "第三卷",
    "subtitle": "盂蘭盆會",
    "blurb": "一兩句簡介",
    "updated": "2026-10-30",
    "dir": "comics/v1-3",
    "cover": {"page": "0201.webp", "box": [0, 0, 1086, 500]},
    "pages": []
   }
   ```

   `cover.box` 是縮圖要取的範圍（左、上、右、下，單位是像素），避開旁白框比較好看。
3. 執行 `python3 tools/build.py`（需要 `pip install pillow`），它會填好 `pages`、產生小圖和縮圖。
4. commit、push，GitHub Pages 幾分鐘後更新。

只改了網站程式（`style.css`、`assets/*.js`）也請跑一次 `build.py`，它會更新網址後面的版本號，讀者才不會卡在舊版。

## 安全設計

- 頁面用 DOM API 組畫面、文字一律用 `textContent`，不把資料拼成 HTML，網址參數也只拿來比對，不會被當成程式執行。
- 兩個頁面都有內容安全政策（CSP），只允許本站、Google Analytics 與 Google Fonts 的資源。
- 圖片不含 EXIF／XMP 等中繼資料；`tools/build.py` 產生的圖也不寫入。
- 閱讀進度只存在讀者自己的瀏覽器（localStorage）。
