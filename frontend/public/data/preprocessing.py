import pandas as pd
import numpy as np
import os
import re

# -- CONFIGURATION -----------------------------------------------------------
# Using paths relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = SCRIPT_DIR
INPUT_FILE = os.path.join(DATA_DIR, "survey_responses.csv")
OUTPUT_FILE = os.path.join(DATA_DIR, "survey_responses_cleaned.csv")

# 1. Column Mapping (Sanitize for Analysis)
COL_MAP = {
    "What type of business does your organization operate in?": "business_type",
    "How long has your business been operating?": "years_operating",
    "What is your role in the organization?  ": "role",
    "What is the approximate size of your inventory (number of distinct products / SKUs managed)?  ": "sku_size",
    "How does your organization currently manage inventory levels?  ": "inv_mgmt",
    "How often does your organization experience stockouts (inability to fulfill orders due to insufficient stock)?  ": "stockout_freq",
    "How often does your organization experience excess inventory or overstocking?": "overstock_freq",
    "On average, how many days' worth of stock does your organization hold at any given time?  ": "days_stock",
    "Which factors most significantly affect demand for your products?": "demand_factors",
    "How predictable is the demand for your primary products on a week-to-week basis?  ": "demand_predictability",
    "During which period(s) does your organization typically experience peak product demand?  ": "peak_period",
    "What method does your organization currently use to forecast product demand": "forecast_method",
    "How frequently does your organization update its demand forecasts?  ": "forecast_freq",
    "What is the primary source of error in your current demand forecasts?  ": "forecast_error",
    "What is the average lead time from your primary supplier(s) — number of days from placing an order to receiving goods?  ": "lead_time",
    "How reliably do your suppliers meet their promised delivery timelines?  ": "supplier_reliability",
    "Does your organization currently maintain a safety stock (buffer inventory held to guard against demand uncertainty or supplier delays)?  ": "safety_stock",
    "Does your organization maintain digitally accessible historical sales data": "hist_data",
    "How frequently is your inventory and sales data updated in your system?  ": "data_update_freq",
    "Approximately what percentage of your organization's annual revenue is estimated to be lost due to inventory inefficiencies (stockouts, overstocking, or obsolete stock)?  ": "revenue_loss",
    "My organization's current inventory system effectively prevents stockouts and excess inventory.  ": "L1_inv_system",
    "I trust the accuracy of our current demand forecasting method.": "L2_forecast_trust",
    "Supplier delays are a frequent and significant source of inventory disruption in our operations.  ": "L3_supplier_delay",
    "Seasonal and promotional demand fluctuations are difficult to predict accurately with our current methods.  ": "L4_seasonal_difficulty",
    "I believe predictive analytics can significantly improve the accuracy of inventory and demand decisions.  ": "L5_analytics_belief",
    " My organization has sufficient data quality and availability to support the implementation of predictive analytics.  ": "L6_data_readiness",
}

# 2. Normalization Mappings
BIZ_MAP = {
    "Retail": "Retail",
    "Manufacturing": "Manufacturing",
    "Wholesale": "Wholesale / Distribution",
    "Distribution": "Wholesale / Distribution",
    "E-commerce": "E-commerce",
    "Engineering": "Consultancy / Services",
    "Power": "Manufacturing / Industrial",
    "Mining": "Manufacturing / Industrial",
    "Consultancy": "Consultancy / Services",
    "Healthcare": "Healthcare / Medical",
    "IT": "IT / Tech",
    "Design": "Manufacturing / Industrial",
    "Service": "Consultancy / Services"
}

def clean_data():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found!")
        return

    print(f"Loading {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
    
    # Global Dash Handling
    df = df.applymap(lambda x: x.replace('–', '-').replace('—', '-') if isinstance(x, str) else x)
    
    # Rename columns to short keys
    df.rename(columns=COL_MAP, inplace=True)
    
    # Timestamp Formatting
    if "Timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["Timestamp"])
        df.drop(columns=["Timestamp"], inplace=True)

    # Normalize Business Type
    def normalize_biz(val):
        if pd.isna(val): return "Other"
        main_type = str(val).split(',')[0].strip()
        for key, target in BIZ_MAP.items():
            if key.lower() in main_type.lower():
                return target
        return "Other"
    
    df["business_type"] = df["business_type"].apply(normalize_biz)

    # Numeric Mapping for Bubble Chart
    lt_map  = {"1-3": 2, "4-7": 5, "8-14": 11, "15-30": 22, "More than 30": 35}
    rl_map  = {"Less than 2": 1, "2%-5%": 3.5, "6%-10%": 8, "More than 10": 12, "Unable to estimate": np.nan}
    sku_map = {"Fewer than 50": 50, "50-200": 150, "200-500": 350, "More than 500": 600}

    def map_range(val, mapping):
        val_str = str(val)
        for k, v in mapping.items():
            if k in val_str: return v
        return np.nan

    df["lt_num"] = df["lead_time"].apply(lambda x: map_range(x, lt_map))
    df["rl_num"] = df["revenue_loss"].apply(lambda x: map_range(x, rl_map))
    df["sku_num"] = df["sku_size"].apply(lambda x: map_range(x, sku_map))

    # Ordinal mappings for frequencies
    freq_map = {"weekly": 4, "month": 3, "year": 2, "Never": 1}
    df["stockout_freq_num"] = df["stockout_freq"].astype(str).apply(lambda x: next((v for k,v in freq_map.items() if k in x.lower()), 1))
    df["overstock_freq_num"] = df["overstock_freq"].astype(str).apply(lambda x: next((v for k,v in freq_map.items() if k in x.lower()), 1))

    # Multi-Select Demand Factors (Dummies)
    factors = df["demand_factors"].fillna("None").str.get_dummies(sep=',')
    factors.columns = ["factor_" + re.sub(r'\W+', '_', c.strip().lower()) for c in factors.columns]
    df = pd.concat([df, factors], axis=1)

    # Ensure Likert are numeric
    LIKERT_COLS = ["L1_inv_system","L2_forecast_trust","L3_supplier_delay",
                   "L4_seasonal_difficulty","L5_analytics_belief","L6_data_readiness"]
    for col in LIKERT_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # Save cleaned data
    print(f"Saving cleaned data to {OUTPUT_FILE}...")
    df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")
    print("Preprocessing complete.")

if __name__ == "__main__":
    clean_data()
