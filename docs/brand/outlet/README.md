# Outlet identity

Chosen 2026-11-09. Outlet replaces Bring AI as the project name and supersedes the bracket-and-arrow identity in the parent folder, which stays for history.

## The idea

A wall outlet is a standard socket. The appliance maker sells the appliance; you supply the power. Outlet does the same for AI: the app sells its software, and the user supplies the model access they already have.

The mark is an outlet plate: two slots, and a four-point spark where the ground pin would be. The spark is the AI. The three shapes also read as a small face, which keeps a permissions tool approachable.

## Taglines

| Use | Line |
| --- | --- |
| Primary | Apps plug in. You bring the AI. |
| Descriptor (README, npm, repo "About") | Open-source connector and browser SDK that lets web apps use the AI their users already have. |
| Developers | Ship AI features without an inference bill. |
| Developers, security | No keys to hold. Your users' AI credentials never leave their laptop. |
| Economic, for the video and X thread | Pay for the software. Bring your own AI. |
| Analogy | You buy the appliance. You already pay for the power. |
| Short | A standard socket for AI. |
| In-app button (unchanged) | Connect my AI |

Claims to keep out of every line: "free AI", "unlimited", "works with any subscription", and anything implying the model runs offline. Support is whatever [validation](../../validation.md) records. Provider terms for hosted or paid downstream apps are not settled.

## Assets

| File | Use |
| --- | --- |
| `mark.png` | Dark plate, transparent corners, 512 px. Light surfaces, app icon, favicon. |
| `mark-inverse.png` | Light plate, transparent corners, 512 px. Dark surfaces. |
| `banner-light.png`, `banner-dark.png` | README headers, 21:9. |
| `wordmark-concept.png` | Alternative lockup with the socket inside the "o". Not in use. |
| `mark-source.png`, `mark-inverse-source.png` | Unprocessed 1024 px generations. |
| `candidates/` | Rejected concepts: plain plate (A), ring (B, reads as a pause button), outline face (E). |

| Token | Value |
| --- | --- |
| Ink | `#11161c` |
| Paper | `#f6f5f1` |
| Spark | `#3ecf8e` |
| Dark surface | `#0d1117` |
| Secondary text | `#59636e` light, `#8b949e` dark |

Known limits: all assets are raster. The two banners were generated separately, so the lockup size differs slightly between light and dark. A vector redraw of the mark and one shared banner layout are the next step before a public release. No trademark, domain or GitHub organisation check has been done. On npm, `outlet` is taken; `outlet-ai`, `outletai` and the `@outlet-ai` scope returned 404 on 2026-11-09.

## Generation

Nano Banana Pro (`gemini-3-pro-image` on Vertex AI), 2026-11-09, run through the `gen.py` runner from the ad-variants skill. Transparent marks were cut from the sources by flood-filling the background and cropping to the plate.

**Mark** (1:1): A minimalist flat vector logo mark for an open-source developer tool named Outlet, which lets apps plug into a person's own AI. A single rounded-square plate in deep ink charcoal (#11161c) centered on a plain warm off-white (#f6f5f1) background. On the plate, an abstract electrical wall outlet: two short vertical rounded slots side by side in off-white, and below them, centered, where the ground pin would be, one small four-pointed sparkle star in fresh mint green (#3ecf8e). Perfect geometry, thick confident shapes, generous padding, strong at 16px favicon size. Flat solid colors only: no gradients, no shadows, no glow, no 3D, no texture, no text, no letters, no extra decoration, no watermark.

**Inverse mark** (1:1, mark as reference): the same geometry with a warm off-white plate, charcoal slots and the mint spark on a `#0d1117` background.

**Banners** (21:9, mark and wordmark concept as references): the mark on the left, the lowercase word "outlet" in a bold geometric sans-serif, and the line "Apps plug in. You bring the AI." beneath in grey; off-white background for light, `#0d1117` with the inverse mark for dark.
