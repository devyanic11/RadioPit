import os
import json
import numpy as np
import scipy.io.wavfile as wavfile
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

class SampleClipManager:
    """Manages synthetic sample audio clips for demo purposes."""
    def __init__(self):
        self.clips_dir = config.AUDIO_DIR
        self.metadata_file = os.path.join(self.clips_dir, 'metadata.json')
        self.clips = []

    def _generate_synthetic_speech(self, duration_sec, stress_level, sr=16000):
        """Generates synthetic audio resembling speech with varied stress markers."""
        t = np.linspace(0, duration_sec, int(sr * duration_sec))
        
        if stress_level == 'low':
            # Calm: steady pitch, low noise, moderate energy
            f0 = 120 + 5 * np.sin(2 * np.pi * 2 * t)
            energy_envelope = np.clip(np.sin(2 * np.pi * 3 * t), 0, 1) * 0.4
            noise = np.random.normal(0, 0.05, len(t))
        elif stress_level == 'moderate':
            # Moderate: slightly rising pitch, more energy
            f0 = 140 + 20 * t/duration_sec + 10 * np.sin(2 * np.pi * 4 * t)
            energy_envelope = np.clip(np.sin(2 * np.pi * 4 * t), 0, 1) * 0.6
            noise = np.random.normal(0, 0.1, len(t))
        elif stress_level == 'high':
            # High: rapid pitch variation, high energy, more jitter
            f0 = 180 + 40 * np.sin(2 * np.pi * 8 * t) + np.random.normal(0, 5, len(t))
            energy_envelope = np.clip(np.sin(2 * np.pi * 5 * t), 0, 1) * 0.8
            noise = np.random.normal(0, 0.2, len(t))
        elif stress_level == 'critical':
            # Critical: very high pitch, erratic, extreme energy
            f0 = 250 + 60 * np.sin(2 * np.pi * 12 * t) + np.random.normal(0, 15, len(t))
            energy_envelope = np.ones(len(t)) * 0.9
            noise = np.random.normal(0, 0.3, len(t))
        else:
            f0 = 100 * np.ones(len(t))
            energy_envelope = np.ones(len(t)) * 0.5
            noise = np.zeros(len(t))

        # Modulate sine wave
        phase = np.cumsum(2 * np.pi * f0 / sr)
        audio = energy_envelope * (np.sin(phase) + noise)
        
        # Add pauses
        pause_mask = np.random.rand(len(t)) > 0.95
        audio[pause_mask] = audio[pause_mask] * 0.1
        
        # Normalize to 16-bit PCM
        audio = np.int16(audio / np.max(np.abs(audio)) * 32767 * 0.9)
        return audio

    def generate_sample_clips(self):
        """Generates sample audio clips if they don't exist."""
        os.makedirs(self.clips_dir, exist_ok=True)
        
        clip_defs = [
            {
                'id': 'clip_1',
                'name': 'Calm Update',
                'description': 'Driver gives a calm update on pace.',
                'driver': 'VER',
                'lap_number': 12,
                'expected_stress': 'LOW',
                'transcript': 'Box this lap, tyres are fine, pace is good',
                'duration': 3,
                'level': 'low'
            },
            {
                'id': 'clip_2',
                'name': 'Moderate Concern',
                'description': 'Driver notes tyre degradation.',
                'driver': 'VER',
                'lap_number': 18,
                'expected_stress': 'MODERATE',
                'transcript': 'Rear tyres starting to go off, losing grip through Turn 4',
                'duration': 3,
                'level': 'moderate'
            },
            {
                'id': 'clip_3',
                'name': 'High Stress',
                'description': 'Driver struggles with car balance.',
                'driver': 'VER',
                'lap_number': 24,
                'expected_stress': 'HIGH',
                'transcript': "I'm losing the rear! The car is undriveable in the high speed!",
                'duration': 3,
                'level': 'high'
            },
            {
                'id': 'clip_4',
                'name': 'Critical Failure',
                'description': 'Sudden power loss.',
                'driver': 'VER',
                'lap_number': 25,
                'expected_stress': 'CRITICAL',
                'transcript': "NO POWER! NO POWER! Something's broken!",
                'duration': 2,
                'level': 'critical'
            },
            {
                'id': 'clip_5',
                'name': 'Frustrated Pace',
                'description': 'Driver complaining about pace.',
                'driver': 'NOR',
                'lap_number': 35,
                'expected_stress': 'HIGH',
                'transcript': 'Why are we so slow?! We\'re losing time every lap!',
                'duration': 3,
                'level': 'high'
            },
            {
                'id': 'clip_6',
                'name': 'Pit Strategy Urgent',
                'description': 'Urgent call to pit.',
                'driver': 'NOR',
                'lap_number': 40,
                'expected_stress': 'MODERATE',
                'transcript': 'We need to pit NOW, these tyres are completely gone',
                'duration': 3,
                'level': 'moderate'
            }
        ]

        generated_metadata = []
        for cdef in clip_defs:
            filename = f"{cdef['id']}.wav"
            filepath = os.path.join(self.clips_dir, filename)
            
            # Always write file for consistency in demo
            audio = self._generate_synthetic_speech(cdef['duration'], cdef['level'])
            wavfile.write(filepath, 16000, audio)
                
            cdef['file_path'] = filepath
            del cdef['level'] # cleanup internal param
            del cdef['duration']
            generated_metadata.append(cdef)
            
        self.clips = generated_metadata
        with open(self.metadata_file, 'w') as f:
            json.dump(self.clips, f, indent=2)

    def get_clips_metadata(self):
        return self.clips

    def get_clip(self, clip_id):
        for c in self.clips:
            if c['id'] == clip_id:
                return c
        return None
