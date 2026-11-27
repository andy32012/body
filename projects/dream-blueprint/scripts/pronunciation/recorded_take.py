"""Read a WAV without treating a missing, truncated, or silent recording as a valid take."""
import numpy as np
import soundfile as sf


def read_take(path, expected_seconds=None):
    with sf.SoundFile(path) as recording:
        frames, rate = recording.frames, recording.samplerate
        audio = recording.read(dtype='float32')
    if not frames or len(audio) != frames:
        raise ValueError('empty or incomplete WAV')
    if expected_seconds is not None and abs(frames / rate - expected_seconds) >= 0.01:
        raise ValueError('duration differs from the recording log')
    if audio.ndim != 1 or not np.isfinite(audio).all() or not np.any(audio):
        raise ValueError('invalid or silent WAV')
    return audio, rate
