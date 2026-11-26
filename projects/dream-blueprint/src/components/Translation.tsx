import { useRef, useState, type ReactNode } from "react";
import TutorChat from "./TutorChat";
import { tutorKey } from "../lib/tutor";
import { clearDraft, readDraft, writeDraft } from "../lib/drafts";
import { AskWord } from "./AIChat";
import { updateStore } from "../lib/store";
import { addWeak, easeWeak, normalizeLabel } from "../lib/weakPoints";
import { dayKey } from "../lib/progress";
import { answered, compareWithReference, matchesReference, sameEnglish, type Verdict } from "../lib/evidence";
import StuckButton from "./StuckButton";
import { useTaskContext } from "../lib/taskContext";
import { sentenceFrame, type HintUse } from "../lib/lesson";
import type { Sentence } from "../lib/todayLesson";

/** How he marks his own answer (styles in pages/practice.css). */
export type Mark = "good" | "small" | "again";
const marks: [Mark, string][] = [
  ["good", "對了"],
  ["small", "小錯"],
  ["again", "不會"],
];

/** Hint levels: 1 self-check after writing, 2 a clearer hint, 3 a sentence frame, 4 the model answer.
 *  With saved/onHint the level survives a reload, so a hint once seen is never forgotten. */
export function Translation({
  sentence,
  onMark,
  checkpoint,
  preparation,
  saved,
  onHint,
  label,
  hideTags = false,
}: {
  preparation?: ReactNode;
  label?: string;
  /** Leave out the grammar tags above the box, when choosing the grammar is part of the task (主題總複習). */
  hideTags?: boolean;
  sentence: Sentence;
  onMark: (mark: Mark, revealed: boolean, info: { answer: string; firstVerdict?: Verdict; checkedText?: string }) => void;
  checkpoint: boolean;
  saved?: HintUse;
  onHint?: (use: HintUse) => void;
}) {
  const [answer, setAnswer] = useState(() => readDraft(sentence.id));
  const [hint, setHintLevel] = useState(() => saved?.h ?? 0);
  const [copied, setCopied] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [seenHint, setSeen] = useState(() => !!saved?.r || (saved?.h ?? 0) >= 2);
  const [firstVerdict, setFirstVerdict] = useState<Verdict | undefined>(() => saved?.v);
  // The exact text Claude's first verdict was about: editing the answer afterwards makes that verdict stale.
  const [checkedText, setCheckedText] = useState<string | undefined>(() => saved?.vt);
  const [askedHelp, setAskedHelp] = useState(() => !!saved?.c);
  // With Claude connected, 「請 Claude 批改」 sends the answer at once and there is no reference sentence to open:
  // Claude checks and, when asked (「直接告訴我」), gives the answer. The reference opens only if Claude can't be reached.
  const keyed = !!tutorKey();
  const [sendNow, setSendNow] = useState(false);
  const [claudeDown, setClaudeDown] = useState(false);
  function record(h: number, r: boolean, v = firstVerdict, c = askedHelp, vt = checkedText) {
    setHintLevel(h);
    setSeen(r);
    onHint?.({ h, r, ...(v ? { v } : {}), ...(v && vt !== undefined ? { vt } : {}), ...(c ? { c } : {}) });
  }
  const verdictStale = !!firstVerdict && checkedText !== undefined && !sameEnglish(checkedText, answer);
  useTaskContext({
    label: (checkpoint ? "小關卡" : "中翻英") + "：" + sentence.zh,
    detail: ["題目（中翻英）：" + sentence.zh, "這題練的文法：" + sentence.grammar.join("、"), "課本提示：" + sentence.hints.join(" ／ "),
      "參考答案（只供你判斷，他沒說要看答案前不要說出來）：" + sentence.reference.join(" / ")].join("\n"),
    draft: answer,
  });
  const mountedAt = useRef(Date.now());
  const ready = () => Date.now() - mountedAt.current > 450;
  const setHint = (h: number) => { if (ready()) record(h, seenHint || h >= 2); };
  /** The shared weak-point list, when no Claude verdict did it already: a self-marked miss counts against the
   *  sentence's grammar; written right alone (and matching a reference) takes one miss off it. */
  function noteWeak(mark: Mark, revealed: boolean) {
    if (firstVerdict) return;
    const label = sentence.grammar.map((g) => normalizeLabel(g)).find(Boolean);
    if (!label) return;
    const day = dayKey();
    if (mark === "again" || mark === "small")
      updateStore((prev) => ({ ...prev, notes: addWeak(prev.notes, label, day, { w: answer, r: sentence.reference[0] ?? "" }, "self") }));
    else if (!revealed && matchesReference(answer, sentence.reference))
      updateStore((prev) => ({ ...prev, notes: easeWeak(prev.notes, label) }));
  }
  const setSeenHint = (r: boolean) => record(hint, r);
  async function copyAnswer() {
    const value =
      sentence.zh +
      "\n我的答案：" +
      answer +
      "\n參考句：" +
      sentence.reference.join(" / ");
    try {
      await navigator.clipboard.writeText(value);
      setCopied("已複製");
    } catch {
      setManualCopy(value);
      setCopied("請長按選取並複製下方文字。");
    }
  }
  return (
    <>
      <div className="pr-label">{label ?? (checkpoint ? "單元小關卡" : "一句中翻英")}</div>
      <h2 className="pr-question">{sentence.zh}</h2>
      {!hideTags && (
        <div className="pr-tags">
          {sentence.grammar.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {preparation}
      <label className="pr-field">
        我的英文
        <textarea
          lang="en"
          autoCapitalize="sentences"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); writeDraft(sentence.id, e.target.value); }}
          placeholder="把想到的英文寫在這裡"
        />
      </label>
      {hint === 0 && (
        <div className="pr-actions">
          <button className="pr-main" onClick={() => { setSendNow(keyed); setHint(1); }}>
            {keyed ? "請 Claude 批改" : "我寫好了"}
          </button>
          <button
            className="pr-link"
            onClick={() => setHint(2)}
          >
            我想看提示
          </button>
          <StuckButton onUse={() => { if (!askedHelp) { setAskedHelp(true); record(hint, seenHint, firstVerdict, true); } }} />
        </div>
      )}
      {hint >= 1 && <TutorChat sentence={sentence} answer={answer} autoSend={sendNow} onError={() => setClaudeDown(true)} onReveal={() => setSeenHint(true)}
        onRevise={(t) => { setAnswer(t); writeDraft(sentence.id, t); }}
        onVerdict={(v, attempt, text) => { if (attempt === 1 && !firstVerdict) { setFirstVerdict(v); setCheckedText(text); record(hint, seenHint, v, askedHelp, text); } }} />}
      {hint >= 1 && (
        <section className="pr-hint">
          <strong>自己檢查看看</strong>
          <p>{sentence.hints[0]}</p>
          {hint >= 2 && <p>{sentence.hints[1] || sentence.why}</p>}
          {hint >= 3 && <p className="pr-frame" lang="en">{sentenceFrame(sentence.reference[0])}</p>}
          {hint < 4 && (
            <div className="pr-actions">
              {hint === 1 && (
                <button className="pr-link" onClick={() => setHint(2)}>
                  再清楚一點
                </button>
              )}
              {hint === 2 && (
                <button className="pr-link" onClick={() => setHint(3)}>
                  給我句架
                </button>
              )}
              {(!keyed || claudeDown) && (
                <button className="pr-link" onClick={() => setHint(4)}>
                  看參考句
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {hint === 4 && (
        <section className="pr-reference">
          <small>參考句</small>
          {sentence.reference.map((en) => (
            <p lang="en" key={en}>
              {en}
            </p>
          ))}
          <span>{sentence.why}</span>
          {answered(answer) && (() => {
            const diff = compareWithReference(answer, sentence.reference);
            return diff && !diff.same && (
              <p className="pr-compare">
                <small>跟最接近的參考句比：</small>{" "}
                <span lang="en">{diff.words.map((t, i) => <span key={i} className={t.extra ? "pr-diff-extra" : undefined}>{t.w} </span>)}</span>
                {diff.missing.length > 0 && <><br /><small>參考句有、你沒寫到的字：</small> <span lang="en" className="pr-diff-missing">{diff.missing.join(" ")}</span></>}
                <br /><small>畫波浪線的字跟參考句不一樣。寫法不同也可能是對的，重點是意思有沒有變：時間、人物、動作或否定換了，就是意思不一樣。</small>
              </p>
            );
          })()}
          {sentence.newWords.length > 0 && (
            <div className="pr-tags">
              {sentence.newWords.map((word) => (
                <span key={word.en}>
                  {word.en} · {word.zh} <AskWord en={word.en} zh={word.zh} />
                </span>
              ))}
            </div>
          )}
          <button className="pr-link" onClick={copyAnswer}>
            複製這句和我的答案
          </button>
          <small role="status">{copied}</small>
          {manualCopy && (
            <textarea
              aria-label="可複製的答案"
              readOnly
              value={manualCopy}
              onFocus={(e) => e.target.select()}
            />
          )}
        </section>
      )}
      {hint >= 1 && (
        <fieldset className="pr-marks">
          <legend>我的自評</legend>
          {marks.map(([mark, label]) => (
            <button
              key={mark}
              disabled={mark !== "again" && !answered(answer)}
              onClick={() => { if (!ready()) return; clearDraft(sentence.id); noteWeak(mark, seenHint || hint >= 2 || askedHelp); onMark(mark, seenHint || hint >= 2 || askedHelp, { answer, firstVerdict, checkedText }); }}
            >
              {label}
            </button>
          ))}
          {!answered(answer) && <p className="pr-blank-note">還沒寫答案：寫下來才能按「對了」或「小錯」。真的不會就按「不會」，沒寫的題目不算作答。</p>}
          {answered(answer) && (
            <p className="pr-mark-note">
              {firstVerdict === "good" && verdictStale ? (matchesReference(answer, sentence.reference) ? "你在 Claude 確認之後改了答案，改過的跟參考答案一樣：按「對了」仍記成當次獨立完成。" : "你在 Claude 確認之後又改了答案：改過的這一版還沒人確認，按「對了」會記成「自評完成・待確認」。")
                : firstVerdict === "good" ? "Claude 確認意思和文法都對：按「對了」會記成當次獨立完成。"
                : firstVerdict === "changed" ? "Claude 說意思跟題目不一樣：改好之後也只算有提示完成。"
                : firstVerdict ? "Claude 指出要改的地方：照著改好，這次記成有提示完成。"
                : matchesReference(answer, sentence.reference) ? "跟參考答案一樣，已確認：按「對了」會記成當次獨立完成。"
                : "寫法跟參考答案不完全一樣，可能也對。沒有人確認前，按「對了」會先記成「自評完成・待確認」，之後可以請 Claude 看。意思如果變了，請按「小錯」。"}
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}

export default Translation;
