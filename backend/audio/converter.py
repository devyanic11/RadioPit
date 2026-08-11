import os
import subprocess
import logging

def convert_audio_to_wav(input_path: str, output_path: str = None) -> str:
    """Converts any audio file (webm, mp3, ogg, m4a, wav) to 16kHz mono 16-bit PCM WAV using ffmpeg."""
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}_16k.wav"
        
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return output_path
    except Exception as e:
        logging.error(f"FFmpeg audio conversion error on {input_path}: {e}")
        # If conversion fails and original exists, return original as fallback
        return input_path
