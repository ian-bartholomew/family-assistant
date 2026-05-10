---
name: grocery-price-compare
description: "Compare grocery prices across multiple stores. Use when the user asks to compare grocery prices, find the cheapest groceries, check grocery prices, or run a price comparison on their grocery list."
version: 2.0.0
---

# Grocery Price Compare

Compare prices for unchecked grocery list items across ALL configured stores, find the cheapest fulfillment strategy (including multi-store splits), and append a report to the grocery list.

**CRITICAL RULES:**

- **NEVER drop stores mid-run.** Search ALL configured stores for ALL items, every run. No exceptions.
- **ALWAYS include multi-store options** in the report (cheapest per-item cherry-pick + 2-store consolidation).
- **Log every run** to `{vault_path}/_log.md` for iterative improvement.

## Step 1: Read the Grocery List

1. Read `${CLAUDE_PLUGIN_ROOT}/config/stores.yaml` to get `grocery_list.vault_path`.
2. Glob `**/*.md` under the vault path.
3. Sort by date in filename (`Grocery List - YYYY-MM-DD.md`), pick most recent.
4. Extract unchecked items (`- [ ]` lines), strip prefix to get plain item names.
5. If no unchecked items, tell the user and stop.
6. Record the start timestamp (`date +%s`).

## Step 2: Load Store Configuration

Read `${CLAUDE_PLUGIN_ROOT}/config/stores.yaml` and parse:

- Stores: `name`, `platform`, `search_url`, `playwright_instances` (array of 3 instance numbers), `delivery_fee`, `service_fee_percent`, `tip_flat` or `tip_percent`
- Preferences: `prefer_organic`, `delivery`, `zip_code`, `default_tip_percent`

## Step 3: Pre-flight Check

Verify Playwright instances are available. For each store, check ONE instance from its `playwright_instances` array:

```
ToolSearch("+playwright-{N} navigate")
```

Issue all ToolSearch calls in parallel (one message). If a store's instance is not found, warn and remove that store. If no stores available, stop.

## Step 4: Scrape All Stores (Direct Orchestration — 21 Instances)

**Do NOT dispatch subagents.** Subagents cannot access MCP tools. Orchestrate scraping directly from the main conversation.

Each store has 3 Playwright instances (`playwright_instances: [N, N+1, N+2]`). This allows searching **3 items per store per round** — all 7 stores simultaneously = **21 parallel searches per round**.

**NEVER drop stores. Search ALL configured stores for ALL items.**

### Pipeline: Process items in batches of 3

For each batch of 3 items (A, B, C):

**Round 1 — Navigate 21 instances in parallel:**
For each store, navigate its 3 instances to search for items A, B, C:

- Instance N → `search_url` with item A as query
- Instance N+1 → `search_url` with item B as query
- Instance N+2 → `search_url` with item C as query

URL patterns:

- **Instacart:** `https://www.instacart.com/store/{slug}/s?k={url_encoded_query}` (use `/s?k=` NOT `/search?q=`)
- **Amazon:** `https://www.amazon.com/s?k={url_encoded_query}&i={wholefoods|amazonfresh}`
- If `prefer_organic` is true, prepend "organic " to produce searches (fruits, vegetables)

**Round 2 — Extract from 21 instances in parallel:**
For each instance, call `mcp__playwright-{N}__browser_evaluate` with the platform-appropriate extractor:

**Amazon extractor:**

```javascript
() => { const r=[]; document.querySelectorAll('[data-component-type="s-search-result"]').forEach(c => { const n=c.querySelector('h2 a span,.a-text-normal'); const p=c.querySelector('.a-price .a-offscreen'); if(n&&p) r.push({n:n.textContent.trim().substring(0,80), p:p.textContent.trim().substring(0,12)}); }); return r.slice(0,3); }
```

**Instacart extractor:**

```javascript
() => { const r=[]; document.querySelectorAll('li').forEach(li => { const t=li.innerText; if(!t.match(/\$\d/)||t.length<30||t.length>500) return; const p=t.split('\n').map(s=>s.trim()).filter(s=>s); let price='',name='',size='',unit=''; for(const l of p){ if(l.startsWith('Current price:')) price=l.replace('Current price: ','').replace(' each (estimated)',''); if(!name&&l.length>5&&!l.match(/^\$|Current|Original|Best|Store|Many|Likely|Low|Only|Sold|Add|About|each|carousel|\d+ sizes|in stock|delivery|off$|Organic$|In season|Spend|Non GMO|Zero trans|Gluten free|No preservatives|No artificial|Pasture raised|Low calorie|\d+% off/i)) name=l; if(!size&&l.match(/\d+\s*(oz|lb|ct|pack|gal|fl)/i)&&l.length<40&&!l.match(/About/)) size=l; if(l.match(/\$[\d.]+ \/ (lb|oz|ct)/)) unit=l; } if(price&&name) r.push({n:name.substring(0,80),p:price,s:size,u:unit}); }); return r.slice(0,3); }
```

**No wait needed** between navigate and evaluate — pages load during the navigate call.

For the last batch (if fewer than 3 items remain), only use as many instances per store as needed.

Pick the best match from each store's results: prefer organic, closest name match to the searched item.

### Timing

For N items across 7 stores with 21 instances (3 per store):

- Rounds = ceil(N / 3) × 2 (navigate + evaluate)
- 36 items → 12 rounds × 2 = 24 tool call batches → ~5 minutes

## Step 5: Build Price Table

For each item × store, record: `product_name`, `price`, `size`, `unit_price`, `status` (found/substituted/not_found).

Use `delivery_fee` from config (do NOT navigate to find it).

**Error handling:** If any extraction fails, treat as `not_found`. Never fail the entire run.

## Step 6: Optimize Fulfillment Strategies

**Do NOT write scripts for this step.** Work through calculations manually.

**Cost per store:** item_subtotal + service_fee + delivery_fee + tip = store_total

**ALWAYS generate ALL of these options:**

1. **Cheapest single-store** — best store to buy everything from (note missing items)
2. **Cheapest multi-store cherry-pick** — for each item, pick the store with the lowest unit price. Sum up per-store costs (items + delivery + tip for each store used).
3. **2-store consolidation** — if cherry-pick uses 3+ stores, find the best 2-store split that saves on delivery/tip vs cherry-pick while staying cheaper than single-store.

Rank all options by total cost ascending.

## Step 7: Generate and Append Report

Append to the grocery list file (after `---` separator):

```markdown
---
## Price Comparison — {YYYY-MM-DD HH:MM}

### Prices

| Item | Vons | Sprouts | Costco | WF | AF | Ralphs | Aldi |
|------|------|---------|--------|----|----|--------|------|
| {item} | ${price} ✓ | ${price} | ... | ... | ... | ... | ... |

Mark best unit price per row with ✓. Use "—" if not found.

### Best Options

**Option 1: {Label} — ${total}**
{Store}: ${subtotal} items + ${svc} svc + ${dlv} dlv + ${tip} tip = ${store_total}
{Store2}: ...

**Option 2: {Label} — ${total}**
...

**Option 3: {Label} — ${total}**
...

### Issues
- {item}: not found at {stores} / substituted at {store} with {product}
```

## Step 8: Print Terminal Summary

Print: item count, store count, all options with totals, warnings for missing/substituted items.

## Step 9: Write Run Log

**Append** to `{vault_path}/_log.md` (same directory as grocery lists, NOT the plugin root):

```markdown
---
### Run {YYYY-MM-DD HH:MM}
- **List:** {filename} | **Items:** {count} | **Stores:** {store names}
- **Duration:** {seconds}s | **Outcome:** {success|partial|failed}
- **Cheapest single:** {store} ${total} | **Cheapest multi:** ${total} ({stores})
- **Issues:** {brief list of problems}
- **Improvements:** {what to fix for next run}
```

Then clean up: `rm -rf {vault_path}/screenshots/ 2>/dev/null`
