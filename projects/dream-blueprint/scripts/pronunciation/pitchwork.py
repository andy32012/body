"""Pitch tools for the intonation lesson: measuring how a sentence ends, cutting the first clause out of a longer take,
and giving a clause a rising end by overlap-add resynthesis (Praat's Manipulation, the standard tool for this in phonetics)."""
import numpy as np, parselmouth
from parselmouth.praat import call

def bounds(g): return (70, 320) if g == 'm' else (110, 520)
def pitch_track(x, sr, g, step=0.01):
    lo, hi = bounds(g)
    p = parselmouth.Sound(x.astype(np.float64), sampling_frequency=sr).to_pitch(time_step=step, pitch_floor=lo, pitch_ceiling=hi)
    return p.xs(), p.selected_array['frequency']
def final_move(x, sr, g):
    """Semitones between the end of the sentence and the stretch before it (voiced parts only)."""
    _, f0 = pitch_track(x, sr, g)
    v = f0[f0 > 0]
    if len(v) < 12: return None
    st = 12 * np.log2(v / np.median(v))
    n = len(st)
    return float(np.median(st[int(n * 0.86):]) - np.median(st[int(n * 0.5):int(n * 0.8)]))
def harmonicity(x, sr, start):
    """Mean harmonics-to-noise ratio (dB) of the voiced part after `start` seconds: drops when resynthesis makes the voice rough."""
    h = parselmouth.Sound(x.astype(np.float64), sampling_frequency=sr).to_harmonicity(time_step=0.01)
    t, v = h.xs(), h.values[0]
    keep = (t >= start) & (v > -100)
    return float(np.mean(v[keep])) if keep.any() else None

def first_clause(x, sr):
    """A take of "clause, clause." cut at the pause between the two."""
    win = int(sr * 0.01)
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
    quiet = np.append(env < 0.03 * env.max(), False)
    best, start = None, None
    for i, q in enumerate(quiet):
        if q and start is None: start = i
        if not q and start is not None:
            mid = (start + i) / 2 / len(x)
            if i - start > sr * 0.06 and 0.3 < mid < 0.7 and (best is None or i - start > best[1] - best[0]): best = (start, i)
            start = None
    if not best: return None
    out = x[:best[0] + int(sr * 0.08)].copy()
    fade = int(sr * 0.02)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out

def rising_end(x, sr, g, rise=7.5, span=0.42):
    """The last `span` seconds of voicing climb by `rise` semitones. Returns (audio, start of the climb)."""
    lo, hi = bounds(g)
    snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=sr)
    t, f0 = pitch_track(x, sr, g)
    voiced = t[f0 > 0]
    if len(voiced) < 12: return None, None
    end = float(voiced[-1])
    start = max(float(voiced[0]), end - span)
    before = f0[(t >= start - 0.25) & (t < start) & (f0 > 0)]
    level = float(np.median(before)) if len(before) else float(np.median(f0[f0 > 0]))
    manip = call(snd, "To Manipulation", 0.01, lo, hi)
    tier = call(manip, "Extract pitch tier")
    call(tier, "Remove points between", start, snd.xmax)
    first = level * 2 ** (-1.0 / 12)                       # the climb starts a little under the level of the sentence
    for k in range(13):
        u = k / 12
        call(tier, "Add point", start + (end - start) * u, first * 2 ** (rise * u ** 1.25 / 12))
    call([tier, manip], "Replace pitch tier")
    out = call(manip, "Get resynthesis (overlap-add)")
    return out.values[0].astype(np.float32), start
