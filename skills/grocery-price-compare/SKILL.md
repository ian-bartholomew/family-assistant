---
name: Grocery Price Compare
description: "Compare grocery prices across multiple stores. Use when the user asks to compare grocery prices, find the cheapest groceries, check grocery prices, or run a price comparison on their grocery list."
version: 1.0.0
---

# Grocery Price Compare

Compare prices for unchecked grocery list items across multiple stores, find the cheapest fulfillment strategy, and append a report to the grocery list.

**Screenshot management:** Screenshots are optional — agents use `browser_snapshot` (DOM accessibility tree) for data extraction by default. Screenshots are only taken as fallback when popups or blockers are detected. If any screenshots are saved to `{vault_path}/screenshots/`, clean up with `rm -rf {vault_path}/screenshots/` after the run.

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

Verify Playwright instances are available. **Issue all ToolSearch calls in parallel:**

1. For each store, call `ToolSearch("+playwright-{N} navigate")` — **all calls in one message**.
2. If not found, warn user and remove from list.
3. If **no** instances available, stop.

## Step 4: Scrape All Stores (Direct Orchestration)

**IMPORTANT: Do NOT dispatch subagents. Subagents cannot access MCP tools.** Instead, orchestrate scraping directly from the main conversation using parallel Playwright calls.

Each store has a `playwright_instance` number (1-7) mapping to an isolated headless browser. Use `browser_navigate` and `browser_evaluate` — NOT `browser_snapshot` (too large) or `browser_take_screenshot` (too slow).

**For each grocery item, execute 2 parallel rounds:**

### Round 1: Navigate all stores in parallel

For each store, call `mcp__playwright-{N}__browser_navigate` with the search URL:

- **Instacart stores:** `https://www.instacart.com/store/{slug}/s?k={url_encoded_query}` (use `/s?k=` NOT `/search?q=`)
- **Amazon stores:** `https://www.amazon.com/s?k={url_encoded_query}&i={wholefoods|amazonfresh}`
- If `prefer_organic` is true, prepend "organic " to produce searches

### Round 2: Extract prices from all stores in parallel

For each store, call `mcp__playwright-{N}__browser_evaluate` with the platform-appropriate extractor:

**Amazon extractor:**

```javascript
() => { const r=[]; document.querySelectorAll('[data-component-type="s-search-result"]').forEach(c => { const n=c.querySelector('h2 a span,.a-text-normal'); const p=c.querySelector('.a-price .a-offscreen'); if(n&&p) r.push({n:n.textContent.trim().substring(0,80), p:p.textContent.trim().substring(0,12)}); }); return r.slice(0,3); }
```

**Instacart extractor:**

```javascript
() => { const r=[]; document.querySelectorAll('li').forEach(li => { const t=li.innerText; if(!t.match(/\$\d/)||t.length<30||t.length>500) return; const p=t.split('\n').map(s=>s.trim()).filter(s=>s); let price='',name='',size='',unit=''; for(const l of p){ if(l.startsWith('Current price:')) price=l.replace('Current price: ','').replace(' each (estimated)',''); if(!name&&l.length>5&&!l.match(/^\$|Current|Original|Best|Store|Many|Likely|Low|Only|Sold|Add|About|each|carousel|\d+ sizes|in stock|delivery|off$/i)) name=l; if(!size&&l.match(/\d+\s*(oz|lb|ct|pack|gal|fl)/i)&&l.length<40&&!l.match(/About/)) size=l; if(l.match(/\$[\d.]+ \/ (lb|oz|ct)/)) unit=l; } if(price&&name) r.push({n:name.substring(0,80),p:price,s:size,u:unit}); }); return r.slice(0,3); }
```

**No wait needed between navigate and evaluate** — pages load during the navigate call.

Pick the best match from each store's results: prefer organic, closest name match to the searched item.

## Step 5: Build Price Table

For each item × store, record:

- `product_name`, `price`, `size`, `unit_price`
- `status`: found / substituted / not_found
- Use `delivery_fee` from `stores.yaml` config (do NOT navigate to find it)

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

**Report structure** (keep it compact — fewer tokens to generate):

```markdown
---
## Price Comparison — {YYYY-MM-DD HH:MM}

### Prices

| Item | {Store1} | {Store2} | ... |
|------|----------|----------|-----|
| {item} | ${price} ({size}) ✓ | ${price} ({size}) | ... |

Mark best unit price per row with ✓. Use "—" if not found, "OOS" if out of stock.

### Best Options

**Option 1: {Label} — ${total}**
{Store}: ${item_subtotal} items + ${service_fee} svc + ${delivery} dlv + ${tip} tip = ${store_total}

**Option 2: {Label} — ${total}**
...

### Issues
- {item}: not found at {stores} / out of stock at {stores} / substituted at {store} with {product}
```

**Perform these two writes in parallel** (they target different files):

1. Use the Edit tool to append the report after the last line of the grocery list file (after a `---` separator).
2. Write the run log (see Step 9) at the same time — don't wait for the report append to finish.

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

After writing the log, clean up any screenshots if they exist:

```bash
rm -rf {vault_path}/screenshots/ 2>/dev/null
```

Mention the log file path in the terminal summary.
