# 發音課的錄音工具

App 不需要這個資料夾就能跑；只有要改發音課的內容或重錄聲音時才用得到。成品是 `src/data/pronunciation.json`（課程內容）和 `public/pron/*.pack`（聲音）。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `course.txt` | 課程原稿。`#L` 一堂課、`H` 講解、`T` 容易錯的地方、`P<n>` 一組候選對比字（照喜好排序，取前 n 組錄得清楚的）、`W` 可以點來聽的字、`X` 切成音節的長單字（拼字切法｜單字｜中文｜慢速念法的音標，切在同樣的地方）、`Q` 測驗題、`S` 跟讀的句子 |
| `phonemes.py` | 少數要自己指定音標的句子（can 的弱讀、連音裡的彈舌 t） |
| `course.py` | 讀原稿；`python3 course.py ../../src/data/pronunciation.json` 寫出 App 用的課程檔 |
| `lib.py` | 合成（Kokoro-82M）、轉音標（misaki）、檢查（Whisper small.en）共用的程式 |
| `record.py` | 錄音並評分：`python3 record.py f`、`python3 record.py m` |
| `regrade.py` | 檢查方法改了以後，把已經錄好的每一段重新評分（不重錄）：`python3 regrade.py f` |
| `fix_one.py` | 某一段剛好在及格邊緣時，用原來的聲音換幾種速度重錄、留最清楚的：`python3 fix_one.py m had` |
| `intonation.py`、`pitchwork.py` | 語調那一堂：量句尾音高，把該上升的句尾拉上去（見下面）：`python3 intonation.py p14` → `intonation.json` |
| `syllables.py` | 長單字切音節：慢速的整個字、每一段、一段一段加長（見下面）：`python3 syllables.py f`、`python3 syllables.py m` → `out/syllables-<f\|m>.json` |
| `timed_model.py` | 做出 `kokoro-timed.onnx`：同一個語音模型多一個輸出，回報每個音有多長（切音節要用） |
| `phon.py` | 第二個檢查用的耳朵：英文音素辨識（WavLM），把聽到的音一個一個寫下來 |
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

## 長單字切音節

`X` 開頭的字（第 16、17 堂）除了整個字的錄音，還有從**同一段慢速錄音**切出來的：慢速的整個字（`beautiful~slow`）、每一段（`beautiful~1`…）、一段一段加長（`beautiful~1-2`…；全部加起來就是慢速的整個字）。

為什麼不直接錄每一段：這個語音模型念不出單獨一個音節。給它 [bʌ] 它念成 bye、給 [pɪ] 念成 pay（語音辨識和音素辨識都這樣聽），因為英文裡沒有這樣單獨成字的音。所以改成：

1. 用「慢速念法」的音標合成整個字（口語裡的彈舌 t 換成清楚的 t），速度 0.8。用的是 `kokoro-timed.onnx`，它會回報每個音的長度。
2. 用 Praat 的疊加法把這段錄音拉長 1.5 倍（音高和每個音都不變）。直接叫模型用一半的速度念會糊掉（hospital 被聽成 "I have asked better all"）。
3. 照模型回報的長度找出每個音節的交界。模型回報的時間比實際的聲音**晚**大約 0.065 秒 ÷ 速度（用 s 的嘶聲量的：四個聲音、四種速度，速度 1 時 0.067、0.8 時 0.080、0.72 時 0.090，上下約 0.02），所以先往前移這麼多，再挪到前後 30 毫秒內最安靜的地方下刀。
4. 每一段前後留一點空白、淡入淡出；太小聲的弱音節放大，但不超過整個字音量的 2.5 倍。

檢查：

- **慢速的整個字**壓成 mp3 之後自由聽寫，要聽回同一個字（原樣一次、往後移 12 毫秒一次）。聽不回來就換速度（0.72、0.88），再不行換同性別的另一個聲音。
- **每一段**用音素辨識寫下聽到的音，看有沒有聽到那一段的母音，結果記在 `recordings.json` 的 `syllables.vowel_heard`。這只是粗略的參考：四分之一秒的片段，辨識器本來就常聽錯，頭尾也會多聽到切口的雜音。**這些片段沒有人逐一聽過。**
- 整個字（正常速度）照前面「長單字」的規則檢查。

小段聽起來是「字的一部分」而不是單獨念的音節，課程裡有說明。

目前的結果：32 個字、女聲男聲共 64 段慢速錄音全部聽得回原字（打包後再驗一次也是）；220 個音節片段裡，音素辨識在 202 個聽到了該有的母音。有 6 段慢速錄音在整個字用的那個聲音裡聽不回來，換了同性別的另一個聲音（女聲 restaurant、expensive；男聲 remember、restaurant、prescription、stethoscope），所以這幾個字的小段和整個字是不同的人聲。

## 重錄

`record.py` 遇到已經錄過、音標沒變的段落會直接沿用；候選對比字錄到比課程需要的多三組清楚的就停（`--all` 全部錄）。

需要 Python 3.11+、ffmpeg，以及 `kokoro-onnx`、`misaki`（加 spaCy 的 `en_core_web_sm`）、`faster-whisper`、`cmudict`、`praat-parselmouth`、`soundfile`；切音節另外要 `onnx`、`onnxruntime`，和音素辨識模型 `onnx-community/wavlm-large-english-phoneme-ONNX` 的 `onnx/model.onnx`、`vocab.json`（放在這個資料夾的 `phon/`，或用 `PRON_PHONES` 指到別處；約 1.3 GB，跑的時候要 3 GB 左右的記憶體，女聲、男聲不要同時跑）。Kokoro 的 `kokoro-v1.0.onnx` 和 `voices-v1.0.bin`（kokoro-onnx 的 GitHub release）放在這個資料夾，或用環境變數 `PRON_MODELS` 指到別處。

```
python3 record.py f && python3 record.py m     # 兩個可以同時跑；錄好的不會重錄
python3 intonation.py p14
python3 choose.py                              # 選好每個字用哪個聲音（切音節要跟著整個字的聲音）
python3 timed_model.py                         # 只要做一次
python3 syllables.py f; python3 syllables.py m # 一個跑完再跑另一個
python3 choose.py                              # 再跑一次，把切音節的紀錄併進來；看最後列出的「要注意的地方」
python3 course.py ../../src/data/pronunciation.json
python3 pack.py ../../public/pron
python3 verify.py ../../public/pron            # 成品再驗一次
```

錄音的中間檔在 `out/`（不進版本庫）。改完記得跑 `npm test`：`tests/pronunciation.test.ts` 會檢查每一堂的每個字在兩包聲音裡都有。
