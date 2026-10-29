"""Headless publication-resolution plots for the offline evaluation."""
from __future__ import annotations

import os

from backend.ml.common import ARTIFACTS, CLASSES, FEATURES, ROOT, SHORT_CLASSES, TARGET

os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".mplconfig"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

PLOT_NAMES = ["01_confusion_matrix.png", "02_classification_metrics_f1.png",
              "03_feature_importance.png", "04_class_distribution_70_30.png",
              "05_real_beneficiary_pre_vs_post_comparison.png", "06_probability_reliability.png"]


def save(fig: plt.Figure, name: str) -> None:
    output = ARTIFACTS / "plots"
    output.mkdir(parents=True, exist_ok=True)
    fig.savefig(output / name, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def make_plots(metrics: dict, train: pd.DataFrame, test: pd.DataFrame,
               benchmark: pd.DataFrame) -> None:
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
        "axes.spines.top": False, "axes.spines.right": False})
    matrix = np.array(metrics["confusion_matrix"])
    fig, ax = plt.subplots(figsize=(10, 7))
    image = ax.imshow(matrix, cmap="Blues", vmin=0)
    for i in range(5):
        for j in range(5):
            ax.text(j, i, str(matrix[i, j]), ha="center", va="center",
                    color="white" if matrix[i, j] > matrix.max()/2 else "#203040")
    ax.set(xticks=range(5), xticklabels=SHORT_CLASSES, yticks=range(5), yticklabels=SHORT_CLASSES,
           xlabel="Predicted interpretation", ylabel="Actual interpretation",
           title="Hybrid 30% holdout confusion matrix (n=459)\nAdvanced POST outcomes excluded from training scope")
    plt.setp(ax.get_xticklabels(), rotation=25, ha="right")
    fig.colorbar(image, ax=ax, label="Students")
    fig.tight_layout()
    save(fig, PLOT_NAMES[0])

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(5)
    for offset, (key, label, color) in enumerate((("precision", "Precision", "#3c83b5"),
            ("recall", "Recall", "#e3a64a"), ("f1-score", "F1", "#4b9c85"))):
        values = [metrics["classification_report"][c][key] for c in CLASSES]
        bars = ax.bar(x+(offset-1)*0.24, values, 0.24, label=label, color=color)
        ax.bar_label(bars, labels=[f"{v:.2f}" if i < 3 else "N/A" for i, v in enumerate(values)], fontsize=8)
    overall = metrics["holdout"]
    ax.set(xticks=x, xticklabels=SHORT_CLASSES, ylim=(0, 1.15), ylabel="Score",
        title=f"30% holdout: accuracy {overall['accuracy']:.3f} | macro F1 {overall['macro_f1']:.3f} | weighted F1 {overall['weighted_f1']:.3f}\nMacro/weighted metrics cover the three supported classes; N/A = no support")
    ax.legend(loc="upper right", ncols=3)
    ax.grid(axis="y", alpha=0.15)
    fig.tight_layout()
    save(fig, PLOT_NAMES[1])

    importance = metrics["feature_importances"]
    ordered = sorted(FEATURES, key=importance.get)
    fig, ax = plt.subplots(figsize=(11, 8))
    colors = ["#4b9c85" if f.endswith("_pre_scaled") else "#3c83b5" if f.startswith("pre_")
              else "#d99b49" if f in ("age_months_pre", "gender", "handedness") else "#9b83b6" for f in ordered]
    ax.barh(ordered, [importance[f] for f in ordered], color=colors)
    ax.set(xlabel="Normalized training permutation importance (composites mapped to original inputs)",
        title="Calibrated POST model: all 18 input features\nGreen: domains | Blue: baseline totals | Gold: demographics | Purple: household (pruned)")
    ax.grid(axis="x", alpha=0.15)
    fig.tight_layout()
    save(fig, PLOT_NAMES[2])

    fig, ax = plt.subplots(figsize=(11, 6))
    for offset, (frame, label, color) in enumerate(((train, "70% training (n=1,070)", "#3c83b5"),
                                                  (test, "30% testing (n=459)", "#e3a64a"))):
        counts = frame[TARGET].value_counts().reindex(CLASSES, fill_value=0)
        bars = ax.bar(x+(offset-0.5)*0.36, counts, 0.36, label=label, color=color)
        ax.bar_label(bars, padding=3)
    ax.set(xticks=x, xticklabels=SHORT_CLASSES, ylabel="Records",
        title="Stratified 70/30 class distribution\nThree supported classes; advanced POST candidates excluded")
    ax.legend()
    fig.tight_layout()
    save(fig, PLOT_NAMES[3])

    fig, ax = plt.subplots(figsize=(16, 7))
    x = np.arange(len(benchmark))
    for offset, (column, label, color) in enumerate((("pre_interpretation", "Actual PRE", "#e3a64a"),
            ("post_interpretation", "Actual POST", "#4b9c85"),
            ("unseen_prediction", "Model POST (student excluded from fit)", "#3c83b5"))):
        # Numeric values are ordinal category codes, not predicted standard scores.
        values = [CLASSES.index(v)+1 for v in benchmark[column]]
        ax.scatter(x+(offset-1)*0.22, values, color=color, marker=("o", "s", "^")[offset],
                   label=label, s=45, alpha=0.85)
    ax.set(xticks=x, xticklabels=benchmark.student_id, yticks=range(1, 6), yticklabels=SHORT_CLASSES,
        ylim=(0.6, 5.4), ylabel="Ordinal interpretation category (not a continuous score)",
        title="29 real beneficiaries: PRE, actual POST and model POST\nAll actual POST outcomes are Average; shared synthetic anchoring limits independence")
    plt.setp(ax.get_xticklabels(), rotation=65, ha="right")
    ax.legend(loc="upper left", ncols=3)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    save(fig, PLOT_NAMES[4])

    fig, ax = plt.subplots(figsize=(9, 7))
    ax.plot([0, 1], [0, 1], "--", color="#8996a3", label="Perfect reliability")
    selected = next(row for row in metrics["cross_validation"]["candidates"]
                    if row["name"] == metrics["selected_candidate"])
    for values, label, color in (
        (selected["uncalibrated_oof"], "Uncalibrated training OOF", "#e3a64a"),
        (selected["calibrated_oof"], "Sigmoid-calibrated training OOF", "#3c83b5"),
        (metrics["probability_evaluation"], "Calibrated holdout", "#4b9c85"),
    ):
        bins = values["reliability_bins"]
        ax.plot([b["confidence"] for b in bins], [b["accuracy"] for b in bins],
                "o-", color=color, label=f"{label} (ECE={values['top_label_ece_10_bins']:.3f})")
    ax.set(xlim=(0, 1), ylim=(0, 1), xlabel="Mean top-class probability (10 bins)",
           ylabel="Observed accuracy", title="Research-scenario probability reliability\nClass-balanced synthetic mixture; not population calibration")
    ax.legend(loc="lower right")
    ax.grid(alpha=0.15)
    fig.tight_layout()
    save(fig, PLOT_NAMES[5])
