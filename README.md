# Body

網站：https://xitian.page

漫畫、內外科護理和日英韓語言學習的入口網站。

- `index.html`、`style.css`：Body 首頁（方塊拼貼）
- `comic/`：《西天》線上漫畫
- `nursing/`：內科黑板課目錄（心臟、血液、免疫、腫瘤）
  - `nursing/heart-failure/`：心衰竭：左 vs 右
- `japanese/`、`english/`、`korean/`：語言課（準備中）
- `assets/site.css`：內頁共用樣式

黑板課的字會照筆順一筆一畫寫出來，圖邊講邊畫，同時播放語音講解。語音事先生成好放在各課的 `audio/` 資料夾，網頁播放時不連任何 API，也沒有存放任何金鑰。

筆順資料來自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)（Arphic Public License，見 `licenses/`），英文字使用 Hershey 字型。
