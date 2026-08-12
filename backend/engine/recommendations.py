"""Engineer guidance layer — turns detected driver state into actions.

Deterministic rules grounded in radio-communication practice: what the race
engineer should DO with the next radio call, given the driver's measured
state and what was said. Runs in microseconds, works offline, and every
recommendation is traceable to a specific signal (shown as `because`).
"""


def generate_recommendations(stress_score, frustration_score, fatigue_score,
                             mental_load_score, nlp_result):
    recs = []
    keywords = {k['category'] for k in nlp_result.get('f1_keywords', [])}
    complaints = nlp_result.get('complaints', [])
    urgency = nlp_result.get('urgency', 0.0)
    sentiment = nlp_result.get('sentiment', {}).get('label', 'neutral')

    # --- Communication handling (driver psychology) ---
    if stress_score >= 75:
        recs.append({
            'priority': 'critical',
            'title': 'Keep next call short and calm',
            'detail': 'One instruction per transmission. Acknowledge the issue first, delay non-critical info.',
            'because': f'Stress {stress_score:.0f}%'
        })
    elif stress_score >= 55:
        recs.append({
            'priority': 'high',
            'title': 'Reduce radio traffic',
            'detail': 'Hold non-essential updates until the driver reports stable. Confirm messages are received.',
            'because': f'Stress {stress_score:.0f}%'
        })

    if frustration_score >= 55:
        recs.append({
            'priority': 'high',
            'title': 'Give a concrete action, not reassurance',
            'detail': 'Frustrated drivers respond to plans, not encouragement. State the next step and the lap it happens.',
            'because': f'Frustration {frustration_score:.0f}%, sentiment {sentiment}'
        })

    if fatigue_score >= 55:
        recs.append({
            'priority': 'high',
            'title': 'Simplify instructions',
            'detail': 'Use short, single-step calls. Repeat critical settings changes and ask for confirmation.',
            'because': f'Fatigue {fatigue_score:.0f}%'
        })

    if mental_load_score >= 55 and stress_score < 75:
        recs.append({
            'priority': 'medium',
            'title': 'Time calls for the straights',
            'detail': 'Mental load is high — avoid transmitting in braking zones or technical sections.',
            'because': f'Mental load {mental_load_score:.0f}%'
        })

    # --- Technical follow-ups (what was said) ---
    if 'tyres' in keywords or 'grip' in keywords:
        recs.append({
            'priority': 'medium',
            'title': 'Cross-check tyre telemetry',
            'detail': 'Driver reports grip/tyre issues — compare against deg model before committing to a stop.',
            'because': 'Keywords: ' + ', '.join(sorted(keywords & {'tyres', 'grip'}))
        })
    if 'brakes' in keywords:
        recs.append({
            'priority': 'high',
            'title': 'Check brake temps and wear',
            'detail': 'Brake complaint on radio — verify temperatures and advise brake balance/lift-and-coast if needed.',
            'because': 'Keyword: brakes'
        })
    if 'engine' in keywords:
        recs.append({
            'priority': 'high',
            'title': 'Review PU data',
            'detail': 'Power unit mentioned — check deployment, clipping and engine modes before the next call.',
            'because': 'Keyword: engine'
        })

    if complaints and urgency >= 0.6:
        recs.append({
            'priority': 'critical',
            'title': 'Escalate to strategy',
            'detail': 'Urgent complaint detected — flag to the pit wall for an immediate strategy review.',
            'because': f"\"{complaints[0].get('phrase', '')}\" with urgency {urgency:.0%}"
        })

    if not recs:
        recs.append({
            'priority': 'low',
            'title': 'No intervention needed',
            'detail': 'Driver state is stable — normal radio protocol.',
            'because': f'Stress {stress_score:.0f}%, all metrics nominal'
        })

    order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    recs.sort(key=lambda r: order.get(r['priority'], 9))
    return recs[:4]
