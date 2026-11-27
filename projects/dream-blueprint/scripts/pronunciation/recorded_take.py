"""Read a WAV without treating a missing, truncated, or silent recording as a valid take."""
from math import isfinite
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf
from course import publish_recording_files, write_json


def read_take(path, expected_seconds=None):
    with sf.SoundFile(path) as recording:
        frames, rate = recording.frames, recording.samplerate
        if recording.format not in ('WAV', 'WAVEX', 'RF64'):
            raise ValueError('not a WAV recording')
        audio = recording.read(dtype='float32')
    if not frames or len(audio) != frames or rate <= 0:
        raise ValueError('empty or incomplete WAV')
    if expected_seconds is not None:
        if type(expected_seconds) not in (int, float) or not isfinite(expected_seconds) or expected_seconds < 0:
            raise ValueError('invalid duration in the recording log')
        if abs(frames / rate - expected_seconds) >= 0.01:
            raise ValueError('duration differs from the recording log')
    if audio.ndim != 1 or not np.isfinite(audio).all() or not np.any(audio):
        raise ValueError('invalid or silent WAV')
    return audio, rate


def write_take(path, audio, rate):
    """Store the exact PCM_16 samples represented by a normalised waveform."""
    samples = np.clip(np.rint(audio * 32768), -32768, 32767).astype(np.int16)
    sf.write(path, samples, rate, subtype='PCM_16')
    read_take(path)


def save_take(path, audio, rate, log_path, takes):
    """Update the recording and the matching log together."""
    path = Path(path)
    log_path = Path(log_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.record-', dir=log_path.parent) as temporary:
        staging = Path(temporary)
        wav = staging / path.name
        write_take(wav, audio, rate)
        next_log = staging / log_path.name
        write_json(next_log, takes)
        publish_recording_files([(wav, path), (next_log, log_path)], staging)
