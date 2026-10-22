# Changelog

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
