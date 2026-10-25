# Sahaby orders → Google Sheets: setup

## 1. Create the sheet and script
1. Open Google Sheets and create a blank spreadsheet, e.g. **Sahaby Orders**.
2. Open **Extensions → Apps Script**.
3. Delete the sample code in `Code.gs` and paste all of `backend/Code.gs`. Click **Save** (💾).
4. In the toolbar function dropdown, choose **`setup`** and click **Run**.
   - Google asks for permission: **Review permissions → your account → Advanced → Go to (project) (unsafe) → Allow**.
     This is normal for your own script.
5. Go back to the sheet. You now have:
   - **Orders**: styled, RTL, with a status dropdown.
   - **Dashboard**: KPIs, orders by status, top products, top cities.
   - **Config**: hidden; holds the stable API keys, statuses and prices.
6. Optional: run **`testOrder`** once to add a sample row. Delete that row afterwards.

## 2. ADMIN_TOKEN (for the future admin panel)
`setup()` creates a random token automatically. To view or change it, go to
**Apps Script → ⚙️ Project Settings → Script properties**:

| Property | Value |
|---|---|
| `ADMIN_TOKEN` | a long random string (≥ 8 chars). Keep it secret and never put it in the website. |
| `NOTIFY_ENABLED` | `true` to get an email for each new order (default `false`) |
| `NOTIFY_EMAIL` | the address that receives the notifications |

## 3. Deploy as a Web app
1. **Deploy → New deployment →** ⚙️ select type **Web app**.
2. Description: `v1`. **Execute as: Me**. **Who has access: Anyone**.
3. Click **Deploy**, authorise if asked, then copy the **Web app URL** (it ends with `/exec`).

## 4. Connect the website
Open `product.html`, find the first `<script>` block ("ORDER CONFIG"), and replace

```js
const ORDER_ENDPOINT='PASTE_WEB_APP_URL_HERE';
```

with your URL. Also set `WA_NUMBER` to the real WhatsApp number (international format, no `+`).
Place a test order on the site; it should appear in **Orders** within a few seconds.

## 5. Important: redeploying after edits
Changing `Code.gs` does **not** update the live URL by itself. After every edit:
**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
The URL stays the same. (Creating a *New deployment* instead would give a new URL.)

Prices live in `PRODUCTS` inside `Code.gs`. When you change a price on the site, change it there too and redeploy. The server always recalculates totals from this list.

### Promo codes
Codes live in `PROMOS` inside `Code.gs`. Today there is one:

```js
'SAHABY30': { pct: 30, firstOrder: true, active: true }
```

- `pct`: the percent taken off the order (unit price × quantity), rounded to the nearest dirham.
- `firstOrder`: the code is refused when the phone number already has an order that was not cancelled.
- `active: false`: stops new orders from using the code. Orders that already used it keep their discount if you edit them.

The **المجموع** column is the amount to collect, after the discount. The discount itself is in **الخصم**, and the code in **كود الخصم**.
Free delivery still uses the price *before* the discount, so a 200-dirham order with SAHABY30 stays free to deliver.

The order form keeps its own copy of the codes in `product.html` (`const PROMOS={SAHABY30:30}`), but only to show the discount. When you add, change or remove a code, update both files and redeploy. The server checks every order either way.
Offer links can carry the code, e.g. `products.html?promo=SAHABY30`; the order form then fills it in.

---

## Admin API
Base URL: your `/exec` URL. Every response is JSON with `ok: true|false`.
POST bodies are JSON sent as `Content-Type: text/plain`, which avoids the CORS preflight.

### Public
| Call | Description |
|---|---|
| `GET /exec` | Health check: `{ok, service, version}` |
| `POST /exec` `{productId, qty, name, phone, city, promo?, source?, notes?, website?}` | Creates an order and returns `{ok, orderId, subtotal, discount, promo, total, delivery}`. Errors: `validation` (+ `fields`), `promo` (+ `reason`: `invalid` for an unknown or inactive code, `used` when the code is first-order only and the phone has ordered before), `bad_json`. A duplicate (same phone + product within 2 min) returns `{ok, duplicate:true, orderId}`. `website` is the honeypot and must be empty. |

### Admin (token required)
| Call | Description |
|---|---|
| `GET ?action=list&token=T[&status=new][&from=YYYY-MM-DD][&to=YYYY-MM-DD][&search=txt][&page=1][&pageSize=50]` | `{total, page, pageSize, pages, items[]}`, newest first. `pageSize` ≤ 200. `status` accepts the key or the Arabic label. |
| `GET ?action=get&id=SH-…&token=T` | `{order}` |
| `GET ?action=stats&token=T` | `{totalOrders, today, byStatus{}, revenueDelivered, pipeline, topProducts[], topCities[]}` |
| `GET ?action=meta&token=T` | Columns (key + label), statuses, products |
| `POST {action:"updateStatus", token, id, status}` | `status` = key or Arabic label |
| `POST {action:"updateNote", token, id, note}` | Replaces the note |
| `POST {action:"delete", token, id}` | Soft delete: status becomes `ملغى` and a `[محذوف …]` tag is added to the notes |
| `POST {action:"bulkStatus", token, ids:[…], status}` *(v1.1)* | Updates up to 500 orders → `{updated, ids, missing}` |
| `POST {action:"updateOrder", token, id, fields:{name?, phone?, city?, address?, qty?, productId?}}` *(v1.1)* | Edits the order. Product, unit price, discount, total and delivery are recalculated on the server, keeping the order's promo code |
| `GET ?action=history&id=…&token=T` *(v1.1)* | Change log `[{at, field, from, to, by}]`, also returned by `get` |
| `GET ?action=stats&days=14&token=T` *(v1.1)* | Adds a `series` of `[{date, orders, revenue, delivered}]` |

Every POST may include `by` (who made the change), which is written to the **History** sheet.
`list` also accepts `productId` and `city` filters, and `pageSize` up to 500.

Order object keys (stable, from the hidden row 1):
`id, createdAt, name, phone, city, product, productId, qty, unitPrice, total, delivery, status, notes, source, updatedAt, address, promo, discount`,
plus `statusKey` and `_row`. `promo` and `discount` are empty when no code was used.

Status keys: `new` جديد · `confirmed` مؤكد · `shipping` قيد الشحن · `delivered` تم التسليم · `cancelled` ملغى · `no_answer` لا يجيب.

**Security note:** the admin panel must keep the token server-side or ask the admin to type it in. Never embed it in public pages.

## Upgrading v1.0 → v1.1 (admin panel)
1. Replace all of `Code.gs` with the new version and click **Save**.
2. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
3. You do **not** need to run `setup()` again. On the first request, the script adds the new **العنوان / address** column and creates the **History** sheet by itself. Doing this again changes nothing.

## Upgrading v1.1 → v1.2 (promo codes)
1. Replace all of `Code.gs` with the new version and click **Save**.
2. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
3. You do **not** need to run `setup()` again. On the first request, the script adds the **كود الخصم / promo** and **الخصم / discount** columns at the end of **Orders**. Existing orders are unchanged.

## Admin panel
Open `admin/index.html`, paste the `ADMIN_TOKEN`, and keep the default API URL, which can be changed in Settings.
Don't link to the panel from the public site; it is already marked `noindex`.

## Local test
`node backend/test-mock.js backend/Code.gs` runs 51 checks against a mocked Spreadsheet/Cache/Lock environment.
