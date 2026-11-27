"""Convert audio with ffmpeg and keep conversion errors out of the recognisers."""
import subprocess


def convert_audio(args, *, operation, audio=None):
    try:
        result = subprocess.run(['ffmpeg', '-v', 'error', *args], input=audio, capture_output=True)
    except FileNotFoundError as error:
        raise RuntimeError(f'{operation}: ffmpeg is not available') from error
    if result.returncode:
        detail = result.stderr.decode('utf-8', errors='replace').strip()
        raise RuntimeError(f'{operation}: ffmpeg exited with status {result.returncode}: {detail or "no details"}')
    if not result.stdout:
        raise RuntimeError(f'{operation}: ffmpeg returned no audio')
    return result.stdout


def decode_mp3(audio, rate):
    data = convert_audio(
        ['-f', 'mp3', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', str(rate), '-'],
        operation='Decode MP3', audio=audio,
    )
    if len(data) % 4:
        raise RuntimeError('Decode MP3: ffmpeg returned an incomplete audio sample')
    return data
