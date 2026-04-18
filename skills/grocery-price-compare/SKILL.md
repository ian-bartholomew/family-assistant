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
