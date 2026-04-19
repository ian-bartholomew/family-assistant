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
4. Read the file and extract only unchecked items — lines matching `- [ ]` (with content after the checkbox).
5. Strip the `- [ ]` prefix to get the plain item names.

If there are no unchecked items, tell the user and stop.

## Step 2: Load Store Configuration

Read `${CLAUDE_PLUGIN_ROOT}/config/stores.yaml` and parse:

- The list of stores (each with `name`, `search_url`, optional `delivery_fee`, and `tip_percent`)
- Preferences (`prefer_organic`, `delivery`, `zip_code`, `default_tip_percent`)

## Step 3: Dispatch Store Scraper Agents

For each store AND each item, launch a separate `store-scraper` agent using the Agent tool. **Dispatch ALL agents in parallel** (all Agent tool calls in a single message). This means if there are 5 stores and 5 items, you dispatch 25 agents simultaneously.

Each agent prompt must include:

- The store name and search URL template
- A **single** grocery item to search for
- The preferences (organic, etc.)
- Instructions to return results in the structured format defined in the agent

Example prompts (all dispatched in one message):

```
You are scraping a price from Whole Foods.

Store: Whole Foods
Search URL template: https://www.wholefoodsmarket.com/search?text={query}

Preferences:
- Prefer organic: yes

Item to search for: butter

Search for this item, take a screenshot of the results, extract the best matching product name, price, and URL. Prefer organic products. Also note the delivery fee if visible. Return results in the structured format from your instructions.
```

```
You are scraping a price from Whole Foods.

Store: Whole Foods
Search URL template: https://www.wholefoodsmarket.com/search?text={query}

Preferences:
- Prefer organic: yes

Item to search for: Organic strawberries

Search for this item, take a screenshot of the results, extract the best matching product name, price, and URL. Prefer organic products. Also note the delivery fee if visible. Return results in the structured format from your instructions.
```

...and so on for every store + item combination.

## Step 4: Parse Agent Results

Collect the structured text output from each agent. Each agent returns a single item result for a single store. Parse and group by store:

For each store, build a list of items with:

- `item`: original item name
- `status`: found / substituted / out_of_stock / not_found
- `exact_match`: true / false
- `product_name`: what the store calls it
- `price`: numeric price
- `url`: link to the product
- `notes`: any explanation

For each store's `delivery_fee`, use the first non-"unknown" value reported by any of that store's agents (since all agents for the same store see the same delivery fee). If all report "unknown", use "unknown".

## Step 5: Optimize Fulfillment Strategies

Generate multiple fulfillment options ranked by total cost (item prices + delivery fee + tip per store):

**Cost calculation per store:**

- **Item subtotal** = sum of item prices at that store
- **Delivery fee** = use `delivery_fee` from config if set (e.g., 0 for Prime stores), otherwise use the fee scraped by agents, otherwise "unknown"
- **Tip** = if store has `tip_flat`, use that fixed amount; otherwise item subtotal * (`tip_percent` from store config, or `default_tip_percent` from preferences) / 100
- **Store total** = item subtotal + delivery fee + tip

**Algorithm:**

1. For each item, collect all stores where `status` is `found` or `substituted`, with their prices.
2. **Cheapest overall:** For each item, pick the cheapest store. Sum store totals (items + delivery + tip) for each unique store used. This may use 1 to N stores.
3. **Best single-store:** For each store that has all (or most) items available, calculate store total. Pick the cheapest single store. Note any missing items.
4. **Intermediate splits:** Try all 2-store combinations, 3-store combinations, etc. For each combination, assign each item to the cheapest store in that subset. Calculate total across all stores used. Keep any combination that is cheaper than the best single-store option.
5. **Rank** all options by total cost (ascending). Always include at least the cheapest overall and the best single-store. Include intermediate splits that represent meaningful savings breakpoints.

If a store's delivery fee is "unknown", note it in the report and exclude it from the total (with a warning).

## Step 6: Generate and Append Report

Build the markdown report and append it to the original grocery list file.

**Report structure:**

```markdown
---
## Price Comparison Report — {YYYY-MM-DD HH:MM}

### Option {N}: {Label} (${total}) — {Store1} + {Store2}

#### {Store1} — ${store_total} (items ${item_subtotal} + ${delivery} delivery + ${tip} tip)
| Item | Product | Price | Link | Notes |
|------|---------|-------|------|-------|
| {item} | {product_name} | ${price} | [link]({url}) | {notes} |
| *Delivery* | | ${fee} | | |
| *Tip ({tip_percent}%)* | | ${tip} | | |

#### {Store2} — ${store_total} (items ${item_subtotal} + ${delivery} delivery + ${tip} tip)
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
