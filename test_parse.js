
const fs = require('fs');

const COL = {
  "Timestamp":                                                          "ts",
  "What type of business does your organization operate in?":           "bizType",
  "How long has your business been operating?":                         "yrs",
  "What is your role in the organization?":                             "role",
  "What is the approximate size of your inventory (number of distinct products / SKUs managed)?": "sku",
  "How does your organization currently manage inventory levels?":       "invMgmt",
  "How often does your organization experience stockouts (inability to fulfill orders due to insufficient stock)?": "stockout",
  "How often does your organization experience excess inventory or overstocking?": "overstock",
};

function testOverlap() {
  const rawHeaders = [
    "Timestamp",
    "What type of business does your organization operate in?",
    "How long has your business been operating?",
    "What is your role in the organization?  ",
    "What is the approximate size of your inventory (number of distinct products / SKUs managed)?  ",
    "How does your organization currently manage inventory levels?  ",
    "How often does your organization experience stockouts (inability to fulfill orders due to insufficient stock)?  ",
    "How often does your organization experience excess inventory or overstocking?"
  ];

  const keyMap = {};
  const colKeys = Object.keys(COL);
  let output = "";

  rawHeaders.forEach((h, i) => {
    const cleanHeader = h.toLowerCase().trim();
    const matchedKey = colKeys.find(k => {
      const cleanK = k.toLowerCase().trim();
      // Precise or fuzzy match (first 80 chars)
      return cleanHeader === cleanK || 
             cleanHeader.includes(cleanK.slice(0, 80)) || 
             cleanK.includes(cleanHeader.slice(0, 80));
    });
    keyMap[i] = matchedKey ? COL[matchedKey] : h;
    output += `Column ${i}: "${h}" -> mapped to "${keyMap[i]}"\n`;
  });

  fs.writeFileSync('result_final.txt', output, 'utf8');
  console.log("Done");
}

testOverlap();
