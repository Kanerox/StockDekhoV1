# StockDekho

StockDekho is an investment research platform designed to reduce the time and friction involved in researching Indian listed companies.

It brings market data, company information, sector performance, news, historical charts and research tools into one unified interface.

**Built to simplify investment research • For research purposes only • Not investment advice.**

## Live Website

## 🌐 Live Website

**https://stockdekhoapp.vercel.app**

StockDekho is publicly available and can be accessed directly from the link above.

## Why StockDekho?

Investment research often requires investors to move between multiple websites, news platforms, spreadsheets and financial databases.

StockDekho was created to bring the most useful parts of that workflow together in one place, making it easier to:

- understand current market conditions;
- research individual companies;
- compare businesses;
- follow sector leadership;
- track market-moving news;
- maintain a watchlist and personal notes.

## Features

### Markets Dashboard

- Live Indian market indices
- Nifty 50 market breadth
- Market-moving news
- Sector performance heatmap
- Best and worst performers
- Most active companies by estimated traded value
- Historical Nifty 50 chart
- Historical USD/INR chart

### Company Research

- Live company prices and daily movements
- Historical performance charts
- Company overview and business segments
- Financial statements
- Valuation and quality metrics
- Company events and reports
- Peer comparison

### Research Tools

- Company search
- Watchlist
- Company comparison
- Personal notes
- Sector research pages
- Currency dashboard

## Technology Stack

### Frontend

- React
- Vite
- Axios
- Recharts
- Lucide React

### Backend

- Node.js
- Express
- Yahoo Finance market data
- Google News and financial-news feeds

### Deployment

- Frontend: Vercel
- Backend: Render
- Source control: GitHub

## Project Structure

```text
StockDekho/
├── backend/
│   ├── clients/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   └── server.js
├── frontend/
│   ├── public/
│   └── src/
│       ├── api/
│       ├── assets/
│       ├── components/
│       └── App.jsx
├── prototype/
├── CHANGELOG.md
├── README.md
└── .gitignore