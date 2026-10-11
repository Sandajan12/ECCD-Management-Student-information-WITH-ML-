import os
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any

# Load scoring data at module initialization
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(BASE_DIR, "eccd_scoring_data.json")

# Safely load the dictionary if the file exists
scoring_data = {}
if os.path.exists(JSON_PATH):
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        scoring_data = json.load(f)

def get_age_bracket(decimal_age: float) -> str:
    if 3.1 <= decimal_age <= 4.0:
        return "AGE 3.1 - 4.0"
    elif 4.0 < decimal_age <= 5.0:
        return "AGE 4.1 - 5.0"
    elif decimal_age > 5.0:
        return "AGE 5.1 - 5.11"
    else:
        return "AGE 3.1 - 4.0"

def calculate_decimal_age(birth_date: date, evaluation_date: date) -> float:
    years = evaluation_date.year - birth_date.year
    months = evaluation_date.month - birth_date.month
    
    if evaluation_date.day < birth_date.day:
        months -= 1
        
    if months < 0:
        years -= 1
        months += 12
        
    return float((Decimal(years) + Decimal(months) / 12).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))

def calculate_scores(evaluations: List[Dict[str, Any]], decimal_age: float) -> Dict[str, Any]:
    bracket = get_age_bracket(decimal_age)
    lookup = scoring_data.get(bracket)
    
    if not lookup:
        raise ValueError(f"Scoring data not found for age bracket: {bracket}")

    raw_scores = {"GM": 0, "FM": 0, "SH": 0, "RL": 0, "EL": 0, "C": 0, "SE": 0}
    
    domain_mapping = {
        'Gross Motor': 'GM', '1': 'GM', 1: 'GM',
        'Fine Motor': 'FM', '2': 'FM', 2: 'FM',
        'Self-Help': 'SH', '3': 'SH', 3: 'SH',
        'Receptive Language': 'RL', '4': 'RL', 4: 'RL',
        'Expressive Language': 'EL', '5': 'EL', 5: 'EL',
        'Cognitive': 'C', '6': 'C', 6: 'C',
        'Socio-Emotional': 'SE', 'Social-Emotional': 'SE', '7': 'SE', 7: 'SE'
    }

    for ev in evaluations:
        if ev.get("answer") == "KAYA":
            domain_name = ev.get("domain_name") or ev.get("domain_id")
            domain_code = domain_mapping.get(domain_name)
            if not domain_code and isinstance(domain_name, str):
                cleaned_name = domain_name.replace(' Domain', '').strip()
                domain_code = domain_mapping.get(cleaned_name)
            
            if domain_code and domain_code in raw_scores:
                raw_scores[domain_code] += 1

    scaled_scores = {}
    sum_of_scaled_scores = 0

    for domain, raw in raw_scores.items():
        domain_lookup = lookup["domains"].get(domain, {})
        scaled = domain_lookup.get(str(raw))
        
        if scaled is None:
            available_raws = sorted([int(k) for k in domain_lookup.keys()])
            closest_raw = available_raws[0] if available_raws else 0
            for r in available_raws:
                if r <= raw:
                    closest_raw = r
            scaled = domain_lookup.get(str(closest_raw), 0)
            
        scaled_scores[domain] = scaled
        sum_of_scaled_scores += scaled

    standard_score = None
    interpretation = None

    ss_lookup = lookup["standardScores"].get(str(sum_of_scaled_scores))
    if ss_lookup:
        standard_score = ss_lookup["standardScore"]
        interpretation = ss_lookup["interpretation"]
    else:
        available_sums = sorted([int(k) for k in lookup["standardScores"].keys()])
        closest_sum = available_sums[0] if available_sums else 0
        for s in available_sums:
            if s <= sum_of_scaled_scores:
                closest_sum = s
        if str(closest_sum) in lookup["standardScores"]:
            standard_score = lookup["standardScores"][str(closest_sum)]["standardScore"]
            interpretation = lookup["standardScores"][str(closest_sum)]["interpretation"]

    return {
        "raw_scores": raw_scores,
        "scaled_scores": scaled_scores,
        "sum_of_scaled_scores": sum_of_scaled_scores,
        "standard_score": standard_score,
        "interpretation": interpretation,
        "bracket": bracket
    }
