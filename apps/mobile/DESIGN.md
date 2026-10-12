# PhoneApprove design system

**System:** [Material Design 3](https://m3.material.io/) (incl. [Expressive](https://m3.material.io/blog/building-with-m3-expressive) tactics)  
**Brand seed:** ClawQL mark — navy field · orange **QL** · warm paper · sky technical  
**Native bridge:** [`@expo/ui`](https://docs.expo.dev/versions/latest/sdk/ui/) — Android → Material 3 / Compose; iOS → SwiftUI (HIG-shaped controls tinted by the same seed)  
**Scheme:** **Dark** (`Host.colorScheme="dark"`) to match brand art  
**Not using:** IBM Carbon (enterprise web), ad-hoc hex outside tokens

## Brand → M3 mapping

| Brand | Hex (approx) | M3 role |
| --- | --- | --- |
| Navy field | `#081133` | `surface` / containers |
| Orange QL | `#FF5636` | `primary` / `seed` |
| Warm paper | `#EFEAE7` | `onSurface` |
| Sky technical | `#7289AB` → `#A8C0E0` | `onSurfaceVariant` / `secondary` |

## Why Material 3 (not Carbon)

| | Material 3 | IBM Carbon |
| --- | --- | --- |
| Fit | Mobile-first; Android platform language | Data-dense enterprise **web** |
| Our stack | `@expo/ui` Host + Compose/SwiftUI already M3/HIG | Would fight native controls |
| Tokens | Color roles, type scale, shape, elevation | `$text-02`-style web tokens + IBM Plex |

Carbon is excellent for consoles; PhoneApprove is a phone approval app. Stick to M3 + ClawQL brand colors.

## How to build a screen

1. **Tokens only** — import from `@/src/theme` (`color`, `type`, `shape`, `space`, `elevation`). Do not hardcode hex in screens.
2. **Components first** — prefer `@expo/ui` (`Button`, `List`, `ListItem`, `Host`) and our primitives in `src/ui/primitives.tsx`.
3. **Color pairing** — only use intended pairs (`primary` + `onPrimary`, `primaryContainer` + `onPrimaryContainer`, `surface*` + `onSurface` / `onSurfaceVariant`). See [M3 color roles](https://m3.material.io/styles/color/roles).
4. **Icons** — Material Symbols XML (Android) / SF Symbols (iOS) via `AppIcon`; web SVG fallback. Put icons in tonal containers (`IconBubble` = primary/secondary/error **container** fills).
5. **Hierarchy** — one primary action per region; secondary = outlined / tonal; tertiary = text. Section chrome uses `SectionHeader` (icon + title).

## Token map (ClawQL brand → M3 roles)

Seed / brand primary: `#FF5636` (orange QL) → `Host.seedColor` + `color.primary`.

| Role | Use |
| --- | --- |
| `primary` / `onPrimary` | Filled buttons, active tab tint (orange) |
| `primaryContainer` / `onPrimaryContainer` | Hero spend / tonal orange-tinted surfaces |
| `secondary` / `secondaryContainer` | Sky technical accents, softer chips |
| `error` / `errorContainer` / `onErrorContainer` | Decline, blocked, danger |
| `tertiaryContainer` / `onTertiaryContainer` | Warn / “needs you” (digest, expiry) |
| `surface` | Navy screen background |
| `surfaceContainer*` | Cards / nested surfaces on navy |
| `onSurface` / `onSurfaceVariant` | Paper body / sky meta |
| `outline` / `outlineVariant` | Borders / dividers on dark |

Success (`ok`) is a product extension for “approved / running” — not a core M3 role; keep it in `color.ok*` and use sparingly.

## Shape & type

- Corners: `shape.xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `full` pill  
- Type: M3-ish scale in `type` (`headline`, `title`, `body`, `label`, `meta`) — system UI fonts (no custom TTF gate)

## Accessibility

- Prefer role pairs for contrast (M3 builds ~3:1+ for containers).  
- Icon-only controls need `accessibilityLabel` / visible text.  
- Touch targets ≥ 48dp (Android) / 44pt (iOS).

## References

- https://m3.material.io/  
- https://m3.material.io/styles/color/roles  
- https://m3.material.io/styles/icons/applying-icons  
- `LOCAL.md` — fixture / offline workflow  
- `PERFORMANCE.md` — no Material Symbols TTF on Android/web Metro stubs  
