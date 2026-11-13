# Body

網站：https://xitian.page

漫畫、內外科護理和語言學習的入口網站。

## 網站導覽

| 區域 | 入口 |
| --- | --- |
| 漫畫 | [《西天》線上閱讀](https://xitian.page/comic/) |
| 護理 | [內科黑板課](https://xitian.page/nursing/) |
| 語言 | [日文學堂](https://xitian.page/japanese/) · [韓文學堂](https://xitian.page/korean/) · [英文課規劃](https://xitian.page/english/) |
| 日韓學習工具 | [今日單字與複習](https://xitian.page/vocabulary/) · [學習進度](https://xitian.page/progress/) |
| 護理英文與赴美計畫 | [夢想藍圖](https://xitian.page/dream/) |

### 維護夢想藍圖

完整原始碼、教材與測試放在 [projects/dream-blueprint](./projects/dream-blueprint/)，操作方式見[專案說明](./projects/dream-blueprint/README.md)。更新 App 時請在該資料夾安裝依賴、測試並建置，將產出的靜態檔案發佈到根目錄的 [dream](./dream/) 資料夾。Body 首頁和日韓學習室沿用下方原有的維護方式。


- `index.html`、`style.css`：Body 首頁（漫畫、語言學習、護理、夢想藍圖）
- `comic/`：《西天》線上漫畫
- `nursing/`：內科黑板課目錄（心臟、血液、免疫、腫瘤）
  - `nursing/heart-failure/`：心衰竭：左 vs 右
- `japanese/`：日文學堂，6 階段、30 堂主題課、完整五十音與字母熱身
- `korean/`：韓文學堂，6 階段、30 堂主題課、韓文字母與字母熱身
- `vocabulary/`：今日單字、到期複習、收藏字庫與隨課字卡
- `progress/`：完成課程、答題統計、學習時間、28 天足跡、每日目標與備份
- `english/`：英文課規劃頁（準備中）
- `learning/`：日韓共用介面、教材、朗讀與本機學習紀錄
- `assets/site.css`：內頁共用樣式

黑板課的字會照筆順一筆一畫寫出來，圖邊講邊畫，同時播放語音講解。語音事先生成好放在各課的 `audio/` 資料夾，網頁播放時不連任何 API，也沒有存放任何金鑰。

筆順資料來自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)（Arphic Public License，見 `licenses/`），英文字使用 Hershey 字型。

## 日韓學習室

日文、韓文各有 6 個自編階段、30 堂完整主題課。每課包含學習目標、重點說明、例句、情境對話、4 張字卡及 3 道附解析練習。合計 60 課、240 張字卡、180 道練習。階段涵蓋零基礎到進階表達，不直接等同 JLPT／TOPIK 檢定級數，也不保證檢定結果。課程資料附官方延伸學習連結，題目與例句為自編內容。

- 課程需實際完成全部練習、答對至少 80%，再按「完成這一課」才計入進度。重答會保留作答統計，完成數不重複增加。
- 每日精選依裝置本地日期、語言與程度穩定挑選；預設日韓各 5 張，可依目前課程進度或指定程度練習。
- 字卡提供翻面、例句、收藏及自評。複習間隔為 1／3／7／14／30 天；不熟的字 10 分鐘後再看，有點印象則隔日複習。同張未到期字卡不會因重複點擊而持續升階。
- 日韓學習紀錄使用獨立的 `body:learning:v1` localStorage key，沒有與漫畫的 Firebase 帳號或進度共用。清除瀏覽器資料可能遺失紀錄；進度頁提供有格式驗證的 JSON 備份匯出／匯入。
- 朗讀使用 Web Speech API 與裝置提供的日語／韓語聲音。裝置不支援或沒有對應聲音時會提示，沒有預錄母語音檔或語音評分服務。
- 學習計時在課程、字母或字卡頁面於前景且近期有操作時累積；非學習頁、背景頁與閒置狀態不持續累積。

### 開發與驗證

網站以原生 ES modules 運作，不需要前端打包即可由 GitHub Pages 提供。從 repository 根目錄啟動 HTTP server：

```sh
python3 -m http.server 8080
```

資料契約與學習紀錄測試（Node.js 20 以上）：

```sh
npm ci --ignore-scripts
npm test
```

開發測試使用 Happy DOM 驗證真實頁面互動，不是網頁執行時的相依套件；語法、資料契約與 DOM 測試不能取代不同裝置的實際畫面和語音驗證。

修改教材、樣式或模組後，執行 `npm run version:learning` 更新內容雜湊，避免部署後沿用舊的瀏覽器快取。`tests/layout.html` 提供 360／390／768／1024／1280px 的同源 iframe 畫面檢查，可確認各頁面在真實 CSS 視窗寬度下的版面；該頁不加入搜尋索引或正式導覽。

主要檔案：

| 檔案 | 用途 |
|---|---|
| `learning/courses/ja.js`、`ko.js` | 課程、字母、字卡、題目與來源 |
| `learning/catalog.js` | 課程與字卡索引 |
| `learning/app.js`、`learning.css` | 四個學習頁的共同互動與響應式介面 |
| `learning/store.js` | 本機紀錄、複習排程、統計與備份驗證 |
| `learning/speech.js` | 裝置朗讀與失敗提示 |
| `learning/home.js` | Body 首頁的實際學習摘要 |
| `tests/` | 課程契約與學習狀態測試 |
