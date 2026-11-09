# Bring AI identity

> Superseded on 2026-11-09 by the [Outlet identity](outlet/README.md). The assets below remain for history.

Technical, quiet, open source. Lead with what the software does: **Local inference bridge for web apps.**

The mark combines square brackets with the existing upward-right arrow. It represents a bounded connection, matching the project's origin approval and inference-only interface. The underscore in the wordmark is a terminal reference, not part of the project name.

| Token      | Dark      | Light     |
| ---------- | --------- | --------- |
| Background | `#0d1117` | `#f6f8fa` |
| Text       | `#e6edf3` | `#1f2328` |
| Secondary  | `#8b949e` | `#59636e` |
| Accent     | `#a5e1bd` | `#176b43` |
| Rules      | `#30363d` | `#d1d9e0` |

Typography uses the system monospace stack: `ui-monospace`, SF Mono, Menlo, Consolas. Assets contain no remote fonts, scripts or linked resources. The README chooses the light/dark banner using a native HTML picture element.

- `banner-{light,dark}.svg` / `.png`: 1280 × 480 README headers.
- `mark-{light,dark}.svg`: transparent connection marks, 128 × 128.
- `wordmark-{light,dark}.svg`: transparent wordmarks, 520 × 110.
- `social-preview.svg` / `social-preview.png`: 1200 × 630 repository preview.

Use the dark variant on a dark surface, and the light variant on a light surface. The existing desktop screenshots show the actual alpha UI; branding assets do not imply a runtime redesign.

Regenerate vector sources with `node scripts/brand-assets.mjs`. PNGs are raster exports of those vectors. Keep copy factual: describe the connector, SDK, permissions and tested support. Pricing pitches and claims of universal subscription compatibility do not belong in this identity. “Local” describes the connector; cloud-provider inference still runs at the provider.

Project source and these assets use the repository's Apache-2.0 license.
