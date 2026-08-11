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
VAD_THRESHOLD = 0.5
AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'static', 'clips')
