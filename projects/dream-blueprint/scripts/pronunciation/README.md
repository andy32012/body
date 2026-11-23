# 發音課的錄音工具

App 不需要這個資料夾就能跑；只有要改發音課的內容或重錄聲音時才用得到。成品是 `src/data/pronunciation.json`（課程內容）和 `public/pron/*.pack`（聲音）。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `course.txt` | 課程原稿。`#L` 一堂課、`H` 講解、`T` 容易錯的地方、`P<n>` 一組候選對比字（照喜好排序，取前 n 組錄得清楚的）、`W` 可以點來聽的字、`Q` 測驗題、`S` 跟讀的句子 |
| `phonemes.py` | 少數要自己指定音標的句子（can 的弱讀、連音裡的彈舌 t） |
| `course.py` | 讀原稿；`python3 course.py ../../src/data/pronunciation.json` 寫出 App 用的課程檔 |
| `lib.py` | 合成（Kokoro-82M）、轉音標（misaki）、檢查（Whisper small.en）共用的程式 |
| `record.py` | 錄音並評分：`python3 record.py f`、`python3 record.py m` |
| `regrade.py` | 檢查方法改了以後，把已經錄好的每一段重新評分（不重錄）：`python3 regrade.py f` |
| `fix_one.py` | 某一段剛好在及格邊緣時，用原來的聲音換幾種速度重錄、留最清楚的：`python3 fix_one.py m had` |
| `intonation.py`、`pitchwork.py` | 語調那一堂：量句尾音高，把該上升的句尾拉上去（見下面）：`python3 intonation.py p14` → `intonation.json` |
| `choose.py` | 依評分決定每堂課留哪幾組對比字、每一段用哪個聲音 → `chosen.json`、`recordings.json` |
| `pack.py` | 轉成 mp3 並打包：`python3 pack.py ../../public/pron` |
| `verify.py` | 把打包好的每一段從包裡拿出來、解碼後再檢查一次：`python3 verify.py ../../public/pron` |
| `chosen.json` | 目前課程用的對比字和每一段的聲音 |
| `recordings.json` | 課程裡每一段錄音的檢查紀錄（音標、速度、評分、輸給它的字差多少、語調那堂的句尾音高） |

## 怎麼檢查一段錄音

聲音是合成的，沒有人逐一聽過，所以每一段都用語音辨識當耳朵：

- **單字**：不讓辨識器自由聽寫（單字太短，它會亂猜），而是強制比分數：這個字，對上所有「只差一個音」的常見字（CMU 發音字典 × 本專案字表），再對上它的對比字。辨識器本身有偏好（單獨一個字時，"Right." 比 "Light." 常見得多），所以每個分數都先扣掉它對一段雜音的分數，只看聲音本身帶來的差別。要領先「差一個音的字」1.0、領先對比字 2.5（自然對數，約 12 倍）才算清楚；對比字還要在扣掉偏好之前就不輸。
- **片語和句子**：自由聽寫，要一字不差；can／can't 那種成對的句子另外強制比分數。
- **量三次取最差**：同一段錄音只是多 10 毫秒空白或壓成 mp3，分數就會差一兩個單位。所以每一段量三次（壓成 mp3 再解開的版本、同一版本往後移 12 毫秒、原始版本往後移 25 毫秒），三次都清楚才算。mp3 用 96 kbit/s：48 的時候 guess／gas、tree／three、ban／van 這幾組的差距幾乎被壓沒了。
- **一組對比字用同一個聲音**：女聲、男聲各有四個候選聲音，照順序試，兩個字都清楚才用；兩種聲音都找得到清楚的版本，這一組才進課程。所以 `course.txt` 的候選比課程裡實際出現的多。課名用的那一組優先；其餘先照原稿順序取「過關還多出 2.0」的，不夠再從差距最大的補。
- **長單字**（hospital、information）沒有「只差一個音」的字可以比，改成自由聽寫要聽回同一個字。
- **語調**：量句尾和前一段的音高差（半音）。這個模型幾乎每一句的句尾都往下掉，yes／no 問句也一樣（男聲試了八個聲音、各種標點都不會上升）。所以：該下降的句子用原本合成的版本，量到 −1.5 以下才用；該上升的句子先合成「子句, 子句.」再從逗號切開取前半（不在句尾的子句聲音正常、不會沙啞），然後用 Praat 的疊加重新合成把最後 0.4 秒的音高往上拉 7.5 個半音，做完再量：句尾要比前面高 3 個半音以上、諧噪比不能掉超過 3 dB、聽寫還要一字不差。`recordings.json` 的 `pitch` 欄寫明每一句是原樣還是後製。
- 重音那一堂靠的是音標：合成時給的就是標好重音的音標（`recordings.json` 的 `phonemes`，`ˈ` 後面是重音節）。

評分只能說明「辨識器分得出來」，不等於真人發音的品質。

## 重錄

`record.py` 遇到已經錄過、音標沒變的段落會直接沿用；候選對比字錄到比課程需要的多三組清楚的就停（`--all` 全部錄）。

需要 Python 3.11+、ffmpeg，以及 `kokoro-onnx`、`misaki`（加 spaCy 的 `en_core_web_sm`）、`faster-whisper`、`cmudict`、`praat-parselmouth`、`soundfile`。Kokoro 的 `kokoro-v1.0.onnx` 和 `voices-v1.0.bin`（kokoro-onnx 的 GitHub release）放在這個資料夾，或用環境變數 `PRON_MODELS` 指到別處。

```
python3 record.py f && python3 record.py m     # 兩個可以同時跑；錄好的不會重錄
python3 intonation.py p14
python3 choose.py                              # 看最後列出的「要注意的地方」（目前是 0 項）
python3 course.py ../../src/data/pronunciation.json
python3 pack.py ../../public/pron
python3 verify.py ../../public/pron            # 成品再驗一次
```

錄音的中間檔在 `out/`（不進版本庫）。改完記得跑 `npm test`：`tests/pronunciation.test.ts` 會檢查每一堂的每個字在兩包聲音裡都有。
