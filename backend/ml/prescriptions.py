"""Transparent rules for educational planning, independent of forest predictions.

Activities are locally authored suggestions aligned at domain level to the cited
DepEd guide, not verbatim official prescriptions or evidence of treatment effect.
"""
from __future__ import annotations

import math

from backend.ml.common import ARTIFACTS, DOMAINS, DOMAIN_NAMES, write_json

CURRICULUM_URL = "https://www.deped.gov.ph/wp-content/uploads/2019/01/Kinder-CG_0.pdf"
SOURCE = {"title": "DepEd Kindergarten Curriculum Guide, May 2016",
          "url": CURRICULUM_URL, "pages": "5 (domain overview); domain-specific sections",
          "framework": "National Early Learning Framework / developmental-domain alignment",
          "mapping_level": "Domain-level alignment; no claim of official endorsement or exact ELDS indicator equivalence"}
ACTIVITIES = {
    "GM": {"curriculum_area": "Physical Health and Motor Development: gross motor",
        "goal": "Move with balance and coordinated whole-body actions",
        "classroom": "Model a safe floor-level path with walking, stepping and gentle ball rolling; practise one movement at a time.",
        "home": "Play a supervised follow-the-leader walking and ball-rolling game in a clear space.",
        "observation": "Record balance, coordination and prompts needed for the selected checklist movement."},
    "FM": {"curriculum_area": "Physical Health and Motor Development: fine motor; creative expression",
        "goal": "Use hands together and control small-object and drawing movements",
        "classroom": "Offer large blocks, dough squeezing and short drawing strokes; model grip without forcing handedness.",
        "home": "Make dough shapes and stack large safe household objects with adult supervision.",
        "observation": "Record grasp, bilateral hand use and independence on the selected item."},
    "SH": {"curriculum_area": "Physical Health and Motor Development: personal care and safety",
        "goal": "Complete familiar personal-care steps with growing independence",
        "classroom": "Use a picture sequence to rehearse handwashing, putting materials away or managing a simple fastening.",
        "home": "Let the child practise one familiar dressing or handwashing step, then gradually reduce adult prompts.",
        "observation": "Record which routine steps are independent and which require a cue."},
    "RL": {"curriculum_area": "Language, Literacy and Communication: listening comprehension",
        "goal": "Understand familiar spoken directions in the child's strongest language",
        "classroom": "Pair a short spoken direction with a gesture and object; check understanding before adding another step.",
        "home": "Play a simple find-and-place game with familiar objects and short directions in the home language.",
        "observation": "Record correct responses, direction length and whether visual cues were needed."},
    "EL": {"curriculum_area": "Language, Literacy and Communication: oral expression",
        "goal": "Communicate needs and describe familiar experiences",
        "classroom": "Use picture talk and pretend play; allow response time and expand the child's own words into a short phrase.",
        "home": "Talk together about a familiar picture or daily event and model a short phrase without demanding repetition.",
        "observation": "Record spontaneous words, phrases or accessible communication used for the selected skill."},
    "C": {"curriculum_area": "Mathematics; Understanding the Physical and Natural Environment",
        "goal": "Compare, remember and solve simple problems using concrete objects",
        "classroom": "Use familiar objects for matching, sorting and simple counting games; demonstrate one comparison first.",
        "home": "Sort safe household objects by one visible property and discuss how they match.",
        "observation": "Record correct matches, explanations and prompts required for the chosen checklist skill."},
    "SE": {"curriculum_area": "Socio-Emotional Development; Values Development",
        "goal": "Recognize feelings and participate in supportive social routines",
        "classroom": "Use puppets to name feelings and rehearse a short turn-taking game with a predictable cue.",
        "home": "Name feelings during a calm shared activity and practise asking for a turn with a trusted adult.",
        "observation": "Record participation, communication of feelings and support required during turn-taking."},
}


def build_guides() -> dict:
    tiers = {
        "Delay": {"practice": "Brief supported practice daily, one achievable step at a time",
                  "scaffolding": "Model, practise together, then fade assistance gradually", "review_days": 7},
        "Slight Delay": {"practice": "Brief small-group or paired practice several times each week",
                         "scaffolding": "Offer a cue, allow independent attempts, and reduce prompts", "review_days": 14},
        "Average": {"practice": "Embed practice in ordinary play and familiar routines",
                    "scaffolding": "Offer independent practice and a small extension when ready", "review_days": 14},
    }
    return {"version": "1.0", "source": SOURCE,
        "status": "Locally authored classroom/home planning suggestions; teacher review required",
        "trigger": "PRE domain scaled score <=6 OR explicitly marked PRE DI-KAYA items",
        "tier_rule": "Local support tiers: scaled <=3 Delay, 4..6 Slight Delay, >=7 Average; not a diagnosis",
        "domains": {code: {"name": DOMAIN_NAMES[code], **activity,
            "tiers": {tier: {**config, "classroom_activity": activity["classroom"],
                "home_activity": activity["home"], "success_check": activity["observation"]}
                for tier, config in tiers.items()}} for code, activity in ACTIVITIES.items()}}


def item_numbers(value: object) -> list[int]:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return []
    # CSV readers infer a column containing only singleton IDs and blanks as float.
    if isinstance(value, (int, float)):
        if not math.isfinite(value) or int(value) != value or value < 1:
            raise ValueError(f"Invalid item number: {value}")
        return [int(value)]
    return [int(v) for v in str(value).split(";") if v.strip()]


def recommend(student: dict, guides: dict | None = None) -> list[dict]:
    guides = guides or build_guides()
    recommendations = []
    for code, (prefix, _) in DOMAINS.items():
        scaled = float(student[f"{prefix}_pre_scaled"])
        failed = item_numbers(student.get(f"{prefix}_pre_di_kaya_items"))
        unknown = item_numbers(student.get(f"{prefix}_pre_unmarked_items"))
        if scaled > 6 and not failed:
            continue
        tier = "Delay" if scaled <= 3 else "Slight Delay" if scaled <= 6 else "Average"
        domain = guides["domains"][code]
        recommendations.append({"domain": code, "name": domain["name"], "tier": tier,
            "pre_scaled_score": scaled, "di_kaya_items": failed, "unmarked_items": unknown,
            "trigger": [reason for condition, reason in ((scaled <= 6, "scaled_score_<=6"),
                                                         (bool(failed), "explicit_DI-KAYA")) if condition],
            "goal": domain["goal"], "curriculum_area": domain["curriculum_area"],
            **domain["tiers"][tier], "source_url": guides["source"]["url"]})
    return recommendations


def save_guides() -> dict:
    guides = build_guides()
    write_json(ARTIFACTS / "prescriptive_guides.json", guides)
    return guides
