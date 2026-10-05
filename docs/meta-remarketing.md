# Meta remarketing audiences (built in Ads Manager, no code)

ZUULAB does not upload customer lists to Meta. Visitors who accepted marketing cookies are already reported to
Meta by the Pixel (browser) and the Conversions API (server), with the same event ids. Build the audiences
yourself from those events:

Ads Manager → Audiences → Create audience → **Custom audience** → **Website** → pick the Pixel "Zuulab Pixel".

| Audience | Event | Condition | Retention |
|---|---|---|---|
| Visited the shop | all website visitors | – | 30 days |
| Viewed a product | `ViewContent` | – | 14 days |
| Added to cart, did not buy | `AddToCart` | **and not** `Purchase` (exclude) | 7 days |
| Started checkout, did not buy | `InitiateCheckout` | **and not** `Purchase` | 7 days |
| Bought | `Purchase` | – | 180 days |
| Bought a given product | `Purchase` | URL / content id contains the product | 180 days |
| Viewed a collection | all visitors | URL contains `/koleksiyon/<slug>` | 30 days |

Use "Bought" as an **exclusion** on prospecting ads, and as a source for a **Lookalike audience** (1–3 %, Türkiye).

Limits to know:

- Only visitors who accepted marketing cookies are in these audiences; that is by design (KVKK).
- Product views carry the shop's product id; collection and URL rules use the page path.
- New ads made in the admin (Pazarlama → Meta reklamları) can pick these saved audiences when creating an ad set.
- Customer lists (e-mail upload) are intentionally not built: they need the customers' explicit consent for that use and
  a lawyer's approval of the privacy and consent texts first.
