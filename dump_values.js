const fs = require('fs');
const path = require('path');

const csvPath = 'e:\\GitHub\\Business-Analytics-Project\\frontend\\public\\data\\survey_responses_cleaned.csv';
const text = fs.readFileSync(csvPath, 'utf8');
const lines = text.trim().split('\n');

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

const headers = splitLine(lines[0]);
const data = lines.slice(1).map(splitLine);

const COL_MAP = {
  "business_type":          "bizType",
  "years_operating":        "yrs",
  "sku_size":               "sku",
  "inv_mgmt":               "invMgmt",
  "stockout_freq":          "stockout",
  "overstock_freq":         "overstock",
  "forecast_method":        "fcastMethod",
  "lead_time":              "leadTime",
  "safety_stock":           "safetyStock",
  "revenue_loss":           "revLoss"
};

const results = {};

Object.entries(COL_MAP).forEach(([h, k]) => {
  const idx = headers.indexOf(h);
  if (idx !== -1) {
    const vals = new Set();
    data.forEach(r => {
      if (r[idx]) vals.add(r[idx]);
    });
    results[k] = [...vals];
  } else {
    results[k] = ["NOT FOUND"];
  }
});

console.log(JSON.stringify(results, null, 2));
