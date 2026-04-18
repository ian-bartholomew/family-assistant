# Family Assistant Plugin

A Claude Code plugin for family productivity tools.

## Grocery Price Compare

The `grocery-price-compare` skill compares prices across grocery stores using Playwright MCP for web scraping.

### How It Works

1. Reads the latest grocery list from the Obsidian vault
2. Dispatches parallel store-scraper agents (one per store)
3. Each agent uses Playwright to search, screenshot, and extract prices
4. Optimizes for cheapest fulfillment across fewest stores
5. Appends a price comparison report to the grocery list

### Configuration

Edit `config/stores.yaml` to:

- Add or remove stores
- Change preferences (organic, delivery)
- Set your zip code for location-specific pricing
- Set the path to your Obsidian grocery list vault

### Requirements

- Playwright MCP is configured in `.mcp.json` and starts automatically
- Node.js 18+ (for npx to run @playwright/mcp)

### Notes

- Prices are scraped from public/guest views (no store login)
- Delivery fees may be approximate or unknown for some stores
- The skill prefers organic products by default (configurable)
