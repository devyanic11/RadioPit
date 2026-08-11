import logging
import re
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

class TranscriptAnalyzer:
    """Transcript NLP analyzer using Hugging Face Transformers sentiment pipeline."""
    def __init__(self, model_id="distilbert/distilbert-base-uncased-finetuned-sst-2-english"):
        self.available = False
        self.sentiment_pipeline = None
        try:
            from transformers import pipeline
            logging.info(f"Loading Hugging Face Sentiment model ({model_id})...")
            self.sentiment_pipeline = pipeline("sentiment-analysis", model=model_id)
            self.available = True
            logging.info(f"Hugging Face Sentiment model ({model_id}) loaded successfully.")
        except Exception as e:
            logging.warning(f"Failed to load Hugging Face Sentiment model ({model_id}). Error: {e}")

    def analyze(self, text):
        if not text or not text.strip():
             return {
                'sentiment': {'label': 'neutral', 'score': 1.0, 'negative': 0.0, 'neutral': 1.0, 'positive': 0.0},
                'urgency': 0.0,
                'f1_keywords': [],
                'complaints': [],
                'corner_references': []
            }

        text_lower = text.lower()
        sentiment = self._analyze_sentiment(text)
        
        urgency = self._calculate_urgency(text, text_lower)
        f1_keywords = self._extract_f1_keywords(text_lower)
        complaints = self._extract_complaints(text_lower)
        corner_references = self._extract_corners(text_lower)
        
        return {
            'sentiment': sentiment,
            'urgency': urgency,
            'f1_keywords': f1_keywords,
            'complaints': complaints,
            'corner_references': corner_references
        }

    def _analyze_sentiment(self, text):
        if self.available and self.sentiment_pipeline is not None:
            try:
                res = self.sentiment_pipeline(text[:512])[0]
                label = res['label'].lower()
                score = float(res['score'])
                
                if label in ['negative', 'neg']:
                    return {'label': 'negative', 'score': score, 'negative': score, 'neutral': 1.0 - score, 'positive': 0.0}
                elif label in ['positive', 'pos']:
                    return {'label': 'positive', 'score': score, 'negative': 0.0, 'neutral': 1.0 - score, 'positive': score}
                else:
                    return {'label': 'neutral', 'score': score, 'negative': 0.1, 'neutral': score, 'positive': 0.1}
            except Exception as e:
                logging.error(f"Hugging Face Sentiment error: {e}")
                
        return self._fallback_sentiment(text.lower())

    def _fallback_sentiment(self, text_lower):
        negative_words = ['bad', 'terrible', 'worst', 'broken', 'issue', 'problem', 'lose', 'losing', 'lost', 'gone', 'no', 'cannot', 'can\'t', 'sliding', 'no power']
        positive_words = ['good', 'great', 'fine', 'perfect', 'nice', 'fast', 'push', 'okay']
        
        neg_count = sum(1 for word in negative_words if word in text_lower)
        pos_count = sum(1 for word in positive_words if word in text_lower)
        
        if neg_count > pos_count:
            return {'label': 'negative', 'score': 0.85, 'negative': 0.85, 'neutral': 0.1, 'positive': 0.05}
        elif pos_count > neg_count:
            return {'label': 'positive', 'score': 0.85, 'negative': 0.05, 'neutral': 0.1, 'positive': 0.85}
        else:
            return {'label': 'neutral', 'score': 0.8, 'negative': 0.1, 'neutral': 0.8, 'positive': 0.1}

    def _calculate_urgency(self, text, text_lower):
        urgent_keywords = ['now', 'problem', 'issue', 'failing', 'gone', 'broken', 'stop', 'box', 'immediate', 'losing', 'no power', 'undriveable']
        score = 0.0
        exclamations = text.count('!')
        score += min(exclamations * 0.2, 0.4)
        
        caps = sum(1 for c in text if c.isupper())
        letters = sum(1 for c in text if c.isalpha())
        if letters > 0:
            caps_ratio = caps / letters
            score += min(caps_ratio * 0.5, 0.3)
            
        for kw in urgent_keywords:
            if kw in text_lower:
                score += 0.2
                
        return min(score, 1.0)

    def _extract_f1_keywords(self, text_lower):
        matches = []
        for category, words in config.F1_KEYWORDS.items():
            for word in words:
                if re.search(r'\b' + re.escape(word) + r'\b', text_lower):
                    matches.append({'category': category, 'word': word})
        return matches

    def _extract_complaints(self, text_lower):
        complaints = []
        patterns = [
            r'losing [a-z ]+',
            r'no [a-z]+',
            r'[a-z]+ is broken',
            r'undriveable',
            r'[a-z]+ gone'
        ]
        for p in patterns:
            for match in re.finditer(p, text_lower):
                complaints.append({'phrase': match.group(0), 'severity': 'high'})
        return complaints

    def _extract_corners(self, text_lower):
        matches = []
        for corner in config.F1_CORNERS:
            if re.search(r'\b' + re.escape(corner) + r'\b', text_lower):
                matches.append(corner)
        return matches

    def compute_nlp_stress_score(self, analysis):
        sentiment_stress = analysis['sentiment']['negative']
        urgency = analysis['urgency']
        kw_stress = min(len(analysis['complaints']) * 0.25 + len(analysis['f1_keywords']) * 0.15, 0.5)
        score = sentiment_stress * 0.4 + urgency * 0.4 + kw_stress * 0.2
        return min(score, 1.0)
