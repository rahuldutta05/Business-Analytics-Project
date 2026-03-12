const fs = require('fs');
const path = require('path');

const COL = {
  // --- Original Question Mappings ---
  "Timestamp":                                                          "ts",
  "What type of business does your organization operate in?":           "bizType",
  "How long has your business been operating?":                         "yrs",
  "What is your role in the organization?":                             "role",
  "What is the approximate size of your inventory (number of distinct products / SKUs managed)?": "sku",
  "How does your organization currently manage inventory levels?":       "invMgmt",
  "How often does your organization experience stockouts (inability to fulfill orders due to insufficient stock)?": "stockout",
  "How often does your organization experience excess inventory or overstocking?": "overstock",
  "On average, how many days' worth of stock does your organization hold at any given time?": "daysStock",
  "Which factors most significantly affect demand for your products?":  "demandFactors",
  "How predictable is the demand for your primary products on a week-to-week basis?": "predictability",
  "During which period(s) does your organization typically experience peak product demand?": "peakPeriods",
  "What method does your organization currently use to forecast product demand?": "fcastMethod",
  "How frequently does your organization update its demand forecasts?":  "fcastFreq",
  "What is the primary source of error in your current demand forecasts?": "fcastError",
  "What is the average lead time from your primary supplier(s) — number of days from placing an order to receiving goods?": "leadTime",
  "How reliably do your suppliers meet their promised delivery timelines?": "supplierRel",
  "Does your organization currently maintain a safety stock (buffer inventory held to guard against demand uncertainty or supplier delays)?": "safetyStock",
  "Does your organization maintain digitally accessible historical sales data?": "histData",
  "How frequently is your inventory and sales data updated in your system?": "dataFreq",
  "Approximately what percentage of your organization's annual revenue is estimated to be lost due to inventory inefficiencies (stockouts, overstocking, or obsolete stock)?": "revLoss",
  "My organization's current inventory system effectively prevents stockouts and excess inventory.": "l1",
  "I trust the accuracy of our current demand forecasting method.":     "l2",
  "Supplier delays are a frequent and significant source of inventory disruption in our operations..": "l3",
  "Seasonal and promotional demand fluctuations are difficult to predict accurately with our current methods.": "l4",
  "I believe predictive analytics can significantly improve the accuracy of inventory and demand decisions.": "l5",
  "My organization has sufficient data quality and availability to support the implementation of predictive analytics.": "l6",

  // --- Preprocessed CSV Headers Support ---
  "business_type":          "bizType",
  "years_operating":        "yrs",
  "role":                   "role",
  "sku_size":               "sku",
  "inv_mgmt":               "invMgmt",
  "stockout_freq":          "stockout",
  "overstock_freq":         "overstock",
  "days_stock":             "daysStock",
  "demand_factors":         "demandFactors",
  "demand_predictability":  "predictability",
  "peak_period":            "peakPeriods",
  "forecast_method":        "fcastMethod",
  "forecast_freq":          "fcastFreq",
  "forecast_error":         "fcastError",
  "lead_time":              "leadTime",
  "supplier_reliability":   "supplierRel",
  "safety_stock":           "safetyStock",
  "hist_data":              "histData",
  "data_update_freq":       "dataFreq",
  "revenue_loss":           "revLoss",
  "L1_inv_system":          "l1",
  "L2_forecast_trust":      "l2",
  "L3_supplier_delay":      "l3",
  "L4_seasonal_difficulty": "l4",
  "L5_analytics_belief":    "l5",
  "L6_data_readiness":      "l6",
  "timestamp":              "ts"
};

function parseCSV(text) {
  const lines = text.trim().split("\n");
  console.log(`Lines detected: ${lines.length}`);
  if (lines.length < 2) return [];

  const splitLine = (line) => {
    const fields = [];
    let cur = "", inQ = false;
    for (let ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const rawHeaders = splitLine(lines[0]);
  console.log(`Headers detected: ${rawHeaders.length}`);

  const keyMap = {};
  const colKeys = Object.keys(COL);
  rawHeaders.forEach((h, i) => {
    const cleanHeader = h.toLowerCase().trim();
    const matchedKey = colKeys.find(k => {
      const cleanK = k.toLowerCase().trim();
      return cleanHeader === cleanK || 
             cleanHeader.includes(cleanK.slice(0, 80)) || 
             cleanK.includes(cleanHeader.slice(0, 80));
    });
    keyMap[i] = matchedKey ? COL[matchedKey] : h;
    console.log(`Col ${i}: "${h}" -> matchedKey: "${matchedKey}" -> mapped to: "${keyMap[i]}"`);
  });

  return lines.slice(1).filter(l => l.trim()).map((line, ri) => {
    const fields = splitLine(line);
    const row = { id: ri + 1 };
    fields.forEach((v, i) => {
      const key = keyMap[i] || `col_${i}`;
      if (["l1","l2","l3","l4","l5","l6"].includes(key)) {
        row[key] = parseInt(v, 10) || null;
      }
      else if (key === "demandFactors" || key === "peakPeriods") {
        row[key] = v.split(",").map(x => x.trim()).filter(Boolean);
      }
      else {
        row[key] = v.replace(/^"|"$/g, "").trim();
      }
    });
    return row;
  }).filter(r => r.bizType);
}

const csvPath = 'e:\\GitHub\\Business-Analytics-Project\\frontend\\public\\data\\survey_responses_cleaned.csv';
const text = fs.readFileSync(csvPath, 'utf8');
const result = parseCSV(text);
console.log(`Parsed result count: ${result.length}`);
if (result.length > 0) {
    console.log(`Sample row (first):`, JSON.stringify(result[0], null, 2));
} else {
    console.log(`First actual line of data (raw):`, text.split('\n')[1]);
}
