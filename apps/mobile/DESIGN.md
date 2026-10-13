# PhoneApprove design system

**System:** [Material Design 3](https://m3.material.io/)  
**Visual reference:** ClawQL Cloud console + brand mark (navy field, orange **Q**)  
**Generator:** [`@material/material-color-utilities`](https://www.npmjs.com/package/@material/material-color-utilities) `themeFromSourceColor`  
**Primary seed:** Console navy `#12182b` → blue chrome / surfaces / selection  
**Action accent:** Brand orange `#FF5636` → filled CTAs only  
**Default scheme:** **Light**  
**Native:** `@expo/ui` Host → `seedColor={color.seed}` (blue), `colorScheme="light"`

## Palette intent

| Role | Color | Use |
| --- | --- | --- |
| Primary | Blue from navy | Tabs, selection, filter chips, links, default tonal plates |
| Secondary | Cool blue-gray | Default icon bubbles, soft chips |
| Accent | Orange | **Actions** — Sign in, Approve, Add, primary filled buttons |
| Warn | Amber | “Needs you” / caution (not orange) |
| Error | Red | Decline / blocked / delete |

Do **not** paint surfaces, cards, and icons in orange tints. Orange is the Q — used when the user commits an action.

## What went wrong before (don’t repeat)

- Hand-rolled dark navy + muddy terracotta containers  
- Orange as MCU primary → peach surfaces + coral cards + rust buttons (three shades of orange)  
- Painting every card/icon with `primaryContainer` / accent containers  
- Hard borders instead of **surface container** tones  

## Color roles (pairs only)

| Role | Use on PhoneApprove |
| --- | --- |
| `surface` | Screen background |
| `surfaceContainerLowest` → `Highest` | Cards / nested plates (tonal depth, **no** heavy border) |
| `onSurface` / `onSurfaceVariant` | Body / meta |
| `primary` / `onPrimary` | Active tab, selected chips, blue filled controls |
| `primaryContainer` / `onPrimaryContainer` | Icon bubbles (seed blue, app-wide) + one standout plate per screen |
| `secondaryContainer` / `onSecondaryContainer` | Rare secondary plates only |
| `accent` / `onAccent` | Filled action CTAs (Approve, Sign in, …) |
| `accentContainer` / `onAccentContainer` | Rare orange tonal highlight (brand mark, not every card) |
| `warn*` | Needs-you / caution |
| `error*` | Decline / blocked / delete |

Regenerate tokens:

```bash
node scripts/generate-m3-theme.mjs
```

## Component mapping (M3 + brand)

- **Filled action button** → `accent` + `onAccent` (orange)  
- **Selected filter chip** → `primary` + `onPrimary` (blue)  
- **Outlined button** → outline + `primary` label  
- **Card** → `surfaceContainer*` / rare `primaryContainer`, corner `shape.lg` (16)  
- **List leading icon** → `IconBubble` on `secondaryContainer` by default  
- **Navigation bar** → `surfaceContainerLowest`, active icon `primary`  

## References

- https://m3.material.io/styles/color/roles  
- https://m3.material.io/styles/color/system/how-the-system-works  
- https://developer.android.com/design/ui/mobile/guides/styles/color  
- `apps/dashboard/src/styles/tailwind.css` (`.managed` console tokens)  
