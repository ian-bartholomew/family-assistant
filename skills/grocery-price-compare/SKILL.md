---
name: Grocery Price Compare
description: "Compare grocery prices across multiple stores. Use when the user asks to compare grocery prices, find the cheapest groceries, check grocery prices, or run a price comparison on their grocery list."
version: 1.0.0
---

# Grocery Price Compare

Compare prices for unchecked grocery list items across multiple stores, find the cheapest fulfillment strategy, and append a report to the grocery list.

**Screenshot management:** All Playwright screenshots during this run should be saved to `{vault_path}/screenshots/`. Use the `obsidian:obsidian-cli` skill to create the folder. Tell each agent to save screenshots there with descriptive names (e.g., `vons-butter.png`). After the report is generated and appended, delete the screenshots folder using Bash (`rm -rf {vault_path}/screenshots/`).

**Run logging:** Every run writes a detailed log to `{vault_path}/logs/run-YYYY-MM-DD-HHMMSS.md`. Use the `obsidian-cli` skill to create notes in the vault (this ensures proper Obsidian integration). This log is designed to be reviewed later to improve the skill — it captures what worked, what didn't, and why.

**Script violation tracking:** If at any point during the run — in any step or any agent — a script is generated or executed (Python, JavaScript, bash code beyond simple `rm -rf` cleanup), this is a violation. Track it and log it in the "Script Violations" section of the run log. If the user had to deny a script permission prompt, note that too. This is the highest priority improvement item.

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

- The list of stores (each with `name`, `search_url`, `playwright_instance`, optional `delivery_fee`, `service_fee_percent`, and `tip_flat` or `tip_percent`)
- Preferences (`prefer_organic`, `delivery`, `zip_code`, `default_tip_percent`)

## Step 3: Pre-flight Check

Before dispatching agents, verify that each store's Playwright instance is available:

1. For each store in the config, use `ToolSearch` to check for its Playwright tools:

   ```
   ToolSearch("+plugin_family-assistant_playwright-{N} navigate")
   ```

   where `{N}` is the store's `playwright_instance` number.
2. If a Playwright instance is **not found**, warn the user: "Playwright instance {N} for {store name} is not available. Skipping this store."
3. Remove unavailable stores from the dispatch list — do not send an agent that will fail.
4. If **no** Playwright instances are available, tell the user and stop.
5. Log all pre-flight results (available and missing) in the run log.

## Step 4: Dispatch Store Scraper Agents

For each store in the config, launch a `store-scraper` agent using the Agent tool. **Dispatch all agents in parallel** (all Agent tool calls in a single message).

Each store has a `playwright_instance` number (1-7) that maps to a dedicated Playwright MCP server. Each instance is a separate headless, isolated browser — no navigation conflicts between agents.

Each agent prompt must include:

- The **Playwright instance number** from the store config
- The store name and search URL template
- The full list of unchecked grocery items
- The preferences (organic, etc.)
- Instructions to return results in the structured format defined in the agent

Example prompt for one agent:

```
You are scraping prices from Vons via Instacart.

**Playwright instance: 1** — Use ONLY mcp__plugin_family-assistant_playwright-1__browser_* tools.

Store: Vons
Search URL template: https://www.instacart.com/store/vons/search?q={query}

Preferences:
- Prefer organic: yes

Items to search for:
1. butter
2. Organic strawberries
3. Fresh blueberries
4. 2 dozen eggs
5. English muffins

Screenshots folder: {vault_path}/screenshots/

IMPORTANT: Do NOT write or run any scripts. Use only Playwright MCP tools and your own reasoning.

Search for each item, take a screenshot of the results (save to the screenshots folder as {store-slug}-{item-slug}.png), extract the best matching product name, price, size, unit price, and URL. Prefer organic products. Return results in the structured format from your instructions.
```

## Step 5: Parse Agent Results and Log Errors

Collect the structured text output from each agent. Parse each block into structured data:

For each store, build a list of items with:

- `item`: original item name
- `status`: found / substituted / out_of_stock / not_found
- `exact_match`: true / false
- `product_name`: what the store calls it
- `price`: numeric price
- `size`: package size (e.g., "8 oz", "1 lb", "24 ct")
- `unit_price`: price per standard unit (per oz, per ct, etc.)
- `url`: link to the product
- `notes`: any explanation

Also capture each store's `delivery_fee` (numeric or "unknown").

**Error handling:** If any agent fails, times out, returns unparseable output, or encounters an error (CAPTCHA, blocked, crash, etc.):

1. **Do not fail the entire run.** Continue with results from agents that succeeded.
2. Treat errored items as `not_found` for that store in the optimization step.
3. All errors are captured in the run log (see Step 9).

## Step 6: Optimize Fulfillment Strategies

**IMPORTANT: Do NOT write or run any scripts (Python, JavaScript, bash, etc.) for this step. Do all calculations using your own reasoning. The item counts are small enough to work through manually.**

Generate multiple fulfillment options ranked by total cost (item prices + delivery fee + tip per store):

**Cost calculation per store:**

- **Item subtotal** = sum of item prices at that store
- **Service fee** = item subtotal * (`service_fee_percent` from store config) / 100. If not set, 0.
- **Delivery fee** = use `delivery_fee` from config if set (e.g., 0 for Prime stores like Whole Foods and Amazon Fresh — these NEVER have delivery fees), otherwise use the fee scraped by agents, otherwise "unknown"
- **Tip** = if store has `tip_flat`, use that fixed dollar amount (e.g., Whole Foods and Amazon Fresh always $10 tip), otherwise item subtotal * (`tip_percent` from store config, or `default_tip_percent` from preferences) / 100
- **Store total** = item subtotal + service fee + delivery fee + tip

**Work through it step by step:**

1. First, build a price comparison table in your response — for each item, list the price, size, and unit price at each store (or "N/A" if not found/out of stock).
2. **Best single-store:** For each store, add up all available item prices + that store's delivery fee + tip. Pick the cheapest. Note any missing items.
3. **Cheapest overall:** For each item, identify which store has the **lowest unit price** (not just lowest sticker price). A larger package at a lower per-unit cost is the better deal. Group items by their cheapest store. Add up item prices + delivery fee + tip for each store used.
4. **Check 2-store splits:** If the cheapest overall uses 3+ stores, check whether consolidating to just 2 stores saves on delivery/tip costs while still being cheaper than single-store. Only include if it's a meaningful savings breakpoint.
5. **Rank** all options by total cost (ascending). Always include at least the cheapest overall and the best single-store.

If a store's delivery fee is "unknown", note it in the report and exclude it from the total (with a warning).

## Step 7: Generate and Append Report

Build the markdown report and append it to the original grocery list file.

**Report structure:**

```markdown
---
## Price Comparison Report — {YYYY-MM-DD HH:MM}

### Price Comparison Table

This table shows every item across all stores for easy comparison. The **best unit price** for each item is marked with ✓.

| Item | Vons | Sprouts | Costco | Whole Foods | Amazon Fresh |
|------|------|---------|--------|-------------|--------------|
| {item} | {product} {size} ${price} (${unit_price}/oz) | ... | ... | ... | ... |
| | | | | | |

For each cell: show product name, size, price, and unit price. Use "N/A" if not found, "OOS" if out of stock, or "SUB: {product}" if substituted. Mark the best unit price per row with ✓.

### Option {N}: {Label} (${total}) — {Store1} + {Store2}

#### {Store1} — ${store_total} (items ${item_subtotal} + ${service_fee} service fee + ${delivery} delivery + ${tip} tip)
| Item | Product | Size | Price | Unit Price | Link | Notes |
|------|---------|------|-------|------------|------|-------|
| {item} | {product_name} | {size} | ${price} | ${unit_price}/oz | [link]({url}) | {notes — include "SUBSTITUTED" or "OUT OF STOCK" here if applicable} |
| *Service Fee ({service_fee_percent}%)* | | | ${service_fee} | | | |
| *Delivery* | | | ${fee} | | | |
| *Tip ({tip_percent}% or flat)* | | | ${tip} | | | |

#### {Store2} — ${store_total} (items ${item_subtotal} + ${service_fee} service fee + ${delivery} delivery + ${tip} tip)
| Item | Product | Size | Price | Unit Price | Link | Notes |
|------|---------|------|-------|------------|------|-------|
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

## Step 8: Print Terminal Summary

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

## Step 9: Write Run Log and Cleanup

Write the run log to `{vault_path}/logs/run-YYYY-MM-DD-HHMMSS.md`. This log is intended to be reviewed later to improve the skill, agent, and store config. Use the `obsidian:obsidian-cli` skill to create the note in the vault.

**Run log format:**

```markdown
# Grocery Price Compare — Run Log — {YYYY-MM-DD HH:MM}

## Run Summary
- **Grocery list:** {filename}
- **Items searched:** {count}
- **Stores scraped:** {list of store names}
- **Total run time:** {approximate duration}
- **Outcome:** {success | partial success | failed}

## Items Searched
{list of unchecked items from the grocery list}

## Per-Store Results

### {Store Name} (playwright-{N})
- **Status:** {success | partial | failed}
- **Items found:** {count} / {total}
- **Items substituted:** {count} — {list with reasons}
- **Items not found:** {count} — {list}
- **Items out of stock:** {count} — {list}
- **Delivery fee:** {amount or "unknown"}
- **Raw agent output:**
```

{full structured output from the agent}

```

### {Next Store}
...

## Errors
{If any agents failed, timed out, or returned unparseable output:}

### {Store Name}
- **Error type:** {agent_failed | timeout | unparseable_output | blocked | other}
- **Details:** {error message or description}
- **Raw agent output (if any):**
```

{raw output}

```

## Optimization Results
- **Options generated:** {count}
- **Cheapest option:** {label} — ${total}
- **Best single-store:** {store} — ${total}

## Script Violations
{If any agent or step generated or attempted to run a script (Python, JavaScript, bash code, etc.) instead of using Playwright MCP tools and reasoning, log each violation here. This is a HIGH PRIORITY issue — the skill and agents must not generate scripts.}

- **Step/Agent:** {which step or store agent}
- **Script type:** {Python | JavaScript | bash | other}
- **What it tried to do:** {e.g., "wrote Python to parse accessibility snapshot JSON", "generated JS to extract prices from HTML"}
- **Why it happened:** {e.g., "agent tried to parse snapshot data programmatically instead of using browser_take_screenshot"}
- **Suggested fix:** {e.g., "strengthen no-scripts instruction in agent", "agent should use screenshot vision instead of snapshot parsing"}

## Issues & Improvement Notes
{Note anything that could be improved for future runs:}
- {e.g., "Instacart showed location popup on Vons, had to dismiss — consider adding zip code"}
- {e.g., "Costco search returned bulk items only — may need different search terms for small quantities"}
- {e.g., "Amazon Fresh returned no results for 'English muffins' — try 'Thomas English muffins' next time"}
- {e.g., "Unit price extraction failed for produce items with estimated weights"}
```

After writing the log, delete the screenshots folder:

```bash
rm -rf {vault_path}/screenshots/
```

Mention the log file path in the terminal summary.
