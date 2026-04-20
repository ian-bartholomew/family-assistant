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

- The list of stores (each with `name`, `search_url`, optional `delivery_fee`, and `tip_flat` or `tip_percent`)
- Preferences (`prefer_organic`, `delivery`, `zip_code`, `default_tip_percent`)

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

## Step 4: Parse Agent Results and Log Errors

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

**Error handling:** If any agent fails, times out, returns unparseable output, or encounters an error (CAPTCHA, blocked, crash, etc.):

1. **Do not fail the entire run.** Continue with results from agents that succeeded.
2. **Log the error** to a file in the same directory as the grocery list, named `errors-YYYY-MM-DD.md`. Create or append to this file.
3. **Error log format:**

```markdown
# Grocery Price Compare — Error Log — {YYYY-MM-DD HH:MM}

## {Store Name}
- **Error type:** {agent_failed | timeout | unparseable_output | blocked | other}
- **Items affected:** {list of items that could not be scraped}
- **Details:** {error message or description of what went wrong}
- **Agent output (if any):**
```

{raw agent output}

```
```

1. Treat errored items as `not_found` for that store in the optimization step, with a note referencing the error log.
2. Mention the error log path in the terminal summary if any errors occurred.

## Step 5: Optimize Fulfillment Strategies

**IMPORTANT: Do NOT write or run any scripts (Python, JavaScript, bash, etc.) for this step. Do all calculations using your own reasoning. The item counts are small enough to work through manually.**

Generate multiple fulfillment options ranked by total cost (item prices + delivery fee + tip per store):

**Cost calculation per store:**

- **Item subtotal** = sum of item prices at that store
- **Delivery fee** = use `delivery_fee` from config if set (e.g., 0 for Prime stores), otherwise use the fee scraped by agents, otherwise "unknown"
- **Tip** = if store has `tip_flat`, use that fixed amount; otherwise item subtotal * (`tip_percent` from store config, or `default_tip_percent` from preferences) / 100
- **Store total** = item subtotal + delivery fee + tip

**Work through it step by step:**

1. First, build a simple price table in your response — for each item, list the price at each store (or "N/A" if not found/out of stock).
2. **Best single-store:** For each store, add up all available item prices + that store's delivery fee + tip. Pick the cheapest. Note any missing items.
3. **Cheapest overall:** For each item, identify which store has the lowest price. Group items by their cheapest store. Add up item prices + delivery fee + tip for each store used.
4. **Check 2-store splits:** If the cheapest overall uses 3+ stores, check whether consolidating to just 2 stores saves on delivery/tip costs while still being cheaper than single-store. Only include if it's a meaningful savings breakpoint.
5. **Rank** all options by total cost (ascending). Always include at least the cheapest overall and the best single-store.

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
| *Tip ({tip_percent}% or flat)* | | ${tip} | | |

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
