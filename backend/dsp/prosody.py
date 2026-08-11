import numpy as np
import librosa
import parselmouth
from dataclasses import dataclass

@dataclass
class ProsodyResult:
    pitch_mean_hz: float
    pitch_std_hz: float
    pitch_range_hz: float
    speech_rate_wps: float
    vocal_intensity_db: float
    jitter_percent: float
    shimmer_percent: float
    pause_ratio: float
    hnr_db: float

class ProsodyAnalyzer:
    """Prosodic feature extractor."""
    def __init__(self):
        pass

    def analyze(self, audio_array, sample_rate, transcript_text=None) -> ProsodyResult:
        """Extract prosodic features from audio."""
        if len(audio_array) == 0 or np.all(audio_array == 0):
            return self._empty_result()
            
        try:
            # Praat requires 1D float array and sample rate
            snd = parselmouth.Sound(audio_array, sampling_frequency=sample_rate)
            
            # Pitch
            pitch = snd.to_pitch()
            pitch_values = pitch.selected_array['frequency']
            pitch_values = pitch_values[pitch_values > 0] # non-zero
            
            if len(pitch_values) > 0:
                pitch_mean = np.mean(pitch_values)
                pitch_std = np.std(pitch_values)
                pitch_range = np.max(pitch_values) - np.min(pitch_values)
            else:
                pitch_mean = pitch_std = pitch_range = 0.0
                
            # Intensity
            intensity = snd.to_intensity()
            intensity_values = intensity.values[0]
            valid_intensity = intensity_values[intensity_values > 0]
            vocal_intensity = np.mean(valid_intensity) if len(valid_intensity) > 0 else 0.0
            
            # Jitter / Shimmer / HNR
            point_process = parselmouth.praat.call(snd, "To PointProcess (periodic, cc)", 75.0, 600.0)
            jitter = parselmouth.praat.call(point_process, "Get jitter (local)", 0.0, 0.0, 0.0001, 0.02, 1.3)
            shimmer = parselmouth.praat.call([snd, point_process], "Get shimmer (local)", 0.0, 0.0, 0.0001, 0.02, 1.3, 1.6)
            harmonicity = snd.to_harmonicity()
            hnr = parselmouth.praat.call(harmonicity, "Get mean", 0, 0)
            
            # Sanitize Praat nan outputs
            jitter = 0.0 if np.isnan(jitter) else jitter * 100
            shimmer = 0.0 if np.isnan(shimmer) else shimmer * 100
            hnr = 0.0 if np.isnan(hnr) else hnr
            
            # Speech rate and pauses
            duration = snd.get_total_duration()
            
            # Simple pause detection based on intensity threshold
            if len(intensity_values) > 0:
                threshold = np.max(intensity_values) - 25 # dB below max
                pauses = np.sum(intensity_values < threshold) / len(intensity_values)
            else:
                pauses = 0.0
                
            word_count = len(transcript_text.split()) if transcript_text else 0
            speech_rate = word_count / duration if duration > 0 else 0.0
            
            return ProsodyResult(
                pitch_mean_hz=float(pitch_mean),
                pitch_std_hz=float(pitch_std),
                pitch_range_hz=float(pitch_range),
                speech_rate_wps=float(speech_rate),
                vocal_intensity_db=float(vocal_intensity),
                jitter_percent=float(jitter),
                shimmer_percent=float(shimmer),
                pause_ratio=float(pauses),
                hnr_db=float(hnr)
            )
            
        except Exception as e:
            return self._empty_result()

    def _empty_result(self) -> ProsodyResult:
        return ProsodyResult(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    def compute_stress_indicators(self, result: ProsodyResult) -> dict:
        """Compute normalized stress scores based on prosodic features."""
        # Normalization functions (roughly mapped to 0-1)
        # High pitch std and range -> higher stress
        pitch_var_score = np.clip((result.pitch_std_hz - 20) / 100, 0, 1)
        
        # High speech rate -> higher stress
        rate_score = np.clip((result.speech_rate_wps - 2.5) / 3.0, 0, 1)
        
        # High vocal intensity -> higher stress
        intensity_score = np.clip((result.vocal_intensity_db - 60) / 30, 0, 1)
        
        # High jitter -> higher stress
        jitter_score = np.clip(result.jitter_percent / 5.0, 0, 1)
        
        # Low HNR -> higher stress (voice is rougher)
        hnr_score = np.clip(1.0 - (result.hnr_db / 20.0), 0, 1)
        
        composite = (pitch_var_score * 0.3 + 
                     rate_score * 0.2 + 
                     intensity_score * 0.2 + 
                     jitter_score * 0.15 + 
                     hnr_score * 0.15)
                     
        return {
            'pitch_variance_stress': float(pitch_var_score),
            'rate_stress': float(rate_score),
            'intensity_stress': float(intensity_score),
            'voice_quality_stress': float((jitter_score + hnr_score) / 2),
            'composite_score': float(composite)
        }
