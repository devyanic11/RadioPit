"""Acoustic emotion analysis with a three-tier model strategy.

Tier 1 (primary):  audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim
                   — regresses arousal / dominance / valence DIRECTLY (0..1),
                   trained on MSP-Podcast. No heuristic label mapping needed.
Tier 2 (fallback): superb/wav2vec2-base-superb-er — 4-way emotion
                   classification mapped heuristically to A/V/D.
Tier 3 (offline):  librosa DSP heuristic (energy / pitch / spectral centroid).

The active tier is reported in every result so the UI can show data lineage.
"""
import logging
import numpy as np
import librosa

DIMENSIONAL_MODEL_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"
CATEGORICAL_MODEL_ID = "superb/wav2vec2-base-superb-er"
MAX_AUDIO_SEC = 30  # radio clips are short; cap inference cost


def _build_dimensional_model(model_id):
    """Custom regression head per the audeering model card."""
    import torch
    import torch.nn as nn
    from transformers import Wav2Vec2Processor
    from transformers.models.wav2vec2.modeling_wav2vec2 import (
        Wav2Vec2Model,
        Wav2Vec2PreTrainedModel,
    )

    class RegressionHead(nn.Module):
        def __init__(self, config):
            super().__init__()
            self.dense = nn.Linear(config.hidden_size, config.hidden_size)
            self.dropout = nn.Dropout(config.final_dropout)
            self.out_proj = nn.Linear(config.hidden_size, config.num_labels)

        def forward(self, features, **kwargs):
            x = self.dropout(features)
            x = torch.tanh(self.dense(x))
            x = self.dropout(x)
            return self.out_proj(x)

    class EmotionModel(Wav2Vec2PreTrainedModel):
        def __init__(self, config):
            super().__init__(config)
            self.config = config
            self.wav2vec2 = Wav2Vec2Model(config)
            self.classifier = RegressionHead(config)
            self.init_weights()

        def forward(self, input_values):
            hidden_states = self.wav2vec2(input_values)[0]
            pooled = torch.mean(hidden_states, dim=1)
            return self.classifier(pooled)

    processor = Wav2Vec2Processor.from_pretrained(model_id)
    model = EmotionModel.from_pretrained(model_id)
    model.eval()
    return processor, model


class AcousticAnalyzer:
    """Arousal / valence / dominance estimation from raw audio."""

    def __init__(self, model_id=DIMENSIONAL_MODEL_ID):
        self.available = False
        self.tier = 'dsp'
        self.processor = None
        self.model = None
        self.classifier = None

        # Tier 1: dimensional regression (best)
        try:
            logging.info(f"Loading dimensional emotion model ({model_id})...")
            self.processor, self.model = _build_dimensional_model(model_id)
            self.tier = 'dimensional'
            self.available = True
            logging.info("Dimensional emotion model loaded (direct A/V/D regression).")
            return
        except Exception as e:
            logging.warning(f"Dimensional model unavailable ({e}); trying categorical fallback")

        # Tier 2: categorical classification
        try:
            from transformers import pipeline
            logging.info(f"Loading categorical emotion model ({CATEGORICAL_MODEL_ID})...")
            self.classifier = pipeline("audio-classification", model=CATEGORICAL_MODEL_ID)
            self.tier = 'categorical'
            self.available = True
            logging.info("Categorical emotion model loaded.")
        except Exception as e:
            logging.warning(f"Categorical model unavailable ({e}); using DSP heuristic only")

    def analyze(self, audio_array, sample_rate=16000):
        """Returns {'arousal', 'valence', 'dominance', 'model_tier'} — all 0..1."""
        audio_array = np.asarray(audio_array, dtype=np.float32)
        if len(audio_array) > MAX_AUDIO_SEC * sample_rate:
            audio_array = audio_array[:MAX_AUDIO_SEC * sample_rate]

        if self.tier == 'dimensional':
            try:
                return self._analyze_dimensional(audio_array, sample_rate)
            except Exception as e:
                logging.error(f"Dimensional inference error: {e}")

        if self.tier in ('dimensional', 'categorical') and self.classifier is not None:
            try:
                return self._analyze_categorical(audio_array, sample_rate)
            except Exception as e:
                logging.error(f"Categorical inference error: {e}")

        return self._fallback_analyze(audio_array, sample_rate)

    # ------------------------------------------------------------------
    # Tier 1: direct arousal / dominance / valence regression
    # ------------------------------------------------------------------
    def _analyze_dimensional(self, audio_array, sample_rate):
        import torch
        inputs = self.processor(audio_array, sampling_rate=sample_rate, return_tensors="pt")
        with torch.no_grad():
            logits = self.model(inputs.input_values)
        # Model card output order: [arousal, dominance, valence], approx 0..1
        arousal, dominance, valence = [float(v) for v in logits[0]]
        return {
            'arousal': float(np.clip(arousal, 0, 1)),
            'valence': float(np.clip(valence, 0, 1)),
            'dominance': float(np.clip(dominance, 0, 1)),
            'model_tier': 'dimensional (audeering MSP-Podcast)'
        }

    # ------------------------------------------------------------------
    # Tier 2: 4-way emotion classification, mapped to A/V/D
    # ------------------------------------------------------------------
    def _analyze_categorical(self, audio_array, sample_rate):
        res = self.classifier({"raw": audio_array, "sampling_rate": sample_rate})
        scores = {item['label'].lower(): item['score'] for item in res}

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
            'dominance': float(dominance),
            'model_tier': 'categorical (superb ER)'
        }

    # ------------------------------------------------------------------
    # Tier 3: DSP heuristic (no model)
    # ------------------------------------------------------------------
    def _fallback_analyze(self, audio_array, sample_rate):
        if len(audio_array) == 0:
            return {'arousal': 0.3, 'valence': 0.5, 'dominance': 0.5, 'model_tier': 'dsp heuristic'}

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
            'dominance': float(dominance),
            'model_tier': 'dsp heuristic'
        }

    def compute_stress_score(self, arousal, valence, dominance, model_tier=None):
        """Compute acoustic stress score 0-1 based on AVD."""
        stress = arousal * 0.5 + (1 - valence) * 0.35 + (1 - dominance) * 0.15
        return float(np.clip(stress, 0, 1))
