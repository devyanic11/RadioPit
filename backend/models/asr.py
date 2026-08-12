import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import logging
import numpy as np

class ASREngine:
    """RealtimeSTT Speech-to-Text Engine powered by faster-whisper backend."""
    def __init__(self, model_id='tiny.en'):
        self.available = False
        self.model = None
        try:
            from faster_whisper import WhisperModel
            logging.info("Initializing RealtimeSTT faster-whisper engine (tiny.en)...")
            self.model = WhisperModel("tiny.en", device="cpu", compute_type="float32")
            self.available = True
            logging.info("RealtimeSTT faster-whisper engine initialized successfully.")
        except Exception as e:
            logging.error(f"Failed to initialize RealtimeSTT faster-whisper engine: {e}", exc_info=True)

    def transcribe(self, audio_path_or_array, sample_rate=16000):
        """Transcribe audio with word-level timestamps using Realtime faster-whisper backend."""
        if not self.available or self.model is None:
            return {
                'text': '',
                'word_timestamps': [],
                'segments': [],
                'language': 'en',
                'duration': 0.0,
                'confidence': 0.0
            }

        try:
            import librosa
            if isinstance(audio_path_or_array, str):
                audio, sr = librosa.load(audio_path_or_array, sr=sample_rate)
            else:
                audio = audio_path_or_array

            duration_sec = float(len(audio) / sample_rate)

            # High-speed RealtimeSTT faster-whisper transcription
            segments_generator, info = self.model.transcribe(
                audio, 
                beam_size=5,
                vad_filter=False,
                word_timestamps=True,
                language="en"
            )

            segments = list(segments_generator)
            full_text_parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
            full_text = " ".join(full_text_parts).strip()

            word_timestamps = []
            word_probs = []
            for seg in segments:
                if hasattr(seg, 'words') and seg.words:
                    for w in seg.words:
                        clean_w = w.word.strip()
                        if clean_w:
                            word_timestamps.append({
                                'word': clean_w,
                                'start': round(float(w.start), 2),
                                'end': round(float(w.end), 2)
                            })
                            if getattr(w, 'probability', None) is not None:
                                word_probs.append(float(w.probability))

            # Real ASR confidence: mean word-level probability from faster-whisper
            if word_probs:
                confidence = float(np.mean(word_probs))
            else:
                confidence = 0.5 if full_text else 0.0

            # If segment text exists but word_timestamps was empty, generate step timestamps
            if full_text and not word_timestamps:
                words = full_text.split()
                step = duration_sec / max(len(words), 1)
                for idx, w in enumerate(words):
                    word_timestamps.append({
                        'word': w,
                        'start': round(idx * step, 2),
                        'end': round((idx + 1) * step, 2)
                    })

            return {
                'text': full_text,
                'word_timestamps': word_timestamps,
                'segments': [{'start': w['start'], 'end': w['end'], 'text': w['word']} for w in word_timestamps],
                'language': getattr(info, 'language', 'en'),
                'duration': duration_sec,
                'confidence': confidence
            }
        except Exception as e:
            logging.error(f"RealtimeSTT faster-whisper transcription error: {e}")
            return {
                'text': '',
                'word_timestamps': [],
                'segments': [],
                'language': 'en',
                'duration': 0.0,
                'confidence': 0.0
            }
