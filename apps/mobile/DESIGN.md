# PhoneApprove design system

**System:** [Material Design 3](https://m3.material.io/)  
**Generator:** [`@material/material-color-utilities`](https://www.npmjs.com/package/@material/material-color-utilities) `themeFromSourceColor` (same as [Material Theme Builder](https://m3.material.io/blog/announcing-material-theme-builder))  
**Primary seed:** ClawQL orange `#FF5636`  
**Secondary palette:** ClawQL navy `#081133` (MCU mono-seed collapses `secondaryContainer` onto `primaryContainer` for this orange — navy keeps hierarchy)  
**Default scheme:** **Light** (readable for approval/diff work)  
**Native:** `@expo/ui` Host → Android M3 Compose / iOS SwiftUI, `seedColor={color.seed}`, `colorScheme="light"`

## What went wrong before (don’t repeat)

- Hand-rolled dark navy + muddy terracotta “containers” that ignored M3 tonal steps  
- Painting whole cards and every icon bubble with `primaryContainer`  
- Drawing hard borders for hierarchy instead of **surface container** tones  
- Forcing `colorScheme="dark"` while tokens were light (or vice versa)  

## Color roles (use these pairs only)

| Role | Use on PhoneApprove |
| --- | --- |
| `surface` | Screen background |
| `surfaceContainerLowest` → `Highest` | Cards / nested plates (tonal depth, **no** heavy border) |
| `onSurface` / `onSurfaceVariant` | Body / meta on any surface |
| `primary` / `onPrimary` | Filled CTAs, active tab tint |
| `primaryContainer` / `onPrimaryContainer` | **One** standout plate per screen (e.g. spend hero) + rare brand icons |
| `secondaryContainer` / `onSecondaryContainer` | Default icon bubbles, soft chips (navy tint) |
| `tertiaryContainer` / `onTertiaryContainer` | “Needs you” / warn |
| `error*` | Decline / blocked / delete |

Regenerate tokens:

```bash
node scripts/generate-m3-theme.mjs
```

## Component mapping (M3)

- **Filled button** → `primary` + `onPrimary`  
- **Outlined button** → outline + `primary` label (default `@expo/ui` outlined)  
- **Card** → `surfaceContainer` / `surfaceContainerLow`, corner `shape.lg` (16), border optional `outlineVariant` at most  
- **List item leading icon** → `IconBubble` on `secondaryContainer` by default  
- **Navigation bar** → `surfaceContainerLowest`, active icon `primary`  

## References

- https://m3.material.io/styles/color/roles  
- https://m3.material.io/styles/color/system/how-the-system-works  
- https://developer.android.com/design/ui/mobile/guides/styles/color  
