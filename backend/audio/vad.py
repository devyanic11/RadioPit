import torch
import numpy as np
import librosa
import logging

class VoiceActivityDetector:
    """Voice Activity Detection wrapper using Silero with energy-based fallback."""
    def __init__(self):
        self.available = False
        self.model = None
        self.utils = None
        try:
            self.model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                                               model='silero_vad',
                                               force_reload=False,
                                               trust_repo=True)
            self.utils = utils
            self.available = True
            logging.info("Silero VAD loaded successfully.")
        except Exception as e:
            logging.warning(f"Failed to load Silero VAD, using fallback. Error: {e}")

    def detect_speech(self, audio_array, sample_rate):
        """
        Detect speech segments in audio array.
        Returns list of (start_ms, end_ms) tuples.
        """
        if self.available and self.model is not None:
            (get_speech_timestamps, _, _, _, _) = self.utils
            try:
                # Silero expects tensor of shape (samples,) or (1, samples) float32 in [-1, 1]
                tensor = torch.from_numpy(audio_array).float()
                if tensor.dim() > 1:
                    tensor = tensor.squeeze()
                timestamps = get_speech_timestamps(tensor, self.model, sampling_rate=sample_rate)
                return [(t['start'] / sample_rate * 1000, t['end'] / sample_rate * 1000) for t in timestamps]
            except Exception as e:
                logging.error(f"Silero VAD error: {e}, using fallback.")
        
        # Energy-based fallback
        return self._energy_vad(audio_array, sample_rate)

    def _energy_vad(self, audio_array, sample_rate):
        """Simple energy-based VAD fallback."""
        window_ms = 30
        window_samples = int(sample_rate * window_ms / 1000)
        
        # Calculate RMS energy
        rms = librosa.feature.rms(y=audio_array, frame_length=window_samples, hop_length=window_samples)[0]
        
        # Threshold at mean + 0.5*std
        threshold = np.mean(rms) + 0.5 * np.std(rms)
        is_speech = rms > threshold
        
        # Merge segments
        segments = []
        current_segment = None
        for i, speech in enumerate(is_speech):
            time_ms = i * window_ms
            if speech:
                if current_segment is None:
                    current_segment = [time_ms, time_ms + window_ms]
                else:
                    current_segment[1] = time_ms + window_ms
            else:
                if current_segment is not None:
                    segments.append(current_segment)
                    current_segment = None
        if current_segment is not None:
            segments.append(current_segment)
            
        # Merge gaps < 300ms
        merged_segments = []
        for seg in segments:
            if not merged_segments:
                merged_segments.append(seg)
            else:
                last_seg = merged_segments[-1]
                if seg[0] - last_seg[1] < 300:
                    last_seg[1] = seg[1]
                else:
                    merged_segments.append(seg)
                    
        # Drop segments < 200ms
        final_segments = [seg for seg in merged_segments if seg[1] - seg[0] >= 200]
        return [(s[0], s[1]) for s in final_segments]

    def segment_audio(self, audio_path):
        """Load audio and segment into utterances."""
        audio, sr = librosa.load(audio_path, sr=16000)
        timestamps = self.detect_speech(audio, sr)
        
        utterances = []
        for start_ms, end_ms in timestamps:
            start_sample = int(start_ms * sr / 1000)
            end_sample = int(end_ms * sr / 1000)
            utterances.append(audio[start_sample:end_sample])
            
        return utterances
