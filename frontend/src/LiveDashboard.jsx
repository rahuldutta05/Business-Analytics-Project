import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Legend, ComposedChart, Line, ReferenceLine, ScatterChart, Scatter, ZAxis
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// SETUP INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════
// 1. Open your Google Form → click the green Sheets icon (Responses tab)
//    to link/create a Google Sheet of responses.
//
// 2. In the Sheet: File → Share → Publish to web
//    → Choose "Entire Document" + "Comma-separated values (.csv)"
//    → Click "Publish" → Copy the URL.
//
// 3. Paste that URL below as SHEET_CSV_URL.
//
// 4. The dashboard auto-refreshes every REFRESH_INTERVAL_MS milliseconds.
// ═══════════════════════════════════════════════════════════════════════════

const SHEET_CSV_URL = "/data/survey_responses_cleaned.csv";
//  ↑ Replace with your actual published CSV URL

const REFRESH_INTERVAL_MS = 30_000; // auto-refresh every 30 seconds

// ─── COLUMN MAP: Google Form question → short key ──────────────────────────
// These must match your actual form column headers exactly.
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
  "Supplier delays are a frequent and significant source of inventory disruption in our operations.": "l3",
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

// ─── CSV PARSER ────────────────────────────────────────────────────────────

// Split a multi-select string by commas, but IGNORE commas inside parentheses.
// e.g. "Seasonal cycles (festive periods, summer, monsoon etc.), Price changes"
// → ["Seasonal cycles (festive periods, summer, monsoon etc.)", "Price changes"]
function splitMultiSelect(str) {
  const parts = [];
  let cur = "", depth = 0;
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      const trimmed = cur.trim();
      if (trimmed) parts.push(trimmed);
      cur = "";
      continue;
    }
    cur += ch;
  }
  const trimmed = cur.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

function parseCSV(text) {
  if (!text) return [];
  // Remove BOM if present
  const cleanText = text.replace(/^\uFEFF/, "");
  const lines = cleanText.trim().split("\n");
  if (lines.length < 2) {
    console.error("CSV has fewer than 2 lines:", cleanText.slice(0, 100));
    return [];
  }

  // Robust line splitter that handles quoted commas
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

  // Build header → shortKey mapping.
  // FIX: Use EXACT match for short preprocessed keys (length ≤ 30) to prevent
  //      derived columns like "stockout_freq_num" from overwriting "stockout_freq".
  //      Fuzzy matching is only allowed for long-form survey question keys (length > 30).
  const keyMap = {};
  const colKeys = Object.keys(COL);
  rawHeaders.forEach((h, i) => {
    const cleanHeader = h.toLowerCase().trim();
    const matchedKey = colKeys.find(k => {
      const cleanK = k.toLowerCase().trim();
      // Always allow exact match
      if (cleanHeader === cleanK) return true;
      // Only fuzzy-match for long survey-question keys to avoid false positives
      // on derived numeric columns (_num suffix, etc.)
      if (cleanK.length > 30) {
        return cleanHeader.includes(cleanK.slice(0, 60)) ||
               cleanK.includes(cleanHeader.slice(0, 60));
      }
      return false;
    });
    keyMap[i] = matchedKey ? COL[matchedKey] : null; // null = skip derived columns
  });

  return lines.slice(1).filter(l => l.trim()).map((line, ri) => {
    const fields = splitLine(line);
    const row = { id: ri + 1 };
    fields.forEach((v, i) => {
      const key = keyMap[i];
      if (!key) return; // skip unmapped / derived columns
      // Likert columns → integer
      if (["l1","l2","l3","l4","l5","l6"].includes(key)) {
        row[key] = parseInt(v, 10) || null;
      }
      // Multi-select columns → array (paren-aware split fixes "Seasonal cycles (festive, ...)")
      else if (key === "demandFactors" || key === "peakPeriods") {
        row[key] = splitMultiSelect(v).filter(Boolean);
      }
      else {
        row[key] = String(v).replace(/^"|"$/g, "").trim();
      }
    });
    return row;
  }).filter(r => r.bizType || r.role || r.id);
}

// ─── AGGREGATION HELPERS ───────────────────────────────────────────────────
const count    = (data, key) => {
  const m = {};
  data.forEach(r => { const v = r[key]; if (v) m[v] = (m[v]||0)+1; });
  return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
};
const flatCount = (data, key) => {
  const m = {};
  data.forEach(r => (r[key]||[]).forEach(v=>{ if(v) m[v]=(m[v]||0)+1; }));
  return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
};
const avg = (data, key) => data.length === 0 ? 0 :
  +(data.reduce((s,r)=>s+(+r[key]||0),0)/data.length).toFixed(2);

function pearson(xs, ys) {
  const n=xs.length; if(n<2) return 0;
  const mx=xs.reduce((a,b)=>a+b)/n, my=ys.reduce((a,b)=>a+b)/n;
  const num=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
  const den=Math.sqrt(xs.reduce((s,x)=>s+(x-mx)**2,0)*ys.reduce((s,y)=>s+(y-my)**2,0));
  return den===0?0:+(num/den).toFixed(2);
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const P = { blue:"#4361ee", purple:"#7209b7", teal:"#06d6a0", orange:"#fb8500",
            red:"#ef233c", sky:"#3a86ff" };
const PIE_COLORS = [P.blue, P.purple, P.teal, P.orange, P.red, P.sky];

const getTheme = (dark) => ({
  bg: dark ? "#0f172a" : "#f5f7ff",
  card: dark ? "#1e293b" : "#ffffff",
  text: dark ? "#f8fafc" : "#1a1a2e",
  border: dark ? "#334155" : "#f1f5f9",
  muted: dark ? "#94a3b8" : "#64748b",
  nbHover: dark ? "#334155" : "#eff3ff",
  ttBg: dark ? "#1e293b" : "#ffffff",
  ttBorder: dark ? "#475569" : "#e5e7eb",
});

const LCOLS   = ["l1","l2","l3","l4","l5","l6"];
const LSHORT  = ["Q20","Q21","Q22","Q23","Q24","Q25"];
const LLABELS = ["Inv System\nPrevents Issues","Trust in\nForecasting",
                 "Supplier\nDisruptions","Seasonal\nUnpredictability",
                 "Analytics\nBelief","Data\nReadiness"];

const NAV = [
  {id:"overview",  icon:"📊", label:"Overview"},
  {id:"inventory", icon:"📦", label:"Inventory"},
  {id:"demand",    icon:"📈", label:"Demand"},
  {id:"supplier",  icon:"🚚", label:"Supplier"},
  {id:"likert",    icon:"🎯", label:"Perceptions"},
  {id:"log",       icon:"📋", label:"Data Log"},
];

// ─── SMALL COMPONENTS ──────────────────────────────────────────────────────
function StatusBadge({ status, lastUpdated, nextIn }) {
  const cfg = {
    loading:  { bg:"#eff6ff", color:P.blue,   dot:"#93c5fd", text:"Fetching…" },
    live:     { bg:"#f0fdf4", color:"#16a34a", dot:"#4ade80", text:"Live" },
    error:    { bg:"#fff7ed", color:P.orange,  dot:P.orange,  text:"Fetch failed" },
    no_url:   { bg:"#f8fafc", color:"#94a3b8", dot:"#cbd5e1", text:"Demo mode" },
  }[status] || {};
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ background:cfg.bg, borderRadius:20, padding:"5px 12px",
                    display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:cfg.dot,
                      boxShadow: status==="live" ? `0 0 0 3px ${cfg.dot}40` : "none" }}/>
        <span style={{ fontSize:11, fontWeight:700, color:cfg.color }}>{cfg.text}</span>
      </div>
      {lastUpdated && (
        <span style={{ fontSize:10, color:"#94a3b8" }}>
          Updated {lastUpdated} · next in {nextIn}s
        </span>
      )}
    </div>
  );
}

function ChartCard({ title, height=240, children, wide=false, theme }) {
  return (
    <div style={{ background:theme.card, borderRadius:16, padding:"18px 20px",
                  boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", 
                  border:`1px solid ${theme.border}`,
                  gridColumn:wide?"span 2":undefined }}>
      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                  letterSpacing:"0.08em", color:theme.muted, marginBottom:14 }}>{title}</p>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function KPICard({ label, value, unit, icon, color, sub, theme }) {
  return (
    <div style={{ background:theme.card, borderRadius:16, padding:"18px 20px",
                  boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", 
                  border:`1px solid ${theme.border}`,
                  borderTop:`4px solid ${color}` }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <div>
          <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase",
                      letterSpacing:"0.08em", color:theme.muted }}>{label}</p>
          <div style={{ display:"flex", alignItems:"baseline", gap:5, marginTop:8 }}>
            <span style={{ fontSize:30, fontWeight:900, color: theme.dark ? "#fff" : color,
                           fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>{value}</span>
            <span style={{ fontSize:12, color:theme.muted }}>{unit}</span>
          </div>
          {sub && <p style={{ fontSize:11, color:theme.muted, marginTop:4 }}>{sub}</p>}
        </div>
        <div style={{ width:40, height:40, borderRadius:10, background:`${color}25`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function Insight({ color, text, theme }) {
  return (
    <div style={{ display:"flex", gap:10, padding:"10px 14px", background:`${color}${theme.dark?'15':'0d'}`,
                  borderRadius:10, border:`1px solid ${color}25`, marginBottom:8 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:color,
                    marginTop:6, flexShrink:0 }}/>
      <p style={{ fontSize:12, color:theme.text, lineHeight:1.7, opacity:0.9 }}>{text}</p>
    </div>
  );
}

function ThemeToggle({ dark, setDark }) {
  return (
    <button onClick={()=>setDark(!dark)}
      style={{ background: dark?"#334155":"#e2e8f0", border:"none", borderRadius:20, 
               width:44, height:24, position:"relative", cursor:"pointer", transition:"0.2s" }}>
      <div style={{ position:"absolute", top:3, left: dark?23:3, width:18, height:18, 
                    borderRadius:"50%", background:"#fff", transition:"0.2s",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>
        {dark ? "🌙" : "☀️"}
      </div>
    </button>
  );
}

// ─── SETUP GUIDE (shown when URL not set) ──────────────────────────────────
function SetupGuide() {
  const steps = [
    { n:1, title:"Open your Google Form", detail:"Go to the Responses tab and click the green Google Sheets icon to link or create a response sheet." },
    { n:2, title:"Publish the Sheet as CSV", detail:'In the Sheet: File → Share → Publish to web → Select "Entire Document" + "Comma-separated values (.csv)" → Click Publish → Copy the URL.' },
    { n:3, title:"Paste the URL in the code", detail:'Replace the SHEET_CSV_URL constant at the top of this file with your copied URL. The dashboard will then live-fetch every 30 seconds.' },
    { n:4, title:"Check column headers match", detail:"Ensure the COL mapping object matches your form question text exactly. Slight mismatches will default to showing the raw header." },
  ];
  return (
    <div style={{ maxWidth:680, margin:"60px auto", padding:32 }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
        <h2 style={{ fontSize:20, fontWeight:900, color:"#1a1a2e", marginBottom:8 }}>
          Connect Your Google Form
        </h2>
        <p style={{ fontSize:13, color:"#64748b", lineHeight:1.7 }}>
          This dashboard fetches live data from your Google Sheet. Follow these steps to connect it.
          Until connected, the dashboard runs in demo mode with sample data.
        </p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {steps.map(s=>(
          <div key={s.n} style={{ display:"flex", gap:16, background:"#fff", borderRadius:14,
                                   padding:"16px 20px", boxShadow:"0 2px 12px rgba(0,0,0,0.06)",
                                   border:"1px solid #f1f5f9" }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${P.blue}18`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:16, fontWeight:900, color:P.blue, flexShrink:0 }}>{s.n}</div>
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:"#1a1a2e", marginBottom:4 }}>{s.title}</p>
              <p style={{ fontSize:12, color:"#64748b", lineHeight:1.6 }}>{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:24, background:"#f8fafc", borderRadius:12, padding:"14px 18px",
                    border:"1px solid #e2e8f0" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase",
                    letterSpacing:"0.08em", marginBottom:8 }}>Why this approach?</p>
        <p style={{ fontSize:12, color:"#64748b", lineHeight:1.7 }}>
          Google Forms doesn't offer a public response API. The standard method for live data
          is: Form → linked Google Sheet → published as CSV → fetched in the browser.
          No backend, no API keys, no authentication required.
        </p>
      </div>
    </div>
  );
}

// ─── DIVERGING LIKERT ──────────────────────────────────────────────────────
function DivergingLikert({ data, theme }) {
  const N = data.length;
  if (N === 0) return <div style={{color:theme.muted,textAlign:"center",paddingTop:40}}>No data</div>;
  const rows = LCOLS.map((c,i) => ({
    name:LSHORT[i],
    SD:-data.filter(r=>r[c]===1).length,
    D: -data.filter(r=>r[c]===2).length,
    N:  data.filter(r=>r[c]===3).length,
    A:  data.filter(r=>r[c]===4).length,
    SA: data.filter(r=>r[c]===5).length,
  }));
  const ttStyle = { backgroundColor:theme.ttBg, border:`1px solid ${theme.ttBorder}`, borderRadius:8, fontSize:12, color:theme.text };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{top:4,right:60,left:36,bottom:4}}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false}/>
        <XAxis type="number" tickFormatter={v=>`${Math.abs(v)}`}
               tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
        <YAxis type="category" dataKey="name" width={32}
               tick={{fontSize:11,fill:theme.text,fontWeight:700}} tickLine={false} axisLine={false}/>
        <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000008"}}
          formatter={(v,n)=>[`${Math.abs(v)} resp.`,
          {SD:"Strongly Disagree",D:"Disagree",N:"Neutral",A:"Agree",SA:"Strongly Agree"}[n]||n]}/>
        <ReferenceLine x={0} stroke={theme.dark?"#64748b":"#334155"} strokeWidth={2}/>
        <Bar dataKey="SD" stackId="s" fill={P.red}    radius={[4,0,0,4]} isAnimationActive={false}/>
        <Bar dataKey="D"  stackId="s" fill={P.orange} isAnimationActive={false}/>
        <Bar dataKey="N"  stackId="p" fill={theme.dark?"#334155":"#e2e8f0"} isAnimationActive={false}/>
        <Bar dataKey="A"  stackId="p" fill={P.teal}   isAnimationActive={false}/>
        <Bar dataKey="SA" stackId="p" fill={P.blue}   radius={[0,4,4,0]} isAnimationActive={false}/>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── CORRELATION HEATMAP ───────────────────────────────────────────────────
function CorrHeatmap({ data }) {
  const matrix = LCOLS.map((c1,i)=>LCOLS.map((c2,j)=>{
    const xs=data.map(r=>r[c1]||0), ys=data.map(r=>r[c2]||0);
    return pearson(xs,ys);
  }));
  const getColor=v=>v>=0.7?P.blue:v>=0.4?`${P.blue}80`:v>=-0.1?"#f8fafc":v>=-0.4?`${P.red}60`:P.red;
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"separate",borderSpacing:3,fontSize:11}}>
        <thead><tr>
          <th style={{padding:"4px 8px"}}/>
          {LSHORT.map((s,i)=><th key={i} style={{padding:"4px 8px",color:"#475569",
            fontWeight:700,textAlign:"center",minWidth:62}}>{s}</th>)}
        </tr></thead>
        <tbody>{LCOLS.map((c1,i)=>(
          <tr key={i}>
            <td style={{padding:"4px 8px",color:"#475569",fontWeight:700}}>{LSHORT[i]}</td>
            {LCOLS.map((c2,j)=>{
              const v=matrix[i][j];
              return <td key={j} style={{background:getColor(v),borderRadius:6,
                textAlign:"center",padding:"10px 6px",fontWeight:700,
                fontFamily:"monospace",fontSize:12,minWidth:62,
                color:Math.abs(v)>0.4?"#fff":"#334155"}}>{v.toFixed(2)}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
const DEMO = [
  {id:1,ts:"3/10/2026 18:10",bizType:"Manufacturing",yrs:"5+ years",role:"Owner/GM",sku:"50–200",invMgmt:"Manual",stockout:"Occasionally",overstock:"Rarely",daysStock:"<7 days",demandFactors:["Seasonal","Price changes"],predictability:"Highly predictable",peakPeriods:["Uniform"],fcastMethod:"Gut feeling",fcastFreq:"Weekly",fcastError:"Insufficient data",leadTime:"4–7 days",supplierRel:"Reliable (75–90%)",safetyStock:"Formal",histData:"Not maintained",dataFreq:"Real-time",revLoss:"2–5%",l1:3,l2:3,l3:2,l4:2,l5:3,l6:3},
  {id:2,ts:"3/10/2026 18:15",bizType:"Manufacturing",yrs:"5+ years",role:"HR",sku:">500",invMgmt:"ERP",stockout:"Occasionally",overstock:"Very frequently",daysStock:"15–30 days",demandFactors:["Seasonal"],predictability:"Unpredictable",peakPeriods:["Q4"],fcastMethod:"Statistical methods",fcastFreq:"Daily",fcastError:"Unexpected behaviour",leadTime:"8–14 days",supplierRel:"Inconsistent (50–75%)",safetyStock:"Formal",histData:"Partial",dataFreq:"Daily",revLoss:">10%",l1:3,l2:1,l3:3,l4:4,l5:3,l6:2},
  {id:3,ts:"3/10/2026 18:29",bizType:"Wholesale/Distribution",yrs:"5+ years",role:"Owner/GM",sku:">500",invMgmt:"Software",stockout:"Rarely",overstock:"Occasionally",daysStock:">60 days",demandFactors:["Price changes","Competitor pricing"],predictability:"Moderately predictable",peakPeriods:["Q3"],fcastMethod:"Software tools",fcastFreq:"Monthly",fcastError:"Supplier disruptions",leadTime:"4–7 days",supplierRel:"Reliable (75–90%)",safetyStock:"Formal",histData:"Spreadsheets",dataFreq:"Monthly",revLoss:"<2%",l1:4,l2:3,l3:3,l4:4,l5:4,l6:3},
  {id:4,ts:"3/10/2026 18:59",bizType:"Manufacturing",yrs:"5+ years",role:"Design",sku:"50–200",invMgmt:"ERP",stockout:"Rarely",overstock:"Rarely",daysStock:"31–60 days",demandFactors:["Customer trends"],predictability:"Moderately predictable",peakPeriods:["Q1"],fcastMethod:"Statistical methods",fcastFreq:"Weekly",fcastError:"Supplier disruptions",leadTime:">30 days",supplierRel:"Inconsistent (50–75%)",safetyStock:"Informal",histData:"Dedicated system",dataFreq:"Weekly",revLoss:"6–10%",l1:3,l2:3,l3:4,l4:3,l5:3,l6:3},
  {id:5,ts:"3/10/2026 19:00",bizType:"Wholesale/Distribution",yrs:"5+ years",role:"Owner/GM",sku:">500",invMgmt:"Manual",stockout:"Very frequently",overstock:"Occasionally",daysStock:"31–60 days",demandFactors:["Seasonal"],predictability:"Moderately predictable",peakPeriods:["Uniform"],fcastMethod:"Manual analysis",fcastFreq:"Monthly",fcastError:"Insufficient data",leadTime:"8–14 days",supplierRel:"Reliable (75–90%)",safetyStock:"None",histData:"Partial",dataFreq:"Irregular",revLoss:"6–10%",l1:3,l2:3,l3:4,l4:4,l5:5,l6:3},
];

export default function Dashboard() {
  const [tab,       setTab]       = useState("overview");
  const [data,      setData]      = useState(DEMO);
  const [status,    setStatus]    = useState("no_url");
  const [lastFetch, setLastFetch] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS/1000);
  const [error,     setError]     = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [dark,      setDark]      = useState(false);

  const theme = { ...getTheme(dark), dark };
  const ttStyle = { backgroundColor:theme.ttBg, border:`1px solid ${theme.ttBorder}`, borderRadius:8, fontSize:12, color:theme.text, boxShadow:"0 4px 12px rgba(0,0,0,0.1)" };

  const isConfigured = SHEET_CSV_URL && !SHEET_CSV_URL.includes("YOUR_SHEET_ID");

  // ── Fetch function ─────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!isConfigured) { setStatus("no_url"); return; }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(SHEET_CSV_URL, { cache:"no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) throw new Error("No data rows found in CSV");
      setData(parsed);
      setStatus("live");
      setLastFetch(new Date().toLocaleTimeString());
      setCountdown(REFRESH_INTERVAL_MS/1000);
    } catch (e) {
      setStatus("error");
      setError(e.message);
    }
  }, [isConfigured]);

  // ── Auto-refresh ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured) return;
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData, isConfigured]);

  // ── Countdown ticker ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured) return;
    const tick = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_INTERVAL_MS/1000 : c-1), 1000);
    return () => clearInterval(tick);
  }, [isConfigured]);

  // ── Derived data ───────────────────────────────────────────────────────
  const N = data.length;

  const bizTypeData   = useMemo(()=>{
    const raw = count(data,"bizType");
    const m = {};
    raw.forEach(d => {
      // Group by the main category (first word or before special chars)
      let name = d.name.split(/[–\-\/]/)[0].trim();
      if (name.toLowerCase().includes("manufacturing")) name = "Manufacturing";
      else if (name.toLowerCase().includes("wholesale")) name = "Wholesale / Distribution";
      else if (name.toLowerCase().includes("retail")) name = "Retail";
      else if (name.toLowerCase().includes("service")) name = "Service";
      else if (name.toLowerCase().includes("e-commerce")) name = "E-commerce";
      else if (!name) name = "Other";
      m[name] = (m[name]||0) + d.value;
    });
    return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }, [data]);
  const invMgmtData   = useMemo(()=>count(data,"invMgmt"),   [data]);
  const stockoutData  = useMemo(()=>count(data,"stockout"),  [data]);
  const overstockData = useMemo(()=>count(data,"overstock"), [data]);
  const daysStockData = useMemo(()=>count(data,"daysStock"),  [data]);
  const fcastData     = useMemo(()=>count(data,"fcastMethod"),[data]);
  const fcastErrData  = useMemo(()=>count(data,"fcastError"), [data]);
  const leadTimeData  = useMemo(()=>count(data,"leadTime"),   [data]);
  const supplierData  = useMemo(()=>count(data,"supplierRel"),[data]);
  const safetyData    = useMemo(()=>count(data,"safetyStock"),[data]);
  const revLossData   = useMemo(()=>count(data,"revLoss"),    [data]);
  const demandFacData = useMemo(()=>flatCount(data,"demandFactors"),[data]);
  const predictData   = useMemo(()=>count(data,"predictability"),[data]);

  const likertAvg = useMemo(()=>LCOLS.map((c,i)=>({
    name:LSHORT[i], label:LLABELS[i], avg:avg(data,c),
    sd:data.filter(r=>r[c]===1).length,
    d: data.filter(r=>r[c]===2).length,
    ne:data.filter(r=>r[c]===3).length,
    a: data.filter(r=>r[c]===4).length,
    sa:data.filter(r=>r[c]===5).length,
  })),[data]);

  const radarData = useMemo(()=>LCOLS.map((c,i)=>({
    subject:LSHORT[i], avg:avg(data,c), fullMark:5
  })),[data]);

  const bizFcastCross = useMemo(()=>{
    const types=[...new Set(data.map(r=>r.bizType))].filter(Boolean);
    const methods=[...new Set(data.map(r=>r.fcastMethod))].filter(Boolean);
    return types.map(bt=>({
      name:bt,
      ...Object.fromEntries(methods.map(m=>[m,data.filter(r=>r.bizType===bt&&r.fcastMethod===m).length]))
    }));
  },[data]);
  const fcastMethods = useMemo(()=>[...new Set(data.map(r=>r.fcastMethod))].filter(Boolean),[data]);

  const bubbleData = useMemo(() => {
    const findMap = (val, mapping) => {
      if (!val) return null;
      const v = String(val).toLowerCase().replace(/[–—]/g, "-");
      // Sort keys by length descending to avoid shadowing (e.g. "2%" matching "less than 2%")
      const entries = Object.entries(mapping).sort((a,b) => b[0].length - a[0].length);
      for (const [k, score] of entries) {
        if (v.includes(k.toLowerCase())) return score;
      }
      return null;
    };

    const ltM = { "1-3": 2, "4-7": 5, "8-14": 11, "15-30": 22, "more than 30": 35 };
    const rlM = { "less than 2": 1, "2%-5%": 3.5, "6%-10%": 8, "more than 10": 12 };
    const skM = { "fewer than 50": 50, "50-200": 150, "200-500": 350, "more than 500": 600 };

    return data.map(r => ({
      lt: findMap(r.leadTime, ltM) || 5,
      rl: findMap(r.revLoss, rlM) || 5,
      sku: findMap(r.sku, skM) || 100
    }));
  }, [data]);

  const timelineData = useMemo(()=>data.map((r,i)=>({
    ts: r.ts ? r.ts.split(" ")[1]||r.ts : `R${i+1}`, n:i+1
  })),[data]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",minHeight:"100vh",background:theme.bg,
                 fontFamily:"'Nunito','Segoe UI',sans-serif",color:theme.text, transition:"background 0.2s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${theme.bg};}
        ::-webkit-scrollbar-thumb{background:${theme.border};border-radius:3px;}
        .nb{transition:all 0.15s;cursor:pointer;border:none;background:none;
            width:100%;display:flex;align-items:center;gap:10px;
            padding:10px 16px;border-radius:10px;font-family:inherit;}
        .nb:hover{background:${theme.nbHover};}
        tr:hover td{background:${theme.nbHover}!important;}
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{width:200,background:theme.card,borderRight:`1px solid ${theme.border}`,
                   padding:"24px 12px",display:"flex",flexDirection:"column",
                   position:"sticky",top:0,height:"100vh",overflowY:"auto",flexShrink:0, transition:"background 0.2s"}}>
        <div style={{paddingLeft:8,marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:28,height:28,borderRadius:8,
              background:`linear-gradient(135deg,${P.blue},${P.purple})`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>📦</div>
            <span style={{fontSize:14,fontWeight:900,color:theme.text}}>InvAnalytics</span>
          </div>
          <p style={{fontSize:10,color:theme.muted,marginLeft:36}}>Live Survey Dashboard</p>
        </div>

        <p style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",
                   color:theme.muted,marginBottom:8,paddingLeft:8, opacity:0.6}}>Navigation</p>
        {NAV.map(n=>(
          <button key={n.id} className="nb" onClick={()=>setTab(n.id)}
            style={{color:tab===n.id?P.blue:theme.muted,fontWeight:tab===n.id?800:600,
                   background:tab===n.id?theme.nbHover:"none",fontSize:13}}>
            <span style={{fontSize:16}}>{n.icon}</span>{n.label}
            {tab===n.id&&<div style={{marginLeft:"auto",width:5,height:5,
              borderRadius:"50%",background:P.blue}}/>}
          </button>
        ))}

        <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:8,padding:"16px 8px 0"}}>
          <div style={{background:theme.bg,borderRadius:10,padding:"12px 14px", border:`1px solid ${theme.border}`}}>
            <p style={{fontSize:10,color:theme.muted,marginBottom:2}}>Responses</p>
            <p style={{fontSize:24,fontWeight:900,color:P.blue,fontFamily:"'JetBrains Mono',monospace"}}>{N}</p>
            <p style={{fontSize:10,color:theme.muted}}>total collected</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 8px" }}>
             <span style={{ fontSize:10, fontWeight:700, color:theme.muted }}>THEME</span>
             <ThemeToggle dark={dark} setDark={setDark}/>
          </div>
          <button className="nb" onClick={()=>setShowSetup(s=>!s)}
            style={{fontSize:11,color:theme.muted,fontWeight:600,
                   border:`1px dashed ${theme.border}`,justifyContent:"center",padding:"8px"}}>
            ⚙️ Setup Guide
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{flex:1,overflowY:"auto",padding:"28px 32px"}}>

        {/* Header bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:900,color:theme.text,letterSpacing:"-0.02em"}}>
              {NAV.find(n=>n.id===tab)?.icon} {NAV.find(n=>n.id===tab)?.label}
            </h1>
            <p style={{fontSize:12,color:theme.muted,marginTop:3}}>
              Inventory Management & Predictive Analytics Survey · {N} responses
            </p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <StatusBadge status={status} lastUpdated={lastFetch} nextIn={countdown}/>
            {isConfigured && (
              <button onClick={fetchData}
                style={{background:P.blue,color:"#fff",border:"none",borderRadius:8,
                        padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
                        fontFamily:"inherit"}}>
                ↻ Refresh
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,
                       padding:"12px 16px",marginBottom:20,display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:16}}>⚠️</span>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:P.orange}}>Fetch failed: {error}</p>
              <p style={{fontSize:11,color:"#92400e",marginTop:2}}>
                Showing last available data. Check your Sheet URL and ensure the Sheet is published publicly.
              </p>
            </div>
          </div>
        )}

        {/* Setup guide panel */}
        {showSetup && (
          <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",marginBottom:20,
                       boxShadow:"0 2px 12px rgba(0,0,0,0.06)",border:`1px solid ${P.blue}30`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:800,color:"#1a1a2e"}}>⚙️ How to connect your Google Form</p>
              <button onClick={()=>setShowSetup(false)}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>×</button>
            </div>
            {[
              ["1","Link Form to Sheet","Open your Google Form → Responses tab → click the green Sheets icon → create or select a Sheet."],
              ["2","Publish Sheet as CSV","In the Sheet: File → Share → Publish to web → 'Entire Document' + 'CSV' → Publish → Copy the URL."],
              ["3","Paste URL in code","Replace SHEET_CSV_URL in the source code with your copied URL. The dashboard will auto-fetch every 30 seconds."],
              ["4","Match column headers","Ensure the COL mapping object in the code matches your form question text. Questions must match the header row in the CSV."],
            ].map(([n,t,d])=>(
              <div key={n} style={{display:"flex",gap:14,marginBottom:12,padding:"10px 14px",
                                   background:"#f8fafc",borderRadius:10}}>
                <div style={{width:28,height:28,borderRadius:8,background:`${P.blue}18`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:900,color:P.blue,fontSize:13,flexShrink:0}}>{n}</div>
                <div>
                  <p style={{fontSize:12,fontWeight:800,color:"#1a1a2e"}}>{t}</p>
                  <p style={{fontSize:11,color:"#64748b",lineHeight:1.6,marginTop:2}}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════ OVERVIEW ════ */}
        {tab==="overview" && (
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
              <KPICard label="Responses"       value={N}               unit="total"    icon="👥" color={P.blue}   sub="Live count" theme={theme}/>
              <KPICard label="Analytics Belief" value={avg(data,"l5")} unit="/ 5"      icon="🤖" color={P.purple} sub="Avg Q24" theme={theme}/>
              <KPICard label="Data Readiness"  value={avg(data,"l6")}  unit="/ 5"      icon="🗃️" color={P.teal}   sub="Avg Q25" theme={theme}/>
              <KPICard label="With Safety Stock" value={data.filter(r=>r.safetyStock && r.safetyStock.startsWith("Yes")).length} unit={`/ ${N}`} icon="🛡️" color={P.orange} sub="Formal or informal" theme={theme}/>
              <KPICard label="Revenue at Risk" value={data.filter(r=>r.revLoss==="6%-10%" || r.revLoss==="More than 10%").length} unit={`/ ${N}`} icon="💸" color={P.red} sub="Losing 6%+ p.a." theme={theme}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
              <ChartCard title="Business Type" height={200} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bizTypeData} margin={{top:4,right:8,left:-20,bottom:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:theme.muted}} tickLine={false} angle={-25} textAnchor="end" interval={0} height={40}/>
                    <YAxis tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} allowDecimals={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={40} isAnimationActive={false}>
                      {bizTypeData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Inventory Management System" height={200} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={invMgmtData} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {invMgmtData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>) /* isAnimationActive to false for performance */}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" layout="horizontal" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Revenue Loss from Inventory Issues" height={200} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revLossData} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {revLossData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" layout="horizontal" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <ChartCard title="Radar — Avg Likert Perception Profile" height={270} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{top:8,right:40,bottom:8,left:40}}>
                    <PolarGrid stroke={theme.border}/>
                    <PolarAngleAxis dataKey="subject" tick={{fontSize:11,fill:theme.text,fontWeight:700}}/>
                    <PolarRadiusAxis domain={[0,5]} tick={{fontSize:9,fill:theme.muted}} tickCount={6} axisLine={false}/>
                    <Radar dataKey="avg" stroke={P.blue} fill={P.blue} fillOpacity={0.2} strokeWidth={2.5} dot={{r:4,fill:P.blue}} isAnimationActive={false}/>
                    <Tooltip contentStyle={ttStyle} formatter={(v,n,p)=>[v+" / 5",p.payload.subject]}/>
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Avg Likert Score per Statement" height={270} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={likertAvg} margin={{top:4,right:8,left:-16,bottom:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:theme.text,fontWeight:700}} tickLine={false} axisLine={false}/>
                    <YAxis domain={[0,5]} ticks={[0,1,2,3,4,5]} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}} formatter={(v,n,p)=>[v+" / 5",p.payload.label?.replace("\n"," ")]}/>
                    <ReferenceLine y={3} stroke={theme.muted} strokeDasharray="4 4" label={{value:"Neutral",position:"right",fontSize:9,fill:theme.muted}}/>
                    <Bar dataKey="avg" radius={[8,8,0,0]} maxBarSize={40} isAnimationActive={false}>
                      {likertAvg.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div style={{background:theme.card,borderRadius:16,padding:"20px 22px",
                         boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${theme.border}`}}>
              <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:theme.muted, marginBottom:14}}>Key Findings</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Insight color={P.red}    text={`${data.filter(r=>r.stockout==="Very frequently (weekly or more)").length} of ${N} organizations experience stockouts very frequently.`} theme={theme}/>
                <Insight color={P.blue}   text={`Trust in forecasting (avg ${avg(data,"l2")}/5) is the lowest-rated perception — confirming demand for better tools.`} theme={theme}/>
                <Insight color={P.teal}   text={`Analytics belief (avg ${avg(data,"l5")}/5) is the highest-rated item — respondents are ready to adopt predictive tools.`} theme={theme}/>
                <Insight color={P.orange} text={`${data.filter(r=>r.revLoss==="6%-10%" || r.revLoss==="More than 10%").length} of ${N} firms lose 6%+ annual revenue to inventory inefficiencies.`} theme={theme}/>
              </div>
            </div>
          </div>
        )}

        {/* ════ INVENTORY ════ */}
        {tab==="inventory" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <ChartCard title="Stockout Frequency" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockoutData} layout="vertical" margin={{top:4,right:40,left:20,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false}/>
                    <XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                    <YAxis type="category" dataKey="name" width={100} tick={{fontSize:9,fill:theme.text}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={24} isAnimationActive={false} label={{position:"right",fontSize:10,fontWeight:700,fill:theme.text}}>
                      {stockoutData.map((_,i)=><Cell key={i} fill={[P.teal,P.blue,P.orange,P.red][i%4]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Overstock Frequency" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overstockData} layout="vertical" margin={{top:4,right:40,left:20,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false}/>
                    <XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                    <YAxis type="category" dataKey="name" width={100} tick={{fontSize:9,fill:theme.text}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={24} isAnimationActive={false} label={{position:"right",fontSize:10,fontWeight:700,fill:theme.text}}>
                      {overstockData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <ChartCard title="Inv System vs Stockout Frequency" height={230} wide theme={theme}>
              <ResponsiveContainer width="100%" height="100%">
                {(() => {
                  // Use exact values from the CSV to avoid false-zero matches
                  const systems = [
                    "Manual tracking (spreadsheets or paper records)",
                    "Dedicated inventory management software",
                    "Enterprise Resource Planning (ERP) system",
                    "Automated analytics or AI-driven tools"
                  ];
                  const sfreqs = [
                    "Never",
                    "Rarely (a few times per year)",
                    "Occasionally (a few times per month)",
                    "Very frequently (weekly or more)"
                  ];
                  // Short display labels (strip the parenthetical clarification)
                  const sysLabel = s => s.split(" (")[0].replace("Enterprise Resource Planning", "ERP");
                  const d = systems.map(s => ({
                    name: sysLabel(s),
                    ...Object.fromEntries(sfreqs.map(f => [
                      f,
                      data.filter(r => r.invMgmt === s && r.stockout === f).length
                    ]))
                  }));
                  return (<BarChart data={d} margin={{top:4,right:8,left:10,bottom:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:theme.muted}} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} allowDecimals={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" align="center" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                    {sfreqs.map((f,i)=><Bar key={f} dataKey={f} fill={PIE_COLORS[i%PIE_COLORS.length]} radius={[4,4,0,0]} maxBarSize={30} isAnimationActive={false}/>)}
                  </BarChart>);
                })()}
              </ResponsiveContainer>
            </ChartCard>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <ChartCard title="Days of Stock Held" height={210} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daysStockData} margin={{top:4,right:8,left:-16,bottom:24}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:theme.muted}} tickLine={false} angle={-20} textAnchor="end" height={40}/>
                    <YAxis tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} allowDecimals={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" fill={P.sky} radius={[6,6,0,0]} maxBarSize={40} isAnimationActive={false} label={{position:"top",fontSize:10,fontWeight:700,fill:P.sky}}/>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Safety Stock Practices" height={210} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={safetyData.map(d => ({
                      // Strip "Yes - " / "No - " prefix for a clean legend label
                      name: d.name.includes(" - ") ? d.name.split(" - ").slice(1).join(" - ") : d.name,
                      value: d.value
                    }))} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {safetyData.map((_,i)=><Cell key={i} fill={[P.blue, P.teal, P.red, P.orange][i%4]}/>)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" align="center" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {/* ════ DEMAND ════ */}
        {tab==="demand" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <ChartCard title="Demand Factors with Cumulative %" height={260} wide theme={theme}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={demandFacData} margin={{top:4,right:40,left:-10,bottom:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:8,fill:theme.muted}} tickLine={false} angle={-25} textAnchor="end" interval={0} height={50}/>
                  <YAxis yAxisId="l" allowDecimals={false} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="r" orientation="right" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                  <Bar yAxisId="l" dataKey="value" radius={[6,6,0,0]} maxBarSize={40} isAnimationActive={false}>
                    {demandFacData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Bar>
                  <Line yAxisId="r" type="monotone" isAnimationActive={false}
                    data={demandFacData.map((d,i,a)=>({...d,cum:a.slice(0,i+1).reduce((s,x)=>s+x.value,0)/a.reduce((s,x)=>s+x.value,0)*100}))}
                    dataKey="cum" stroke={P.orange} strokeWidth={2.5} dot={{r:4,fill:P.orange}} name="Cumulative %"/>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <ChartCard title="Forecasting Methods" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    // Use explicit label + unique-enough match string to avoid false positives
                    const METHODS = [
                      { label:"Experience",                    match:"Experience or gut-feeling" },
                      { label:"Manual analysis\nof historical\nsales records", match:"Manual analysis of historical" },
                      { label:"Statistical\nmethods",          match:"Statistical methods" },
                      { label:"Software-based\nforecasting\ntools", match:"Software-based forecasting" },
                      { label:"AI / ML\nForecasting",          match:"Machine learning" },
                      { label:"No systematic\nforecasting\nprocess", match:"No systematic forecasting" },
                    ];
                    return METHODS.map(m => ({
                      name: m.label,
                      value: data.filter(r => String(r.fcastMethod).toLowerCase().includes(m.match.toLowerCase())).length
                    }));
                  })()} layout="vertical" margin={{top:4,right:50,left:10,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false}/>
                    <XAxis type="number" allowDecimals={false} tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false}/>
                    <YAxis type="category" dataKey="name" width={110} tick={{fontSize:9,fill:theme.text,whiteSpace:"pre"}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" radius={[0,6,6,0]} maxBarSize={22} isAnimationActive={false} label={{position:"right",fontSize:10,fontWeight:700,fill:theme.text}}>
                      {PIE_COLORS.map((c,i)=><Cell key={i} fill={c}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Demand Predictability" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={predictData} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={4} stroke="none" isAnimationActive={false}>
                      {predictData.map((_,i)=><Cell key={i} fill={[P.teal,P.blue,P.orange][i%3]}/>)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" align="center" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {/* ════ SUPPLIER ════ */}
        {tab==="supplier" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
              <ChartCard title="Supplier Lead Time" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadTimeData} margin={{top:4,right:8,left:-16,bottom:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:theme.muted}} tickLine={false} angle={-25} textAnchor="end" height={40}/>
                    <YAxis tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} allowDecimals={false}/>
                    <Tooltip contentStyle={ttStyle} cursor={{fill:theme.dark?"#ffffff10":"#00000005"}}/>
                    <Bar dataKey="value" fill={P.purple} radius={[6,6,0,0]} maxBarSize={40} isAnimationActive={false} label={{position:"top",fontSize:10,fontWeight:700,fill:P.purple}}/>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Supplier Reliability" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={supplierData} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {supplierData.map((_,i)=><Cell key={i} fill={[P.teal,P.blue,P.orange,P.red][i%4]}/>)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" align="center" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Historical Data Availability" height={220} theme={theme}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={count(data,"histData")} cx="50%" cy="40%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {count(data,"histData").map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle}/>
                    <Legend iconType="circle" iconSize={8} verticalAlign="bottom" align="center" formatter={v=><span style={{color:theme.muted,fontSize:9}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <ChartCard title="Lead Time vs Revenue Loss" height={280} wide theme={theme}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{top:8,right:24,bottom:28,left:8}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border}/>
                  <XAxis type="number" dataKey="lt" name="Lead Time" tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} label={{value:"Lead Time (days, approx)",position:"insideBottom",offset:-14,fontSize:10,fill:theme.muted}}/>
                  <YAxis type="number" dataKey="rl" name="Revenue Loss" tick={{fontSize:10,fill:theme.muted}} tickLine={false} axisLine={false} label={{value:"Revenue Loss (%)",angle:-90,position:"insideLeft",fontSize:10,fill:theme.muted}}/>
                  <ZAxis type="number" dataKey="sku" range={[60,400]} name="SKU Count"/>
                  <Tooltip contentStyle={ttStyle} cursor={{strokeDasharray:"3 3"}} formatter={(v,n)=>[v,n==="lt"?"Lead Time (days)":n==="rl"?"Revenue Loss (%)":"SKU Count"]}/>
                  <Scatter data={bubbleData} fill={P.blue} opacity={0.6} isAnimationActive={false}/>
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {/* ════ PERCEPTIONS ════ */}
        {tab==="likert" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <ChartCard title="Diverging Likert — Centered at Neutral (← Disagree | Agree →)" height={270} wide theme={theme}>
              <DivergingLikert data={data} theme={theme}/>
            </ChartCard>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:theme.card,borderRadius:16,padding:"18px 20px",
                           boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${theme.border}`}}>
                <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",
                            letterSpacing:"0.08em",color:theme.muted,marginBottom:14}}>
                  Pearson Correlation Matrix
                </p>
                <CorrHeatmap data={data} theme={theme}/>
              </div>
              <ChartCard title="Score Summary — Each Statement" height={240} theme={theme}>
                <div style={{display:"flex",flexDirection:"column",gap:12,paddingTop:4}}>
                  {likertAvg.map((d,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:10,fontWeight:700,color:theme.text,width:28,textAlign:"right",flexShrink:0, opacity:0.8}}>{d.name}</span>
                      <div style={{flex:1,background:theme.dark?"#334155":"#f8fafc",borderRadius:8,height:8,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:8,width:`${(d.avg/5)*100}%`,
                          background:`linear-gradient(90deg,${PIE_COLORS[i%PIE_COLORS.length]},${PIE_COLORS[(i+1)%PIE_COLORS.length]})`}}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:PIE_COLORS[i%PIE_COLORS.length],
                                    fontFamily:"'JetBrains Mono',monospace",width:28}}>{d.avg}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:4,paddingLeft:38}}>
                    <span style={{fontSize:10,color:theme.muted}}>1 (SD)</span>
                    <span style={{fontSize:10,color:theme.muted}}>3 (Neutral)</span>
                    <span style={{fontSize:10,color:theme.muted}}>5 (SA)</span>
                  </div>
                </div>
              </ChartCard>
            </div>
            {/* Individual heatmap */}
            <div style={{background:theme.card,borderRadius:16,padding:"20px 22px",
                         boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${theme.border}`}}>
              <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",
                          letterSpacing:"0.08em",color:theme.muted,marginBottom:14}}>
                Individual Response Heatmap
              </p>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"separate",borderSpacing:4}}>
                  <thead><tr>
                    <th style={{textAlign:"left",fontSize:11,color:theme.muted,fontWeight:700,padding:"4px 8px"}}>Respondent</th>
                    {LSHORT.map((s,i)=><th key={i} style={{fontSize:11,color:theme.text,fontWeight:700,textAlign:"center",padding:"4px 8px",minWidth:62, opacity:0.8}}>{s}</th>)}
                    <th style={{fontSize:11,color:theme.muted,fontWeight:700,textAlign:"center",padding:"4px 8px"}}>Avg</th>
                  </tr></thead>
                  <tbody>
                    {data.map((r,ri)=>{
                      const scores=LCOLS.map(c=>r[c]);
                      const ra=(scores.reduce((a,b)=>a+(b||0),0)/6).toFixed(1);
                      return (<tr key={ri}>
                        <td style={{fontSize:12,color:theme.text,padding:"6px 8px",fontWeight:600,whiteSpace:"nowrap", opacity:0.9}}>R{ri+1} · {r.bizType||"—"}</td>
                        {scores.map((s,si)=>{
                          const bg=s>=4?`${P.teal}28`:s<=2?`${P.red}28`:`${P.blue}18`;
                          const col=s>=4?P.teal:s<=2?P.red:P.blue;
                          return <td key={si} style={{textAlign:"center",fontSize:14,fontWeight:800,
                            fontFamily:"'JetBrains Mono',monospace",background:bg,color:col,
                            borderRadius:8,padding:"8px 4px"}}>{s||"–"}</td>;
                        })}
                        <td style={{textAlign:"center",fontSize:13,fontWeight:800,color:theme.text,
                                    padding:"8px 4px",fontFamily:"'JetBrains Mono',monospace", opacity:0.9}}>{ra}</td>
                      </tr>);
                    })}
                    <tr>
                      <td style={{fontSize:11,color:theme.muted,padding:"10px 8px",fontWeight:700,borderTop:`2px solid ${theme.border}`}}>AVG</td>
                      {LCOLS.map((c,i)=><td key={i} style={{textAlign:"center",fontSize:13,fontWeight:800,
                        color:PIE_COLORS[i%PIE_COLORS.length],borderTop:`2px solid ${theme.border}`,padding:"10px 4px",
                        fontFamily:"'JetBrains Mono',monospace"}}>{avg(data,c)}</td>)}
                      <td style={{borderTop:`2px solid ${theme.border}`}}/>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ DATA LOG ════ */}
        {tab==="log" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:theme.dark?`${P.blue}15`:`${P.blue}0a`, border:`1px solid ${P.blue}25`, borderRadius:12,
                         padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🔄</span>
              <p style={{fontSize:12,color:theme.text,lineHeight:1.6, opacity:0.8}}>
                {isConfigured
                  ? <>Live data from your Google Sheet. Auto-refreshes every {REFRESH_INTERVAL_MS/1000}s. Last fetched: <strong style={{color:P.blue}}>{lastFetch||"pending…"}</strong></>
                  : <>Demo mode — showing sample data. Paste your published Google Sheet CSV URL into <code style={{background:theme.dark?"#334155":"#f1f5f9",padding:"1px 5px",borderRadius:4,fontSize:11}}>SHEET_CSV_URL</code> to enable live fetching.</>
                }
              </p>
            </div>
            <div style={{background:theme.card,borderRadius:16,padding:"20px 22px",
                         boxShadow: theme.dark ? "none" : "0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${theme.border}`,overflowX:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:theme.muted}}>
                  Live Response Log — {N} entries
                </p>
                <StatusBadge status={status} lastUpdated={lastFetch} nextIn={countdown}/>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1100}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${theme.border}`}}>
                    {["#","Timestamp","Business Type","Role","SKU Size","Inv. Method",
                      "Stockout","Overstock","Lead Time","Safety Stock","Rev. Loss",
                      "Q20","Q21","Q22","Q23","Q24","Q25","Row Avg"].map((h,i)=>(
                      <th key={i} style={{textAlign:"left",padding:"8px 10px",fontSize:10,
                        fontWeight:700,color:theme.muted,textTransform:"uppercase",
                        letterSpacing:"0.05em",whiteSpace:"nowrap",background:theme.dark?"#ffffff05":"#f8fafc"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice().sort((a,b) => {
                    const dateA = new Date(a.ts);
                    const dateB = new Date(b.ts);
                    // Fallback to ID if timestamps are same or invalid
                    if (isNaN(dateA) || isNaN(dateB)) return b.id - a.id;
                    return dateB - dateA;
                  }).map((r,ri)=>{
                    const scores=LCOLS.map(c=>r[c]);
                    const ra=(scores.reduce((a,b)=>a+(+b||0),0)/6).toFixed(1);
                    const cells=[r.id,r.ts,r.bizType,r.role,r.sku,r.invMgmt,
                      r.stockout,r.overstock,r.leadTime,r.safetyStock,r.revLoss,
                      ...scores,ra];
                    return (
                      <tr key={ri} style={{borderBottom:`1px solid ${theme.border}`}}>
                        {cells.map((c,ci)=>(
                          <td key={ci} style={{padding:"9px 10px",whiteSpace:"nowrap",
                            color:ci>10&&ci<17?(+c>=4?P.teal:+c<=2?P.red:P.blue):theme.text,
                            fontWeight:ci>10&&ci<17?800:400,
                            fontFamily:ci>10?"'JetBrains Mono',monospace":undefined}}>
                            {ci===0
                              ? <span style={{background:`${P.blue}20`,color:P.blue,borderRadius:6,
                                  padding:"2px 8px",fontWeight:700}}>R{c}</span>
                              : c??<span style={{color:theme.muted, opacity:0.4}}>—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{marginTop:32,padding:"12px 20px",background:theme.card,borderRadius:12,
                     border:`1px solid ${theme.border}`,textAlign:"center"}}>
          <p style={{fontSize:11,color:theme.muted}}>
            Business Analytics Digital Assignment 2 · March 2026 ·
            {isConfigured
              ? ` Live data · auto-refreshes every ${REFRESH_INTERVAL_MS/1000}s`
              : " Demo mode — connect Google Sheet to enable live data"}
          </p>
        </div>
      </div>
    </div>
  );
}
