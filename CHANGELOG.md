# Changelog

## 2026-10-25 — Real product photos
Products used CSS-drawn book covers. They now use the store's own photos, chosen by cover colour and product type:

| Product | Photo |
|---|---|
| مصحف كبير - أزرق | `rev1`: navy cover with a gold medallion |
| مصحف كبير - أحمر | `rev3`: red cover on a wooden stand |
| مصحف متوسط - أسود | `pf-binding`: black leather cover |
| باقة صغيرة | `pf-set`: stack of five Qurans |
| باقة كبيرة | `rev2`: shipping box of Qurans; it is also the photo in the review about the large pack |
| باقة الجلالين | `pf-study`: open tafsir next to a dark Quran |
| باقة صابري | `pf-library`: shelf of multi-volume books |
| باقة الرحمن | `ab-mission`: open book on a stand |

- Product cards (home, catalog, similar products, thank-you) use these photos as square crops. A `pos` value moves the crop onto the book where it sits off-centre.
- **Product page gallery:** shows only photos that are true for the product: its own photo, the inside pages, and, for tafsir bundles, the black Quran they include.
- **Product page details:** each row lists fallback photos, so no photo appears twice on a page.
- **SEO:** each product's `og:image`, `twitter:image` and Product JSON-LD now use its own photo instead of the site logo image.
- **Home tafsir tile:** now uses the open-Quran photo (`pf-paper`), so it no longer repeats the Jalalayn photo.
- Removed the book-mockup CSS.
- To change a product's photo, edit `img` (and optionally `pos`) in the `PRODUCTS` list of `products.html`, `product.html` and `thank-you.html`, and in the static card in `index.html`.

## 2026-10-25 — Minimalist design system
Checked every public page at 1280 and 375 px: no horizontal scroll, no console errors. Menu, slider, catalog filters, form validation, promo code and order confirmation were all re-tested.

### Changed
- **One stylesheet.** Each page used to carry about 250 lines of the same CSS inline, with `site.css` patching it with `!important` overrides. That CSS is gone; `assets/site.css` is now the only stylesheet. It has:
  - tokens for colours, spacing, container width and header height
  - one section per component and per page
  - mobile rules next to each component, at the same 860px breakpoint `site.js` uses

  The pages are 7–29 KB smaller each.
- **Look:**
  - hairline borders instead of drop shadows
  - gold only for small accents (labels, icons, link hover)
  - outline "اطلب الآن" buttons on product cards
  - slimmer header, with the nav at the start, the logo centred and the button at the end
  - thin slide indicators
  - a plain trust strip
  - tighter type scale (section titles 24px, body 14–15px)
  - square corners, as before
- **Home:**
  - The two image-and-text feature rows are now two side-by-side story cards.
  - Reviews are text-first with a small photo; the large photos are gone.
  - FAQ is two columns on desktop: title and WhatsApp button beside the questions.
- **Catalog:** a plain title with breadcrumb replaces the dark image banner; outline filter chips.
- **Product page:**
  - The three alternating detail rows are now three cards (a sideways scroller on mobile).
  - The feature grid and trust badges are hairline rows.
  - The order form card no longer has a heavy shadow.
- **About, thank-you, 404:** same components and spacing; values and steps use hairline rows instead of shadowed boxes.
- **Motion:** reveals are shorter and quieter.
  - Removed the scroll progress bar, Ken Burns zoom on the hero, magnetic buttons and image parallax.
  - Removed the page-transition fade, which held every internal link for 320 ms.

### Fixed
- The success panel and a valid form field shared the class `.ok`, which needed an `!important` workaround. The rule is now scoped to the order card, and the review badge uses `.verified`.

## 2026-10-25 — Promo codes (SAHABY30)
The home slide promised "30% off your first order with SAHABY30", but checkout had nowhere to enter it.

### Added
- **Backend (`Code.gs` v1.2):**
  - `PROMOS` list. SAHABY30 takes 30% off and is first order only: refused when the phone already has an order that was not cancelled.
  - Orders accept `promo`. An unknown code returns `{error:'promo', reason:'invalid'}` and a used one returns `reason:'used'`. Nothing is written in either case.
  - **Orders** gets two new columns, **كود الخصم** and **الخصم**, added automatically on the first request after redeploying. **المجموع** is now the amount to collect, after the discount.
  - Free delivery is still decided on the price before the discount.
  - When an admin edits the quantity or product, the order's code is kept and the discount recalculated.
  - The email notification shows the discount.
- **Order form (`product.html`):**
  - A "لديك كود خصم؟" link opens the code field. The discount appears in the summary and the sticky price bar.
  - A code typed without pressing "تطبيق" is applied on submit.
  - When the server refuses a code, the discount and the code are removed, the form explains why, and the customer confirms the new total.
- **Offer link:** the home slide links to `products.html?promo=SAHABY30`. `site.js` remembers the code for the visit and the order form applies it. The slide now says "عند الطلب" instead of "عند الدفع".
- **Thank-you page and admin panel** show the discount line: admin order drawer, printed slip, CSV export and change log.
- `SETUP.md`: promo codes, the API change, and the v1.1 → v1.2 upgrade.

Tested against a mocked Apps Script environment (17 checks: discounts, refusals, retries, cancelled orders, admin edits, migration from v1.1) and in the browser with the order endpoint mocked. No order was sent to the live endpoint.

## 2026-10-25 — Compact & polish pass
Checked at 1280 / 980 / 375 px on every public page. No horizontal scroll, no console errors.

### Changed
- Tighter layout on every page through a "Compact pass" block in `assets/site.css`:
  - smaller header, section titles and card text
  - less space between sections
  - product cards use a thin border instead of a soft shadow, and prices line up across a row
  - 24px side gutters between 861 and 1232px, where content used to touch the screen edges
  - the header lines up with the content edges
- Home page:
  - The hero is now a capped banner (max 520px, 60% of the screen) instead of a full screen, so the trust strip and first products show without scrolling. Dots sit inside the banner on desktop. On mobile the hero is 4:5 instead of 9:14.
  - Slide 1 used a handbag/watch/perfume photo with generic fashion copy. It now uses the site's own Quran photo (`img/pf-banner`) with copy about the store. The `s1-*` images are no longer used, but they are still in `img/`.
  - Trust strip: "جودة عالية" is replaced by "الدفع عند الاستلام".
  - Product sections have the title on one side and "عرض الكل" on the other. The short tafsir row is filled with a promo tile that links to the tafsir category; the tile is hidden on mobile.
  - The feature rows, reviews (4:3 photos) and FAQ are more compact. The FAQ button now opens WhatsApp instead of jumping to the footer.
  - The splash intro (up to ~3.5s, once per session) is removed. The hero text animation is kept.
- Product page (mobile): the gallery is shorter (4:3) and the thumbnails smaller, so the title, price and order form appear sooner.
- Catalog page: smaller title banner and filter bar.

### Fixed
- The feature-image `alt` attributes contained `</picture>`, which left both `<picture>` elements unclosed. The markup is fixed and the alt text describes each photo.
- The mobile menu now opens right under the header (it was hard-coded to 68px).
- On 861–1320px screens, the back-to-top button no longer covers the copyright line.
- Removed an invalid `.stars` color declaration.

## 2026-10-22 — QA & UX pass
Tested at 1440 / 1024 / 768 / 390 / 360 px. Every order request in the tests was intercepted and mocked; nothing was sent to the live endpoint.

### Added
- `assets/site.css` and `assets/site.js`, a shared QA layer loaded on all public pages.
  - Visible focus states and a skip link.
  - Sticky header on all sizes, with a shadow once you scroll.
  - Back-to-top button.
  - Accessible mobile menu: aria-expanded, Escape, tap outside to close, scroll lock, focus returns to the burger.
  - Highlighting for the active page.
  - iOS safe areas, reduced-motion support, print styles.
  - Tap targets of at least 44px and mobile text of at least 13px.
- `404.html`, in the site's look and set to noindex.
- Favicons made from the logo: `favicon.ico`, `assets/favicon-32.png`, `apple-touch-icon.png`, `icon-512.png`. Also `assets/og-image.jpg`.
- Meta tags on every page:
  - description, canonical, theme-color, Open Graph and Twitter tags
  - preconnect to the font servers (display=swap was already on)
  - viewport-fit=cover
- JSON-LD:
  - Organization on index and about.
  - ItemList on products.
  - Product on product.html, with an Offer in MAD at the price from Code.gs. This one is built by JS, along with the page's canonical and OG tags.
- A `.webp` copy of every image:
  - `<picture>` with a jpg fallback.
  - CSS backgrounds use `image-set()`.
  - Images have width and height (no layout shift; CLS measured at 0.000), decoding=async and lazy loading below the fold.

### Changed / fixed
- Slider:
  - Carousel ARIA roles; dots are labelled and marked aria-current.
  - Pauses on hover or focus and when the tab is hidden.
  - Arrow keys work; swipe still works.
  - No autoplay when the user prefers reduced motion.
  - Links on hidden slides are taken out of the tab order.
- COD form:
  - Each field is checked when you leave it, using aria-invalid and aria-describedby.
  - Phone number is formatted as you type (`06 12 34 56 78`).
  - Fields have name/required/enterkeyhint; Enter moves to the next field.
  - No autofocus.
- On mobile, the WhatsApp button hides while the COD form is on screen (it was covering the quantity button).
- On desktop, the product gallery stays in view as you scroll.
- Contrast (WCAG AA):
  - grey text darkened (#888 → #6b6b6b, #999 → #767676, #777 → #666)
  - gold accent text on light backgrounds → #8a6420
  - gold buttons and labels with white text → #93691f
  - WhatsApp greens darkened; stars darkened
- Feature image alt text no longer contains a stray `<span>`; zigzag images now have alt text.
- Large jpgs recompressed (all now 200KB or less).
- Honeypot field is now hidden with clip-path; the old off-screen position caused sideways scrolling on RTL pages.
- Bigger hit areas for breadcrumb and hero-nav links.
- Admin: long customer names are cut short with "…" (full name on hover). The empty state was already there and was checked.

### Unchanged
- Content, prices and the design are the same. Prices were checked against Code.gs on every page.
- ORDER_ENDPOINT and the backend are unchanged. The admin token is still not stored in the code.
