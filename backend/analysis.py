"""
=============================================================================
Business Analytics - Digital Assignment 2
Survey Analysis: Inventory Management & Predictive Analytics
=============================================================================
Usage:
    python preprocessing.py
    python analysis.py
=============================================================================
"""

import os, warnings, textwrap
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from scipy import stats
from scipy.stats import pearsonr, chi2_contingency

warnings.filterwarnings("ignore")

# -- PATH CONFIGURATION ------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
CHARTS_DIR = os.path.join(SCRIPT_DIR, "charts")

os.makedirs(CHARTS_DIR, exist_ok=True)

# -- STYLE CONFIG ------------------------------------------------------------
plt.rcParams.update({
    "font.family":       "sans-serif",
    "font.size":         10,
    "axes.spines.top":   False,
    "axes.spines.right": False,
    "axes.grid":         True,
    "grid.alpha":        0.3,
    "grid.color":        "#cccccc",
    "figure.dpi":        150,
    "savefig.bbox":      "tight",
    "savefig.facecolor": "white",
})

COLORS  = ["#4361ee","#7209b7","#06d6a0","#fb8500","#ef233c","#3a86ff"]
PALETTE = sns.color_palette(COLORS)
sns.set_palette(PALETTE)

LIKERT_COLS = ["L1_inv_system","L2_forecast_trust","L3_supplier_delay",
               "L4_seasonal_difficulty","L5_analytics_belief","L6_data_readiness"]

LIKERT_LABELS = {
    "L1_inv_system":        "Inv. System Prevents Issues",
    "L2_forecast_trust":    "Trust in Forecasting",
    "L3_supplier_delay":    "Supplier Delays Disruptive",
    "L4_seasonal_difficulty":"Seasonal Demand Hard to Predict",
    "L5_analytics_belief":  "Analytics Improves Decisions",
    "L6_data_readiness":    "Data Readiness for Analytics",
}

# -- LOAD DATA ---------------------------------------------------------------
def load_data(filepath=None):
    if filepath is None:
        filepath = os.path.join(DATA_DIR, "survey_responses_cleaned.csv")
    print(f"Loading data from: {filepath}")
    df = pd.read_csv(filepath, encoding="utf-8-sig")
    return df

# -- HELPER ------------------------------------------------------------------
def wrap_labels(ax, width=15, is_x=True):
    labels = []
    if is_x:
        for label in ax.get_xticklabels():
            text = label.get_text()
            labels.append(textwrap.fill(text, width=width))
        ax.set_xticklabels(labels, rotation=0)
    else:
        for label in ax.get_yticklabels():
            text = label.get_text()
            labels.append(textwrap.fill(text, width=width))
        ax.set_yticklabels(labels)

def save(name):
    path = os.path.join(CHARTS_DIR, f"{name}.png")
    print(f"Opening window for: {name} (Please resize it if needed and close to continue)")
    plt.show() # Opens interactive window (Option 2)
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  [OK] {path}")


# =============================================================================
# 1. DISTRIBUTION CHARTS
# =============================================================================

def plot_business_type_bar(df):
    """Bar chart - Business type distribution."""
    vc = df["business_type"].value_counts()
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(vc.index, vc.values, color=COLORS[:len(vc)], width=0.5, edgecolor="white")
    ax.bar_label(bars, fmt="%d", padding=4, fontsize=10, fontweight="bold")
    ax.set_title("Business Type Distribution", fontsize=12, fontweight="bold", pad=16)
    ax.set_ylabel("Number of Respondents")
    ax.set_ylim(0, vc.max() + 2)
    wrap_labels(ax, width=12)
    save("01_business_type_bar")


def plot_likert_histograms(df):
    """Histogram grid – distribution of all 6 Likert responses."""
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    axes = axes.flatten()
    for i, col in enumerate(LIKERT_COLS):
        ax = axes[i]
        counts = df[col].value_counts().reindex([1,2,3,4,5], fill_value=0)
        bars = ax.bar(counts.index, counts.values,
                      color=[COLORS[i]]*5, alpha=0.85, edgecolor="white", width=0.6)
        ax.bar_label(bars, fmt="%d", padding=2, fontsize=9)
        ax.set_title(LIKERT_LABELS[col], fontsize=9, fontweight="bold")
        ax.set_xticks([1,2,3,4,5])
        ax.set_xticklabels(["SD","D","N","A","SA"], fontsize=8)
        ax.axvline(df[col].mean(), color="red", linestyle="--", linewidth=1.2,
                   label=f"mean={df[col].mean():.2f}")
        ax.legend(fontsize=7)
    fig.suptitle("Likert Score Distributions (1=Strongly Disagree, 5=Strongly Agree)",
                 fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    save("02_likert_histograms")


def plot_likert_density(df):
    """KDE density plot – smooth distributions of Likert responses."""
    fig, ax = plt.subplots(figsize=(10, 6))
    for i, col in enumerate(LIKERT_COLS):
        jitter = df[col] + np.random.normal(0, 0.08, len(df))
        sns.kdeplot(jitter, ax=ax, label=LIKERT_LABELS[col].replace("\n"," "),
                    color=COLORS[i], linewidth=2, fill=True, alpha=0.07)
    ax.set_xlim(0.5, 5.5)
    ax.set_xticks([1,2,3,4,5])
    ax.set_xticklabels(["Strongly\nDisagree","Disagree","Neutral","Agree","Strongly\nAgree"])
    ax.set_title("KDE Density Plot – Likert Scale Response Distributions",
                 fontsize=13, fontweight="bold")
    ax.set_ylabel("Density")
    ax.legend(fontsize=8, loc="upper left")
    save("03_likert_density")


def plot_box_plots(df):
    """Box plots – Likert spread and outliers by category."""
    fig, ax = plt.subplots(figsize=(12, 6))
    data_list = [df[c].dropna().values for c in LIKERT_COLS]
    labels = [LIKERT_LABELS[c].replace("\n"," ") for c in LIKERT_COLS]
    bp = ax.boxplot(data_list, patch_artist=True, notch=False,
                    medianprops=dict(color="white", linewidth=2.5))
    for patch, color in zip(bp["boxes"], COLORS):
        patch.set_facecolor(color)
        patch.set_alpha(0.75)
    ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=9)
    ax.set_yticks([1,2,3,4,5])
    ax.set_yticklabels(["SD","D","N","A","SA"])
    ax.set_title("Box Plots – Likert Score Distribution per Statement",
                 fontsize=13, fontweight="bold")
    ax.axhline(3, color="gray", linestyle=":", alpha=0.6, label="Neutral (3)")
    ax.legend()
    save("04_box_plots")


def plot_violin(df):
    """Violin plot - Analytics Belief by Business Type."""
    df_v = df[["business_type","L5_analytics_belief"]].dropna()
    if df_v["business_type"].nunique() < 2:
        return
    fig, ax = plt.subplots(figsize=(10, 6))
    parts = ax.violinplot(
        [df_v[df_v["business_type"]==bt]["L5_analytics_belief"].values
         for bt in df_v["business_type"].unique()],
        showmeans=True, showmedians=True)
    for i, pc in enumerate(parts["bodies"]):
        pc.set_facecolor(COLORS[i % len(COLORS)])
        pc.set_alpha(0.6)
    ax.set_xticks(range(1, df_v["business_type"].nunique()+1))
    ax.set_xticklabels(df_v["business_type"].unique())
    ax.set_yticks([1,2,3,4,5])
    ax.set_yticklabels(["SD","D","N","A","SA"])
    ax.set_title("Violin Plot - Analytics Belief by Business Type", fontsize=12, fontweight="bold")
    ax.axhline(3, color="gray", linestyle=":", label="Neutral")
    wrap_labels(ax, width=12)
    save("05_violin_analytics_by_biz")


# =============================================================================
# 2. COMPARISON CHARTS
# =============================================================================

def plot_grouped_bar_stockout_vs_system(df):
    """Grouped bar - Inventory management system vs stockout frequency."""
    tbl = pd.crosstab(df["inv_mgmt"], df["stockout_freq"])
    ax = tbl.plot(kind="bar", figsize=(12, 6), color=COLORS[:len(tbl.columns)],
                  edgecolor="white", width=0.7)
    plt.title("Inventory System vs Stockout Frequency", fontsize=12, fontweight="bold")
    plt.xlabel("Inventory Management System")
    plt.ylabel("Respondents")
    wrap_labels(ax, width=15)
    plt.legend(title="Stockout Freq", bbox_to_anchor=(1.01, 1))
    plt.tight_layout()
    save("06_grouped_stockout_vs_system")


def plot_stacked_forecast_by_biz(df):
    """100% Stacked bar - Forecasting methods by business type."""
    tbl = pd.crosstab(df["business_type"], df["forecast_method"])
    tbl_pct = tbl.div(tbl.sum(axis=1), axis=0) * 100
    ax = tbl_pct.plot(kind="bar", stacked=True, figsize=(11, 6),
                      color=COLORS[:len(tbl_pct.columns)], edgecolor="white", width=0.55)
    plt.title("Forecast Methods by Business Type (100% Stacked)", fontsize=12, fontweight="bold")
    plt.xlabel("Business Type")
    plt.ylabel("Percentage (%)")
    wrap_labels(ax, width=12)
    plt.legend(title="Forecast Method", bbox_to_anchor=(1.01, 1), fontsize=8)
    plt.tight_layout()
    save("07_stacked_forecast_by_biz")


def plot_stacked_demand_pred_by_biz(df):
    """Stacked bar - Demand predictability by business type."""
    tbl = pd.crosstab(df["business_type"], df["demand_predictability"])
    ax = tbl.plot(kind="bar", stacked=True, figsize=(11, 6),
                  color=COLORS[:len(tbl.columns)], edgecolor="white", width=0.55)
    plt.title("Demand Predictability by Business Type", fontsize=12, fontweight="bold")
    plt.xlabel("Business Type")
    plt.ylabel("Count")
    wrap_labels(ax, width=12)
    plt.legend(title="Predictability", bbox_to_anchor=(1.01, 1), fontsize=8)
    plt.tight_layout()
    save("08_stacked_demand_pred_by_biz")


# =============================================================================
# 3. RELATIONSHIP CHARTS
# =============================================================================

def plot_heatmap_correlation(df):
    """Heatmap – Pearson correlation matrix of all 6 Likert variables."""
    likert_df = df[LIKERT_COLS].dropna()
    if len(likert_df) < 3:
        print("  [!] Too few rows for correlation - skipping")
        return
    corr = likert_df.corr(method="pearson")
    fig, ax = plt.subplots(figsize=(10, 8))
    mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", center=0,
                linewidths=0.5, ax=ax,
                xticklabels=[LIKERT_LABELS[c].replace("\n"," ") for c in LIKERT_COLS],
                yticklabels=[LIKERT_LABELS[c].replace("\n"," ") for c in LIKERT_COLS])
    ax.set_title("Pearson Correlation – Likert Perception Variables",
                 fontsize=13, fontweight="bold")
    plt.xticks(rotation=30, ha="right", fontsize=8)
    plt.yticks(rotation=0, fontsize=8)
    plt.tight_layout()
    save("09_correlation_heatmap")


def plot_bubble_chart(df):
    """Bubble chart - Lead Time vs Revenue Loss (bubble = SKU size)."""
    plot_df = df[["lt_num","rl_num","sku_num","business_type"]].dropna()
    if len(plot_df) == 0:
        return

    fig, ax = plt.subplots(figsize=(11, 6))
    biz_types = plot_df["business_type"].unique()
    for i, bt in enumerate(biz_types):
        sub = plot_df[plot_df["business_type"] == bt]
        ax.scatter(sub["lt_num"], sub["rl_num"],
                   s=sub["sku_num"] / 1.5, alpha=0.6,
                   color=COLORS[i % len(COLORS)], edgecolors="white", linewidth=1,
                   label=bt, zorder=3)

    ax.set_xlabel("Lead Time (Numeric Index)", fontsize=10)
    ax.set_ylabel("Revenue Loss (%)", fontsize=10)
    ax.set_title("Lead Time vs Revenue Loss (Bubble Size = SKU)", fontsize=12, fontweight="bold")
    ax.legend(title="Business Type", fontsize=8)
    ax.axvline(plot_df["lt_num"].mean(), color="gray", linestyle="--", alpha=0.4)
    plt.tight_layout()
    save("10_bubble_lead_revenue")


# =============================================================================
# 4. SURVEY-SPECIFIC CHARTS
# =============================================================================

def plot_diverging_likert(df):
    """Diverging Likert chart – centered around neutral (3)."""
    fig, ax = plt.subplots(figsize=(11, 5))
    labels  = [LIKERT_LABELS[c].replace("\n"," ") for c in LIKERT_COLS]
    n       = len(df)

    for i, col in enumerate(LIKERT_COLS):
        sd = (df[col]==1).sum()
        d  = (df[col]==2).sum()
        ne = (df[col]==3).sum()
        a  = (df[col]==4).sum()
        sa = (df[col]==5).sum()

        # Centered layout: negative left, positive right, neutral split
        left  = -(sd + d + ne/2) / n * 100
        sd_w  = sd  / n * 100
        d_w   = d   / n * 100
        ne_w  = ne  / n * 100
        a_w   = a   / n * 100
        sa_w  = sa  / n * 100

        y = i
        ax.barh(y, -sd_w - d_w - ne_w/2, color="#ef233c", height=0.55, left=0)
        ax.barh(y, -d_w  - ne_w/2,        color="#fb8500", height=0.55, left=0)
        ax.barh(y, -ne_w/2,               color="#ccc",    height=0.55, left=0)
        ax.barh(y,  ne_w/2,               color="#ccc",    height=0.55, left=0)
        ax.barh(y,  ne_w/2 + a_w,         color="#06d6a0", height=0.55, left=0)
        ax.barh(y,  ne_w/2 + a_w + sa_w,  color="#4361ee", height=0.55, left=0)

    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels, fontsize=9)
    wrap_labels(ax, width=25, is_x=False)
    ax.axvline(0, color="black", linewidth=1.2)
    ax.set_xlabel("← Disagree  |  Percentage of Respondents (%)  |  Agree →")
    ax.set_title("Diverging Likert Chart – Survey Perception Statements",
                 fontsize=13, fontweight="bold")
    patches = [
        mpatches.Patch(color="#ef233c", label="Strongly Disagree"),
        mpatches.Patch(color="#fb8500", label="Disagree"),
        mpatches.Patch(color="#cccccc", label="Neutral"),
        mpatches.Patch(color="#06d6a0", label="Agree"),
        mpatches.Patch(color="#4361ee", label="Strongly Agree"),
    ]
    ax.legend(handles=patches, loc="upper right", fontsize=8)
    plt.tight_layout()
    save("11_diverging_likert")


def plot_radar_likert(df):
    """Radar chart – Average Likert scores across all 6 statements."""
    avgs   = [df[c].mean() for c in LIKERT_COLS]
    angles = np.linspace(0, 2*np.pi, len(LIKERT_COLS), endpoint=False).tolist()
    avgs  += avgs[:1]
    angles+= angles[:1]
    labels = [LIKERT_LABELS[c].replace("\n"," ") for c in LIKERT_COLS]

    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
    ax.plot(angles, avgs, color=COLORS[0], linewidth=2.5, zorder=3)
    ax.fill(angles, avgs, color=COLORS[0], alpha=0.2)
    ax.set_thetagrids(np.degrees(angles[:-1]), labels, fontsize=8)
    ax.tick_params(axis='x', pad=15)
    ax.set_ylim(0, 5)
    ax.set_yticks([1,2,3,4,5])
    ax.set_yticklabels(["1","2","3","4","5"], fontsize=7, color="gray")
    ax.set_title("Radar Chart – Average Likert Perception Scores",
                 fontsize=13, fontweight="bold", pad=20)
    ax.axhline(3, color="gray", linestyle=":", alpha=0.5)
    save("12_radar_likert")


# =============================================================================
# 5. MULTI-RESPONSE & FREQUENCY CHARTS
# =============================================================================

def plot_demand_factors_pareto(df):
    """Pareto chart - Demand factors ranked by frequency."""
    factor_cols = [c for c in df.columns if c.startswith("factor_")]
    if not factor_cols:
        return
    
    # Sum the dummy columns
    s = df[factor_cols].sum().sort_values(ascending=False)
    # Clean up labels (remove factor_ prefix and underscores)
    s.index = [c.replace("factor_","").replace("_"," ").title() for c in s.index]
    
    s_pct = s.cumsum() / s.sum() * 100

    fig, ax1 = plt.subplots(figsize=(12, 6))
    bars = ax1.bar(range(len(s)), s.values, color=COLORS[0], alpha=0.8, edgecolor="white")
    ax1.bar_label(bars, fmt="%d", padding=3, fontweight="bold")
    ax1.set_xticks(range(len(s)))
    ax1.set_xticklabels(s.index, rotation=35, ha="right", fontsize=9)
    ax1.set_ylabel("Mentions")
    ax1.set_title("Pareto Chart - Demand Influencing Factors", fontsize=12, fontweight="bold")

    ax2 = ax1.twinx()
    ax2.plot(range(len(s)), s_pct.values, color=COLORS[3], marker="o", linewidth=2)
    ax2.set_ylabel("Cumulative %")
    ax2.set_ylim(0, 110)
    plt.tight_layout()
    save("13_demand_factors_pareto")


def plot_horizontal_stockout(df):
    """Ordered horizontal bar chart - Stockout frequency."""
    vc = df["stockout_freq"].value_counts()
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.barh(vc.index, vc.values, color=COLORS[1], height=0.6)
    ax.bar_label(bars, fmt="%d", padding=4, fontweight="bold")
    ax.set_title("Stockout Frequency Distribution", fontsize=12, fontweight="bold")
    ax.set_xlabel("Respondents")
    plt.tight_layout()
    save("14_stockout_horizontal")


# =============================================================================
# 6. TIME-BASED CHART
# =============================================================================

def plot_response_timeline(df):
    """Time series – Cumulative survey responses over time."""
    if "timestamp" not in df.columns:
        print("  [!] No timestamp column - skipping timeline")
        return
    df_t = df.sort_values("timestamp")
    df_t["cumulative"] = range(1, len(df_t)+1)
    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(df_t["timestamp"], df_t["cumulative"],
            marker="o", color=COLORS[0], linewidth=2.5, markersize=8)
    ax.fill_between(df_t["timestamp"], df_t["cumulative"], alpha=0.15, color=COLORS[0])
    ax.set_title("Survey Response Collection Timeline",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Date / Time")
    ax.set_ylabel("Cumulative Responses")
    plt.xticks(rotation=20, ha="right")
    plt.tight_layout()
    save("15_response_timeline")


# =============================================================================
# 7. PROPORTION CHARTS
# =============================================================================

def plot_donut_inv_system(df):
    """Donut chart - Inventory management system proportions."""
    vc = df["inv_mgmt"].value_counts()
    fig, ax = plt.subplots(figsize=(7, 5))
    wedges, _, autotexts = ax.pie(
        vc.values, labels=None, autopct="%1.0f%%",
        colors=COLORS[:len(vc)], startangle=140,
        wedgeprops=dict(width=0.5, edgecolor="white", linewidth=2))
    ax.legend(wedges, vc.index, loc="lower center", bbox_to_anchor=(0.5, -0.15), ncol=2, fontsize=8)
    ax.set_title("Inventory Management Systems", fontsize=12, fontweight="bold")
    save("16_donut_inv_system")


def plot_treemap(df):
    """Treemap - Business Type vs Forecast Method."""
    try:
        import squarify
    except ImportError: return
    tbl = df.groupby(["business_type","forecast_method"]).size().reset_index(name="count")
    fig, ax = plt.subplots(figsize=(10, 6))
    squarify.plot(sizes=tbl["count"],
                  label=[f"{r['business_type']}\n{r['forecast_method'][:10]}" for _, r in tbl.iterrows()],
                  color=COLORS, alpha=0.7, ax=ax,
                  text_kwargs={"fontsize": 8, "color": "white", "fontweight": "bold"})
    ax.axis("off")
    ax.set_title("Treemap: Business Type & Forecast Method", fontsize=12, fontweight="bold")
    save("17_treemap_biz_forecast")


# =============================================================================
# 8. ADDITIONAL ANALYSIS
# =============================================================================

def plot_revenue_loss_donut(df):
    """Donut chart - Revenue loss distribution."""
    vc = df["revenue_loss"].value_counts()
    fig, ax = plt.subplots(figsize=(7, 5))
    wedges, _, _ = ax.pie(vc.values, labels=None, autopct="%1.0f%%", 
                          colors=COLORS, startangle=90,
                          wedgeprops=dict(width=0.5, edgecolor="white"))
    ax.legend(wedges, vc.index, loc="lower center", bbox_to_anchor=(0.5, -0.1), ncol=2, fontsize=8)
    ax.set_title("Revenue Loss Distribution", fontsize=12, fontweight="bold")
    save("18_revenue_loss_donut")


def plot_supplier_lead_time_histogram(df):
    """Histogram-style bar – Lead time distribution."""
    order = ["1–3 days","4–7 days","8–14 days","15–30 days","More than 30 days"]
    vc    = df["lead_time"].value_counts().reindex(order).fillna(0)
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(vc.index, vc.values, color=COLORS[1], width=0.6, edgecolor="white")
    ax.bar_label(bars, fmt="%d", padding=4, fontweight="bold")
    ax.set_title("Supplier Lead Time Distribution", fontsize=13, fontweight="bold")
    ax.set_xlabel("Lead Time (days)")
    ax.set_ylabel("Count")
    plt.tight_layout()
    save("19_lead_time_histogram")


def plot_safety_stock_donut(df):
    """Donut chart – Safety stock practices."""
    vc = df["safety_stock"].value_counts()
    fig, ax = plt.subplots(figsize=(7, 5))
    colors = COLORS[:len(vc)]
    wedges,_,autotexts = ax.pie(
        vc.values, labels=None, autopct="%1.0f%%", colors=colors,
        startangle=90, wedgeprops=dict(width=0.55, edgecolor="white", linewidth=2),
        pctdistance=0.75)
    for at in autotexts:
        at.set_fontsize(11); at.set_color("white"); at.set_fontweight("bold")
    ax.legend(wedges, vc.index, loc="lower center", bbox_to_anchor=(0.5,-0.15), ncol=1, fontsize=8)
    ax.set_title("Safety Stock Maintenance Practices", fontsize=13, fontweight="bold")
    save("20_safety_stock_donut")


def plot_likert_means_bar(df):
    """Horizontal bar - Average Likert score per statement."""
    avgs = [df[c].mean() for c in LIKERT_COLS]
    labels = [LIKERT_LABELS[c] for c in LIKERT_COLS]
    fig, ax = plt.subplots(figsize=(12, 6))
    bars = ax.barh(labels, avgs, color=COLORS, height=0.6, edgecolor="white")
    ax.bar_label(bars, fmt="%.2f", padding=4, fontweight="bold")
    ax.set_xlim(0, 5.5)
    ax.axvline(3, color="gray", linestyle="--", alpha=0.5)
    ax.set_title("Average Likert Scores", fontsize=12, fontweight="bold")
    plt.tight_layout()
    save("21_likert_means_bar")


# =============================================================================
# SUMMARY STATISTICS
# =============================================================================

def print_summary(df):
    print("\n" + "="*60)
    print("SUMMARY STATISTICS")
    print("="*60)
    print(f"Total Responses: {len(df)}")
    print(f"\nBusiness Types:\n{df['business_type'].value_counts()}")
    
    # Chi-square: Business type vs Stockout
    print("\n-- Chi-Square Analysis --")
    if df["business_type"].nunique() > 1:
        # Resolve Chi-Square Zero Cell Issue: Merge low frequency business types if needed
        # For simplicity, we filter out types with very low counts
        threshold = 2
        counts = df['business_type'].value_counts()
        valid_biz = counts[counts >= threshold].index
        df_filtered = df[df['business_type'].isin(valid_biz)]
        
        if df_filtered["business_type"].nunique() > 1:
            ct = pd.crosstab(df_filtered["business_type"], df_filtered["stockout_freq"])
            # Remove columns/rows with all zeros
            ct = ct.loc[(ct.sum(axis=1) > 0), (ct.sum(axis=0) > 0)]
            
            if ct.size > 0:
                chi2, p, dof, _ = chi2_contingency(ct)
                print(f"Business Type vs Stockout: p={p:.3f} (Chi2={chi2:.2f})")
            else:
                print("Chi-Square: Insufficient data after filtering.")
        else:
            print("Chi-Square: Not enough categories with sufficient data.")
    print("="*60)

if __name__ == "__main__":
    import sys
    filepath = sys.argv[1] if len(sys.argv) > 1 else "survey_responses_cleaned.csv"

    if not os.path.exists(filepath):
        # Fallback to absolute DATA_DIR if relative path provided is not found
        alt_path = os.path.join(DATA_DIR, os.path.basename(filepath))
        if os.path.exists(alt_path):
            filepath = alt_path
        else:
            print(f"Error: {filepath} not found. Run preprocessing.py first.")
            sys.exit(1)

    df = load_data(filepath)
    
    print("Generating charts...")
    plot_business_type_bar(df)
    plot_likert_histograms(df)
    plot_likert_density(df)
    plot_box_plots(df)
    plot_violin(df)
    plot_grouped_bar_stockout_vs_system(df)
    plot_stacked_forecast_by_biz(df)
    plot_stacked_demand_pred_by_biz(df)
    plot_heatmap_correlation(df)
    plot_bubble_chart(df)
    plot_diverging_likert(df)
    plot_radar_likert(df)
    plot_demand_factors_pareto(df)
    plot_horizontal_stockout(df)
    plot_response_timeline(df)
    plot_donut_inv_system(df)
    plot_treemap(df)
    plot_revenue_loss_donut(df)
    plot_supplier_lead_time_histogram(df)
    plot_safety_stock_donut(df)
    plot_likert_means_bar(df)
    print_summary(df)
    print(f"\nAll charts saved to: {CHARTS_DIR}")
