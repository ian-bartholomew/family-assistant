# Grocery Price Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that reads a grocery list from Obsidian, scrapes prices from 5 store websites in parallel using Playwright MCP, and appends an optimized price comparison report.

**Architecture:** A plugin with one skill (orchestrator) and one agent (per-store scraper). The skill parses the grocery list, dispatches parallel store-scraper agents via the Agent tool, collects results, runs cost optimization, and appends a markdown report. Playwright MCP provides browser automation via `browser_navigate`, `browser_take_screenshot`, and `browser_snapshot`.

**Tech Stack:** Claude Code plugin system, Playwright MCP (`@playwright/mcp@latest` with `--caps vision`), YAML config, Markdown

---

## File Structure

```
family-assistant/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # Playwright MCP server config
├── CLAUDE.md                    # Plugin-level instructions
├── skills/
│   └── grocery-price-compare/
│       └── SKILL.md             # Main orchestrator skill
├── agents/
│   └── store-scraper.md         # Per-store scraping agent
├── config/
│   └── stores.yaml              # Configurable store list + preferences
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-04-18-grocery-price-compare-design.md
│       └── plans/
│           └── 2026-04-18-grocery-price-compare.md
├── LICENSE
└── README.md
```

---

### Task 1: Plugin Manifest & MCP Configuration

**Files:**

- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`

- [ ] **Step 1: Create the plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "family-assistant",
  "version": "1.0.0",
  "description": "Family productivity plugin — grocery price comparison, meal planning, and more",
  "author": {
    "name": "Ian Bartholomew",
    "email": "ian@ianbartholomew.com"
  },
  "repository": "https://github.com/ian-bartholomew/family-assistant",
  "homepage": "https://github.com/ian-bartholomew/family-assistant",
  "license": "MIT",
  "keywords": [
    "grocery",
    "price-comparison",
    "family",
    "meal-planning",
    "obsidian"
  ]
}
```

- [ ] **Step 2: Create the Playwright MCP server configuration**

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--caps", "vision",
        "--headless"
      ]
    }
  }
}
```

The `--caps vision` flag enables screenshot-based interaction. `--headless` runs without a visible browser window.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json .mcp.json
git commit -m "feat: add plugin manifest and Playwright MCP config"
```

---

### Task 2: Store Configuration

**Files:**

- Create: `config/stores.yaml`

- [ ] **Step 1: Create the store configuration file**

Create `config/stores.yaml`:

```yaml
stores:
  - name: Whole Foods
    url: https://www.wholefoodsmarket.com
    search_url: https://www.wholefoodsmarket.com/search?text={query}
  - name: Vons
    url: https://www.vons.com
    search_url: https://www.vons.com/shop/search-results.html?q={query}
  - name: Sprouts
    url: https://www.sprouts.com
    search_url: https://www.sprouts.com/search/?search_term={query}
  - name: Amazon Fresh
    url: https://www.amazon.com/fresh
    search_url: https://www.amazon.com/s?k={query}&i=amazonfresh
  - name: Costco
    url: https://www.costco.com
    search_url: https://www.costco.com/CatalogSearch?dept=All&keyword={query}

preferences:
  prefer_organic: true
  delivery: true
  zip_code: ""
  consolidation_threshold_dollars: 5

grocery_list:
  vault_path: ~/Documents/Home/Groceries/Grocery lists/Grocery Store
```

- [ ] **Step 2: Commit**

```bash
git add config/stores.yaml
git commit -m "feat: add configurable store list and preferences"
```

---

### Task 3: Store Scraper Agent

**Files:**

- Create: `agents/store-scraper.md`

- [ ] **Step 1: Write the store scraper agent definition**

Create `agents/store-scraper.md`:

````markdown
---
description: "Scrapes grocery prices from a single store website using Playwright MCP. Dispatched by the grocery-price-compare skill — one agent per store, running in parallel."
tools:
  - Bash
  - Read
  - Glob
  - Grep
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_close
---

# Store Scraper Agent

You are a grocery store price scraper. You receive a list of grocery items and a single store's configuration. Your job is to find the price for each item at this store using Playwright MCP browser tools.

## Input

You will be given:
- **Store name** and **search URL template** (with `{query}` placeholder)
- **List of grocery items** to search for
- **Preferences**: whether to prefer organic, etc.

## Process

For each item in the list:

1. **Navigate** to the store's search URL with the item name as the query using `browser_navigate`.
2. **Take a screenshot** of the search results page using `browser_take_screenshot`.
3. **Analyze the screenshot** to find the best matching product:
   - Prefer organic versions if `prefer_organic` is true
   - Look for the closest match to the requested item
   - Extract: product name, price, and product URL
4. **Classify the result**:
   - `found` + `exact_match: true` — the product closely matches what was requested
   - `found` + `exact_match: false` — a substitution was made (explain in notes)
   - `out_of_stock` — the product exists but is marked unavailable/out of stock
   - `not_found` — no relevant results appeared on the page
5. If the screenshot is unclear or shows a cookie/location popup, try clicking through it and re-taking the screenshot.

After all items are searched, try to find the **delivery fee** for this store:
- Navigate to the store's delivery info page or check if it's shown on the search/cart page
- If you can find it, report the exact fee
- If not, report "unknown"

## Output Format

Return your results as a structured text block. Use this exact format:

```
STORE: {store name}
DELIVERY_FEE: {fee as number, or "unknown"}

ITEM: {original item name from the list}
STATUS: {found|substituted|out_of_stock|not_found}
EXACT_MATCH: {true|false}
PRODUCT_NAME: {actual product name from the store}
PRICE: {price as number, e.g. 4.99}
URL: {direct URL to the product page, or the search results URL if no direct link}
NOTES: {explanation of substitution, or why not found, or empty}

ITEM: {next item}
...
```

## Important Rules

- Do NOT make up prices. Every price must come from what you see on the page.
- If a store requires a zip code or location, note this in NOTES and try to proceed with whatever default is shown.
- If the store blocks automated access or shows a CAPTCHA, report all items as `not_found` with a note explaining why.
- Be thorough — scroll down if needed to find the best match.
- Prefer organic products when the preference is set, but if organic is unavailable, find the conventional version and mark it as a substitution.
````

- [ ] **Step 2: Commit**

```bash
git add agents/store-scraper.md
git commit -m "feat: add store-scraper agent for parallel price scraping"
```

---

### Task 4: Main Orchestrator Skill

**Files:**

- Create: `skills/grocery-price-compare/SKILL.md`

- [ ] **Step 1: Write the main orchestrator skill**

Create `skills/grocery-price-compare/SKILL.md`:

````markdown
---
name: Grocery Price Compare
description: "Compare grocery prices across multiple stores. Use when the user asks to compare grocery prices, find the cheapest groceries, check grocery prices, or run a price comparison on their grocery list."
version: 1.0.0
---

# Grocery Price Compare

Compare prices for unchecked grocery list items across multiple stores, find the cheapest fulfillment strategy, and append a report to the grocery list.

## Step 1: Read the Grocery List

Find the latest grocery list file:

1. Read the config file at `${CLAUDE_PLUGIN_ROOT}/config/stores.yaml` to get the `grocery_list.vault_path`.
2. Use Glob to find all `.md` files under the vault path: `**/*.md`
3. Sort by the date in the filename (format: `Grocery List - YYYY-MM-DD.md`) and pick the most recent.
4. Read the file and extract only unchecked items — lines matching `- [ ] ` (with content after the checkbox).
5. Strip the `- [ ] ` prefix to get the plain item names.

If there are no unchecked items, tell the user and stop.

## Step 2: Load Store Configuration

Read `${CLAUDE_PLUGIN_ROOT}/config/stores.yaml` and parse:
- The list of stores (each with `name` and `search_url`)
- Preferences (`prefer_organic`, `delivery`, `zip_code`)

## Step 3: Dispatch Store Scraper Agents

For each store in the config, launch a `store-scraper` agent using the Agent tool. **Dispatch all agents in parallel** (all Agent tool calls in a single message).

Each agent prompt must include:
- The store name and search URL template
- The full list of unchecked grocery items
- The preferences (organic, etc.)
- Instructions to return results in the structured format defined in the agent

Example prompt for one agent:

```
You are scraping prices from Whole Foods.

Store: Whole Foods
Search URL template: https://www.wholefoodsmarket.com/search?text={query}

Preferences:
- Prefer organic: yes

Items to search for:
1. butter
2. Organic strawberries
3. Fresh blueberries
4. 2 dozen eggs
5. English muffins

Search for each item, take a screenshot of the results, extract the best matching product name, price, and URL. Prefer organic products. Return results in the structured format from your instructions.
```

## Step 4: Parse Agent Results

Collect the structured text output from each agent. Parse each block into structured data:

For each store, build a list of items with:
- `item`: original item name
- `status`: found / substituted / out_of_stock / not_found
- `exact_match`: true / false
- `product_name`: what the store calls it
- `price`: numeric price
- `url`: link to the product
- `notes`: any explanation

Also capture each store's `delivery_fee` (numeric or "unknown").

## Step 5: Optimize Fulfillment Strategies

Generate multiple fulfillment options ranked by total cost (item prices + delivery fees):

**Algorithm:**

1. For each item, collect all stores where `status` is `found` or `substituted`, with their prices.
2. **Cheapest overall:** For each item, pick the cheapest store. Sum item prices + delivery fees for each unique store used. This may use 1 to N stores.
3. **Best single-store:** For each store that has all (or most) items available, calculate total = sum of item prices + delivery fee. Pick the cheapest single store. Note any missing items.
4. **Intermediate splits:** Try all 2-store combinations, 3-store combinations, etc. For each combination, assign each item to the cheapest store in that subset. Calculate total = item prices + delivery fees for stores used. Keep any combination that is cheaper than the best single-store option.
5. **Rank** all options by total cost (ascending). Always include at least the cheapest overall and the best single-store. Include intermediate splits that represent meaningful savings breakpoints.

If a store's delivery fee is "unknown", note it in the report and exclude it from the total (with a warning).

## Step 6: Generate and Append Report

Build the markdown report and append it to the original grocery list file.

**Report structure:**

```markdown
---
## Price Comparison Report — {YYYY-MM-DD HH:MM}

### Option {N}: {Label} (${total}) — {Store1} + {Store2}

#### {Store1} — ${subtotal} (incl. ${delivery} delivery)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
| {item} | {product_name} | ${price} | [link]({url}) | {notes} |
| *Delivery* | | ${fee} | | |

#### {Store2} — ${subtotal} (incl. ${delivery} delivery)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
...

### Items Not Found
| Item | Store | Notes |
|------|-------|-------|
| {item} | {store} | Store does not carry this item |

### Out of Stock
| Item | Store | Notes |
|------|-------|-------|
| {item} | {store} | Currently out of stock |

### Substitutions Made
| Item | Store | Substituted With | Notes |
|------|-------|-----------------|-------|
| {item} | {store} | {substituted_product} | {reason} |
```

Use the Edit tool to append the report after the last line of the grocery list file (after a `---` separator).

## Step 7: Print Terminal Summary

Print a concise summary to the terminal:
- Number of items compared across N stores
- Each option with total cost and store names
- Any items that couldn't be found at any store
- Any notable substitutions

Example:
```
Compared 5 items across 5 stores.

Option 1: Cheapest Overall — $32.47 (Sprouts + Costco)
Option 2: 2-Store Split — $34.12 (Whole Foods + Costco)
Option 3: Best Single Store — $38.94 (Sprouts)

⚠ English muffins not found at Costco
⚠ Blueberries substituted at Amazon Fresh (conventional, organic unavailable)

Full report appended to: Grocery List - 2026-04-18.md
```
````

- [ ] **Step 2: Commit**

```bash
git add skills/grocery-price-compare/SKILL.md
git commit -m "feat: add grocery-price-compare orchestrator skill"
```

---

### Task 5: Plugin CLAUDE.md

**Files:**

- Create: `CLAUDE.md`

- [ ] **Step 1: Write the plugin CLAUDE.md**

Create `CLAUDE.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add plugin CLAUDE.md with usage instructions"
```

---

### Task 6: Install Plugin via Marketplace

**Files:**

- Modify: `~/.claude/plugins/known_marketplaces.json` (via CLI)

- [ ] **Step 1: Push the repo to GitHub**

Ensure all changes are pushed:

```bash
git push origin main
```

- [ ] **Step 2: Register the repo as a marketplace**

```bash
claude plugin add-marketplace github:ian-bartholomew/family-assistant
```

If that command doesn't exist, manually register by adding to `~/.claude/plugins/known_marketplaces.json`:

```json
"ian-bartholomew-family-assistant": {
  "source": {
    "source": "github",
    "repo": "ian-bartholomew/family-assistant"
  },
  "installLocation": "/Users/ian.bartholomew/.claude/plugins/marketplaces/ian-bartholomew-family-assistant",
  "lastUpdated": "2026-04-18T00:00:00.000Z",
  "autoUpdate": true
}
```

- [ ] **Step 3: Install the plugin**

```bash
claude plugin install family-assistant
```

Or install via `--plugin-dir` for local development:

```bash
claude --plugin-dir /Users/ian.bartholomew/Dev/family-assistant
```

- [ ] **Step 4: Verify the plugin loads**

Start a new Claude Code session and check:

- The `grocery-price-compare` skill appears in the available skills list
- The Playwright MCP server starts (check for `playwright` in MCP server list)
- The `store-scraper` agent is available

- [ ] **Step 5: Commit any install-related changes**

If any config files were modified during installation, commit them.

---

### Task 7: End-to-End Test

- [ ] **Step 1: Verify grocery list parsing**

In a new Claude Code session with the plugin loaded, invoke the skill by saying "compare grocery prices" or similar. Verify it:

- Finds the latest grocery list (`Grocery List - 2026-04-18.md`)
- Correctly identifies the 5 unchecked items: butter, Organic strawberries, Fresh blueberries, 2 dozen eggs, English muffins
- Skips all checked items

- [ ] **Step 2: Verify parallel agent dispatch**

Confirm that 5 store-scraper agents are dispatched in parallel (one per store). Each should:

- Navigate to the store's search page
- Take screenshots
- Return structured results

- [ ] **Step 3: Verify report generation**

Check that the report is:

- Appended to the original grocery list file after a `---` separator
- Contains at least 2 fulfillment options with per-store tables
- Includes Items Not Found, Out of Stock, and Substitutions sections
- Contains working links to products
- Shows delivery fees per store

- [ ] **Step 4: Verify terminal output**

Confirm the terminal shows a concise summary with option totals and any warnings.

- [ ] **Step 5: Fix any issues found during testing**

Address any scraping failures, parsing bugs, or formatting issues discovered. Common issues:

- Stores showing cookie consent / location popups blocking search results
- Search URL format not returning results (adjust `search_url` in config)
- Price extraction from screenshots being inaccurate
- Delivery fee not findable on public pages

Commit fixes as they're made.
