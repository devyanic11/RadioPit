import os

MODEL_CONFIGS = {
    'whisper': 'openai/whisper-tiny', # Hugging Face model identifier
}

FUSION_WEIGHTS = {
    'acoustic': 0.35, 
    'prosodic': 0.25, 
    'nlp': 0.25, 
    'keyword': 0.15
}

STRESS_THRESHOLDS = {
    'low': 30, 
    'moderate': 55, 
    'high': 75, 
    'critical': 90
}

F1_KEYWORDS = {
    'grip': ['grip', 'sliding', 'loose', 'oversteer', 'understeer'],
    'brakes': ['brakes', 'locking', 'pedal', 'long'],
    'tyres': ['tyres', 'tires', 'grain', 'blister', 'degradation', 'deg', 'front', 'rear'],
    'engine': ['engine', 'power', 'harvest', 'clipping', 'mode', 'strat'],
    'aero': ['aero', 'wind', 'balance', 'wing'],
    'general_complaint': ['box', 'issue', 'problem', 'undriveable', 'broken']
}

F1_CORNERS = [
    'turn 1', 'turn 2', 'turn 3', 'turn 4', 'turn 5', 'turn 6', 'turn 7', 'turn 8', 'turn 9', 'turn 10',
    'turn 11', 'turn 12', 'turn 13', 'turn 14', 'turn 15', 'turn 16', 'turn 17', 'turn 18', 'turn 19', 'turn 20',
    'eau rouge', 'radillion', 'pouhon', 'blanchimont', 'les combes', 'la source', 'bus stop', 'stavelot',
    'parabolica', 'lesmo', 'ascari', 'curva grande', 'roggia', 'retifilo',
    'copse', 'maggotts', 'becketts', 'chapel', 'stowe', 'club', 'abbey', 'farm', 'village', 'loop', 'aintree',
    'suzuka s', 'degner', 'spoon', '130r', 'triangle', 'hairpin', 'casio triangle'
]

SAMPLE_RATE = 16000
AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'static', 'clips')

# --- Story mode: HF dataset (MikCil/f1-team-radio) + FastF1 timing ---
STORY_MAX_CLIPS = 24                # cap clips per race+driver story
DEFAULT_RACE_ID = '2021_Abu_Dhabi_Grand_Prix'

# Inference backend: 'local' (CPU) or 'modal' (GPU via deployed Modal app).
# When RADIOPIT_MODAL_URL is set, ASR + acoustic emotion run remotely with
# automatic local fallback on any error.
MODAL_URL = os.environ.get('RADIOPIT_MODAL_URL', '').rstrip('/')
INFERENCE_BACKEND = 'modal' if MODAL_URL else 'local'

# --- Legacy OpenF1 source (kept in repo, not used by the UI) ---
_session_env = os.environ.get('RADIOPIT_SESSION_KEYS', '11342,11326')
OPENF1_SESSION_KEYS = [int(s) for s in _session_env.split(',') if s.strip()]
OPENF1_MAX_CLIPS = 8
OPENF1_MAX_PER_DRIVER = 3
