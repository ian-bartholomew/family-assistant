# Grocery Price Comparison — Design Spec

## Overview

A Claude Code plugin skill that reads the latest grocery list from an Obsidian vault, dispatches parallel agents to scrape prices from multiple grocery store websites using Playwright MCP, optimizes for cheapest fulfillment across the fewest stores (factoring in delivery fees), and appends a structured report to the original grocery list.

## Grocery List Source

- **Location:** `~/Documents/Home/Groceries/Grocery lists/Grocery Store/YYYY/MM/Grocery List - YYYY-MM-DD.md`
- **Format:** Markdown with YAML frontmatter (`tags:grocery`), followed by checkbox items
- **Parsing rule:** Only process unchecked items (`- [ ] ...`). Ignore checked items (`- [x] ...`).
- Items are freeform text — may include quantities (e.g., "2 dozen eggs"), descriptors (e.g., "Organic strawberries"), or informal names (e.g., "Lulu snack")
- The skill finds the latest list by sorting filenames by date

## Plugin Structure

```
family-assistant/
├── plugin.json
├── CLAUDE.md
├── skills/
│   └── grocery-price-compare.md
├── agents/
│   └── store-scraper.md
├── config/
│   └── stores.yaml
└── docs/
    └── superpowers/
        └── specs/
```

## Configuration — `config/stores.yaml`

```yaml
stores:
  - name: Whole Foods
    url: https://www.wholefoodsmarket.com
    search_path: /search?text=
  - name: Vons
    url: https://www.vons.com
    search_path: /shop/search-results.html?q=
  - name: Sprouts
    url: https://www.sprouts.com
    search_path: /search/?search_term=
  - name: Amazon Fresh
    url: https://www.amazon.com/fresh
    search_path: /s?k=
  - name: Costco
    url: https://www.costco.com
    search_path: /s?keyword=

preferences:
  prefer_organic: true
  delivery: true
  zip_code: ""
  consolidation_threshold_dollars: 5
```

Users add/remove stores by editing this file. Search paths will be validated during implementation.

## Data Flow

### 1. Main Skill (`grocery-price-compare.md`)

Orchestrates the entire flow:

1. **Read grocery list** — Find the latest `.md` file in the Grocery Store folder by date in filename. Parse out unchecked `- [ ]` items.
2. **Load config** — Read `stores.yaml` for store list and preferences.
3. **Dispatch store agents** — Launch one `store-scraper` agent per configured store, all in parallel. Each agent receives the full item list, its store config, and preferences.
4. **Collect results** — Gather structured results from all agents.
5. **Optimize** — Calculate fulfillment strategies (see Optimization section).
6. **Generate report** — Format as markdown, append to the original grocery list file after a `---` separator.
7. **Print terminal summary** — Show key findings in the terminal.

### 2. Store Scraper Agent (`store-scraper.md`)

Each agent is responsible for one store:

- **Input:** Item list, store name, store URL, search path, preferences
- **Process per item:**
  1. Navigate to store search URL with item as query
  2. Take a screenshot of the results page via Playwright MCP
  3. Analyze screenshot to find best matching product (prefer organic per config)
  4. Extract: product name, price, product URL
  5. Classify result: exact match, substitution, out of stock, or not found
- **Output per item:**

  ```
  item: "Organic strawberries"
  status: found | substituted | out_of_stock | not_found
  exact_match: true | false
  product_name: "Organic Strawberries 1lb"
  price: 4.99
  url: "https://..."
  notes: "Substituted: conventional strawberries (organic unavailable)"
  ```

- **Output store-level:** delivery fee (scraped from site or "unknown")

### Result Classification

- **found + exact_match:** Direct match for the requested item
- **found + !exact_match (substitution):** Close match used — reported in Substitutions table with explanation
- **out_of_stock:** Item exists in store catalog but currently unavailable
- **not_found:** Store does not carry this item at all (no relevant search results)

## Optimization

Present multiple fulfillment strategies ranked by total cost (items + delivery fees per store used):

1. **Cheapest overall** — Optimal split across however many stores minimizes total cost. May use 1 store or all 5.
2. **Best single-store** — Cheapest option using just one store.
3. **Intermediate splits** — Any 2-store, 3-store, etc. split that represents a meaningful cost breakpoint between cheapest overall and single-store.

Always show at least 2 options. Include more when intermediate splits offer meaningful savings.

Delivery fees are included in every option's total. If a store's delivery fee is unknown, note it in the report.

## Report Format

Appended to the grocery list file after a `---` separator:

```markdown
---
## Price Comparison Report — YYYY-MM-DD HH:MM

### Option 1: Cheapest Overall ($32.47) — Sprouts + Costco

#### Sprouts — $18.96 (incl. $5.99 delivery)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
| Organic strawberries | Organic Strawberries 1lb | $3.99 | [link](url) | |
| Fresh blueberries | Organic Blueberries 6oz | $4.49 | [link](url) | |
| English muffins | Organic English Muffins 6ct | $4.49 | [link](url) | |
| *Delivery* | | $5.99 | | |

#### Costco — $13.51 (incl. $3.99 delivery)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
| butter | Kirkland Organic Butter 2pk | $7.99 | [link](url) | |
| 2 dozen eggs | Kirkland Organic Eggs 24ct | $8.99 | [link](url) | |
| *Delivery* | | $3.99 | | |

### Option 2: Best Single Store ($38.94) — Sprouts

#### Sprouts — $38.94 (incl. $5.99 delivery)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
| butter | Organic Valley Butter | $6.49 | [link](url) | |
| Organic strawberries | Organic Strawberries 1lb | $3.99 | [link](url) | |
| ... | | | | |
| *Delivery* | | $5.99 | | |

### Items Not Found
| Item | Store | Notes |
|------|-------|-------|
| English muffins | Costco | Store does not carry this item |

### Out of Stock
| Item | Store | Notes |
|------|-------|-------|
| Organic strawberries | Amazon Fresh | Currently out of stock |

### Substitutions Made
| Item | Store | Substituted With | Notes |
|------|-------|-----------------|-------|
| Fresh blueberries | Amazon Fresh | Conventional Blueberries 6oz | Organic unavailable |
```

Each option has:

- A header with total cost and store names
- One table per store with subtotal including delivery
- Delivery fee as the last row in each store table

Terminal output mirrors this but as a concise summary (totals per option, key callouts).

## Technical Details

- **Playwright MCP** is used for all web scraping — navigate, screenshot, extract
- **Screenshot analysis** — the agent uses vision capabilities to read prices/product names from screenshots
- **No login required** (v1) — public/guest prices only. Login support is a future enhancement.
- **Parallel execution** — all store agents run concurrently via Claude Code's Agent tool
- **Plugin installation** — installed via the FBG marketplace for discoverability

## Future Enhancements

- Store account login for member pricing and accurate delivery fees
- Price history tracking over time
- Coupon/sale detection
- Quantity-aware pricing (unit price comparison)
