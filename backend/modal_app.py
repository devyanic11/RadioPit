"""RadioPit GPU inference on Modal.

Serves the two Hugging Face perception models on a GPU:
  - openai/whisper-large-v3-turbo  (speech -> text, word timestamps)
  - audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim  (speech -> arousal/dominance/valence)

Deploy:
    pip install modal
    modal setup                      # one-time auth
    modal deploy backend/modal_app.py

Then point the backend at the printed URL:
    RADIOPIT_MODAL_URL=https://<user>--radiopit-inference-api.modal.run \
        python -m uvicorn api.main:app --port 8000

The local backend automatically falls back to CPU models if Modal errors.
"""
import modal

app = modal.App("radiopit-inference")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch", "transformers>=4.44", "accelerate",
        "librosa", "soundfile", "fastapi[standard]", "numpy"
    )
)

WHISPER_ID = "openai/whisper-large-v3-turbo"
EMOTION_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"


@app.cls(gpu="T4", image=image, scaledown_window=300, timeout=120)
class Inference:
    @modal.enter()
    def load(self):
        import torch
        from transformers import pipeline, Wav2Vec2Processor
        from transformers.models.wav2vec2.modeling_wav2vec2 import Wav2Vec2Model
        import torch.nn as nn

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # Whisper large-v3-turbo with word timestamps
        self.asr = pipeline(
            "automatic-speech-recognition",
            model=WHISPER_ID,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            device=self.device,
            return_timestamps="word",
        )

        # audeering dimensional emotion — manual checkpoint load (version-proof)
        from transformers import Wav2Vec2Config
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file

        state = load_file(hf_hub_download(EMOTION_ID, "model.safetensors"))
        num_labels = state['classifier.out_proj.weight'].shape[0]
        config = Wav2Vec2Config.from_pretrained(EMOTION_ID)
        final_dropout = getattr(config, 'final_dropout', 0.1) or 0.1

        class RegressionHead(nn.Module):
            def __init__(self):
                super().__init__()
                self.dense = nn.Linear(config.hidden_size, config.hidden_size)
                self.dropout = nn.Dropout(final_dropout)
                self.out_proj = nn.Linear(config.hidden_size, num_labels)

            def forward(self, features):
                x = self.dropout(features)
                x = torch.tanh(self.dense(x))
                x = self.dropout(x)
                return self.out_proj(x)

        class EmotionModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.wav2vec2 = Wav2Vec2Model(config)
                self.classifier = RegressionHead()

            def forward(self, input_values):
                hidden = self.wav2vec2(input_values)[0]
                pooled = torch.mean(hidden, dim=1)
                return self.classifier(pooled)

        self.emo_processor = Wav2Vec2Processor.from_pretrained(EMOTION_ID)
        model = EmotionModel()
        model.load_state_dict(state, strict=False)
        self.emo_model = model.to(self.device).eval()
        self.torch = torch

    def _decode(self, audio_b64: str):
        import base64, io
        import librosa
        raw = base64.b64decode(audio_b64)
        audio, _ = librosa.load(io.BytesIO(raw), sr=16000, mono=True)
        return audio

    @modal.fastapi_endpoint(method="POST")
    def transcribe(self, payload: dict):
        audio = self._decode(payload["audio_b64"])
        out = self.asr({"raw": audio, "sampling_rate": 16000})
        words = []
        for ch in out.get("chunks", []):
            ts = ch.get("timestamp") or (None, None)
            if ch.get("text", "").strip():
                words.append({
                    "word": ch["text"].strip(),
                    "start": round(float(ts[0]), 2) if ts[0] is not None else 0.0,
                    "end": round(float(ts[1]), 2) if ts[1] is not None else 0.0,
                })
        return {
            "text": (out.get("text") or "").strip(),
            "word_timestamps": words,
            "confidence": None,  # HF pipeline doesn't expose word probabilities
            "model": WHISPER_ID,
        }

    @modal.fastapi_endpoint(method="POST")
    def emotion(self, payload: dict):
        audio = self._decode(payload["audio_b64"])
        inputs = self.emo_processor(audio, sampling_rate=16000, return_tensors="pt")
        with self.torch.no_grad():
            logits = self.emo_model(inputs.input_values.to(self.device))
        arousal, dominance, valence = [float(v) for v in logits[0]]
        clamp = lambda x: max(0.0, min(1.0, x))
        return {
            "arousal": clamp(arousal),
            "dominance": clamp(dominance),
            "valence": clamp(valence),
            "model": EMOTION_ID,
        }
