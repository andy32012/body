"""A second pair of ears for clips that are not words: an English phoneme recogniser (WavLM, CTC).
It writes down the sounds it hears, so a single syllable can be checked without a dictionary word to compare with."""
import json, os, numpy as np, onnxruntime as ort
HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.environ.get('PRON_PHONES', os.path.join(HERE, 'phon'))
_vocab = {v: k for k, v in json.load(open(os.path.join(DIR, 'vocab.json'))).items()}
_opts = ort.SessionOptions(); _opts.intra_op_num_threads = int(os.environ.get('PRON_THREADS', '2'))
_sess = ort.InferenceSession(os.path.join(DIR, 'model.onnx'), _opts, providers=['CPUExecutionProvider'])
_inputs = [i.name for i in _sess.get_inputs()]
def heard(x16k):
    """The sounds in a 16 kHz clip, as a list of this model's symbols (aj, ɹ̩, t͡ʃ …)."""
    x = np.concatenate([np.zeros(4000, np.float32), x16k.astype(np.float32), np.zeros(4000, np.float32)])
    x = (x - x.mean()) / (x.std() + 1e-7)
    feed = {'input_values': x[None, :]}
    if 'attention_mask' in _inputs: feed['attention_mask'] = np.ones((1, len(x)), dtype=np.int64)
    ids = _sess.run(None, feed)[0][0].argmax(-1)
    out, last = [], None
    for i in ids:
        if i != last and _vocab[int(i)] not in ('[PAD]', '|', '[UNK]'): out.append(_vocab[int(i)])
        last = i
    return out
