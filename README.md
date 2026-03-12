# Business Analytics Project: Inventory Management & Predictive Analytics

This project analyzes survey data to understand trends in inventory management, forecasting accuracy, and the perception of predictive analytics within various business sectors. It includes a complete pipeline from raw data cleaning to statistical visualization and an interactive dashboard.

## 📁 Project Structure

```text
Business-Analytics-Project/
├── backend/                # Python Analysis Engine
│   ├── analysis.py         # Main analysis and chart generation script
│   └── charts/             # Output directory for 21+ generated PNG charts
├── data/                   # Data Management
│   ├── preprocessing.py    # Data cleaning and normalization script
│   ├── survey_responses.csv         # Raw survey data
│   └── survey_responses_cleaned.csv # Processed data for analysis
├── frontend/               # Interactive Dashboard (React + Vite)
│   ├── src/                # React components (LiveDashboard.jsx, etc.)
│   └── package.json        # Frontend dependencies
└── README.md               # Project documentation
```

## 🚀 Getting Started

### Prerequisites

- **Python 3.8+**: For data processing and analysis.
- **Node.js & npm**: For running the interactive dashboard.

### 1. Data Processing & Analysis

Install the Python dependencies:
```bash
pip install -r requirements.txt
```

Run the preprocessing script to clean the raw data:
```bash
python data/preprocessing.py
```

Run the analysis script to generate 21 detailed analytical charts:
```bash
python backend/analysis.py
```
*Charts will be saved inside the `backend/charts/` directory.*

### 2. Running the Dashboard

Navigate to the `frontend` directory and install dependencies:
```bash
cd frontend
npm install
```

Start the development server:
```bash
npm run dev
```

## 📊 Key Features

- **Automated Data Cleaning**: `preprocessing.py` handles column mapping, normalization of business types, and multi-select dummy variable generation.
- **Statistical Analysis**: `analysis.py` performs Chi-Square tests, Pearson correlations, and generates a wide array of charts (Pareto, Radar, Diverging Likert, etc.).
- **Visual Insights**: Over 20+ auto-generated charts covering lead times, revenue loss, demand predictability, and more.
- **Live Dashboard**: A modern React-based interface for exploring findings in real-time.

## 🛠️ Configuration

The Python scripts use robust absolute pathing relative to their locations. This means you can execute them from the project root or their respective folders without any path errors.
