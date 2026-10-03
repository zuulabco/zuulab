# ZUULAB design system — rules of use

The tokens live in `src/app/globals.css` (ZUULAB DESIGN SYSTEM v2). This file records
how they are used, so every page — storefront and admin — reads as one product.

## Colour

| Token | Value | Use |
|---|---|---|
| `--text-primary` (ink) | `#111110` | Text, and the fill of every ordinary primary button |
| `--ink-hover` | `#2e2e2c` | Hover of ink buttons (never switch to blue on hover) |
| `--zuu-blue` | `#0080C4` | **Buying only** as a fill: add to cart, go to checkout, pay. Elsewhere only focus rings, active-nav marker, links |
| `--zuu-yellow` | `#FEC80F` | Small highlights (announcement links, counts); never a button fill |
| `--surface-0/1/2` | `#fff / #f8f8f7 / #f0f0ef` | Page, subtle panels, hover/selected rows |
| `--border / --border-strong` | `#e4e4e2 / #c8c8c6` | Dividers / outlined buttons and inputs |
| `--skeleton` | `#ebebea` | Loading placeholders and empty image frames |

Rule of thumb: if a button moves an order forward it is blue (`.btn-buy`), otherwise ink
(`.btn-primary`) or outlined (`.btn-secondary`).

## Buttons

- Global classes: `btn` + one of `btn-primary`, `btn-buy`, `btn-secondary`, `btn-ghost`,
  `btn-danger`; sizes `btn-sm`, `btn-lg` (44px, use for page-level actions).
- Admin pages use `styles.primaryButton / secondaryButton / dangerButton` (and the older
  aliases `btnPrimary`, `primaryBtn`, …) — all map to the same four looks in
  `admin.module.css`.
- Every button has hover, visible focus (blue ring), disabled (45% opacity) and, while a
  request runs, a disabled state with a "…ing" label. No browser-default buttons.

## Type

DM Sans for everything; DM Serif Display only for display moments (hero, 404 number).
Mono is reserved for small catalogue meta (breadcrumbs, category labels). Sentence case
in the admin; the storefront keeps its lowercase voice.

## Images and loading

- Images fade in once loaded (`ImageFadeScript` in the root layout + `html.img-fade` CSS).
  Frames that hold photos use the skeleton tone as background.
- Product-card photos on Cloudinary go through `cloudinaryCardLoader` (trims baked-in
  white frames, fills 3:4, WebP/AVIF).
- Loading states are skeletons with the shape of the content (`Skeleton`, `SkeletonRows`,
  `SkeletonList`, `SkeletonPage`, `ProductCardSkeleton`, route `loading.tsx` files) — never
  centred "Yükleniyor…" text. The PayTR frame keeps its explanatory message.

## Motion

Durations from tokens (`--dur-fast` 120ms … `--dur-slower` 450ms), ease-out on enter.
One purposeful movement per interaction; `prefers-reduced-motion` disables all of it.

## Admin navigation

Grouped by task (Satış, Katalog, Stok ve üretim, Pazaryerleri, Müşteriler, Kargo ve
fatura, Vitrin, Sistem); icon + short label; the current page has a tinted row and a blue
marker; groups collapse and the current group stays open. No decorative tags in the nav.

## Status pages

Branded `not-found`, `error` (storefront and admin) and `global-error`; each says what
happened and offers the next step.
