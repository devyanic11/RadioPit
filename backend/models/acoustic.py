import logging
import numpy as np
import librosa

class AcousticAnalyzer:
    """Acoustic emotion model using Hugging Face Transformers audio classification."""
    def __init__(self, model_id="superb/wav2vec2-base-superb-er"):
        self.available = False
        self.classifier = None
        try:
            from transformers import pipeline
            logging.info(f"Loading Hugging Face Acoustic model ({model_id})...")
            self.classifier = pipeline("audio-classification", model=model_id)
            self.available = True
            logging.info(f"Hugging Face Acoustic model ({model_id}) loaded successfully.")
        except Exception as e:
            logging.warning(f"Failed to load Hugging Face Acoustic model ({model_id}). Error: {e}")

    def analyze(self, audio_array, sample_rate=16000):
        """Analyze audio array for arousal, valence, and dominance."""
        if self.available and self.classifier is not None:
            try:
                # Hugging Face inference on raw audio array
                res = self.classifier({"raw": audio_array, "sampling_rate": sample_rate})
                scores = {item['label'].lower(): item['score'] for item in res}
                
                # superb/wav2vec2-base-superb-er outputs: 'ang', 'hap', 'neu', 'sad'
                angry = scores.get('ang', 0.0) + scores.get('angry', 0.0)
                happy = scores.get('hap', 0.0) + scores.get('happy', 0.0)
                neutral = scores.get('neu', 0.0) + scores.get('neutral', 0.0)
                sad = scores.get('sad', 0.0)
                
                arousal = min(1.0, max(0.0, angry * 0.95 + happy * 0.75 + (1.0 - neutral) * 0.5))
                valence = min(1.0, max(0.0, happy * 0.9 + neutral * 0.6 - angry * 0.8 - sad * 0.7))
                dominance = min(1.0, max(0.0, angry * 0.9 + neutral * 0.5 - sad * 0.6))
                
                return {
                    'arousal': float(arousal),
                    'valence': float(valence),
                    'dominance': float(dominance)
                }
            except Exception as e:
                logging.error(f"Hugging Face Acoustic inference error: {e}")

        # Fallback heuristic
        return self._fallback_analyze(audio_array, sample_rate)

    def _fallback_analyze(self, audio_array, sample_rate):
        """Simple energy/pitch heuristic to estimate emotion."""
        if len(audio_array) == 0:
            return {'arousal': 0.3, 'valence': 0.5, 'dominance': 0.5}
            
        rms = librosa.feature.rms(y=audio_array)[0]
        rms_normalized = np.mean(rms) / 0.08
        arousal = np.clip(rms_normalized * 1.2, 0.1, 1.0)
        
        pitches, magnitudes = librosa.piptrack(y=audio_array, sr=sample_rate)
        pitch_values = pitches[magnitudes > np.max(magnitudes) * 0.1]
        pitch_var = np.var(pitch_values) if len(pitch_values) > 0 else 1000.0
        pitch_variance_normalized = min(pitch_var / 5000.0, 1.0) if not np.isnan(pitch_var) else 0.5
        valence = np.clip(0.5 - pitch_variance_normalized * 0.3, 0.1, 0.9)
        
        cent = librosa.feature.spectral_centroid(y=audio_array, sr=sample_rate)[0]
        spectral_centroid_normalized = np.mean(cent) / (sample_rate / 2)
        dominance = np.clip(spectral_centroid_normalized * 0.8, 0.1, 0.9)
        
        return {
            'arousal': float(arousal),
            'valence': float(valence),
            'dominance': float(dominance)
        }

    def compute_stress_score(self, arousal, valence, dominance):
        """Compute acoustic stress score 0-1 based on AVD."""
        stress = arousal * 0.5 + (1 - valence) * 0.35 + (1 - dominance) * 0.15
        return float(np.clip(stress, 0, 1))
