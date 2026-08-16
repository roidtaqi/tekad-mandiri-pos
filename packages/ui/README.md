# `@kastur/ui`

Shared, brand-neutral visual primitives for Kastur Back Office and Kastur POS.
This package owns presentation and interaction foundations only. It does not own
business rules, permissions, domain statuses, navigation policy, or screen
workflows.

## Stylesheet and host contract

Import primitives from the package root. The root entry point loads the shared
stylesheet once; there is intentionally no public stylesheet subpath:

```ts
import { Button, Text } from "@kastur/ui";
```

The top-level element rendered by each application uses `ks-root`:

```tsx
<div className="ks-root">{app}</div>
```

The shared stylesheet removes the browser body margin and gives
`html`, `body`, and `#root` a usable minimum size. `ks-root` supplies the
application typography, foreground, background, and scoped base behavior.

Set theme and brand attributes on `document.documentElement`, rather than only
on a nested React node. Radix portals render under `body` by default; placing
the attributes at the document boundary keeps portalled dialogs and tooltips on
the same token theme as the application. The shared Dialog and Tooltip portal
content applies `ks-root` itself. A custom portal container is valid if it is
inside a `ks-root` and inherits those document-level attributes.

## Token layers

The cascade order is fixed and declared in every stylesheet:

```text
ks-primitive → ks-semantic → ks-component → ks-brand
```

- `ks-primitive` contains raw neutral/accent/status palettes, the type scale,
  the four-pixel spacing scale, radii, border widths, shadows, z-indexes,
  motion, control dimensions, and breakpoint reference values.
- `ks-semantic` maps those values to stable meanings such as canvas, surface,
  primary text, strong border, primary action, and status foreground.
- `ks-component` contains aliases and the `.ks-*` component contracts.
- `ks-brand` is the opt-in override seam. It may change brand presentation but
  cannot change component behavior or status meaning.

Feature code consumes semantic/component tokens and public primitives. It must
not use raw palette tokens such as `--ks-color-neutral-500` or hardcode white,
black, or a named hue.

The breakpoint tokens (`--ks-breakpoint-sm` through
`--ks-breakpoint-2xl`) are documentation/reference values. CSS custom
properties cannot be used directly in media-query conditions, so matching
literal media queries are intentionally present in the stylesheet.

## Theme and brand seam

Light is the default. Dark is explicit and opt-in:

```ts
document.documentElement.dataset.kasturTheme = "dark";
```

No operating-system preference automatically changes Kastur's theme. Feature
components remain dark-ready because they only consume semantic tokens.

A future brand opts into the stable seam and supplies only the values it owns:

```css
html[data-kastur-brand="example"] {
  --ks-brand-accent: #2457c5;
  --ks-brand-accent-hover: #1d469f;
  --ks-brand-accent-strong: #173879;
  --ks-brand-accent-contrast: #ffffff;
  --ks-brand-accent-subtle: #eef4ff;
  --ks-brand-accent-muted: #dbe8ff;
  --ks-brand-focus-ring: #2457c5;
}
```

```ts
document.documentElement.dataset.kasturBrand = "example";
```

Brand tokens are intentionally optional. The neutral Kastur defaults remain
complete without the attribute.

## Public primitive inventory

M0-004 exports the following shared primitives from `@kastur/ui`:

- Typography: `Heading` and `Text`, each with an opt-in tabular-numeric mode.
- Layout: `Container`, `Stack`, `Inline`, `Surface`, `Card`, and `Divider`.
- Actions: `Button` and `IconButton`.
- Forms: `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`,
  `Radio`, and `Switch`.
- State and feedback: `Badge`, `SeverityBadge`, `Alert`, `Spinner`, `Skeleton`,
  and `EmptyState`.
- Data: `TableWrapper`, `Table`, `TableHeader`, `TableBody`, `TableRow`,
  `TableHead`, and `TableCell`.
- Overlay: `Dialog`, `DialogFooter`, `DialogClose`, and `Tooltip`.

These primitives deliberately stay small. POS-only concepts such as a cart
line, scanner capture, quick cash, or payment panel, and Back Office concepts
such as a pricing decision panel or integrity comparison, remain app/domain
components. A generic badge may render a semantic tone; the owning feature is
responsible for mapping a business state to that tone and its Bahasa Indonesia
label.

## Accessibility contract

- Every field has a persistent semantic label; a placeholder is never its only
  label.
- Interactive controls retain a visible `:focus-visible` treatment. Do not
  remove it without an equivalent replacement.
- Touch-critical actions use a minimum `44 × 44px` hit target. A visually small
  icon may sit inside that larger interactive area.
- Status and severity always include visible text and, where useful, an icon;
  color is never the only signal.
- Loading controls expose `aria-busy`; decorative spinners are hidden from the
  accessibility tree while adjacent text or a live region announces progress.
  Button content stays in layout while loading so its width remains stable.
- Critical alerts default to `role="alert"`. Other alert content stays static
  unless the caller deliberately selects a live-region role for a dynamic
  update. Permission failures, conflicts, and data-loss risks must not be
  communicated only by a transient toast.
- Tables retain native table semantics. Interactive rows need an actual link or
  button for keyboard activation rather than click handling on a `tr` alone.
  `TableWrapper` requires a concise accessible label for its keyboard-scrollable
  region.
  The selected-row style is only a visual companion; application UI must expose
  selection with a labeled checkbox or equivalent text, not color alone.
- Motion is functional and restrained. `prefers-reduced-motion` reduces all
  motion within `ks-root`, and no state depends on animation.
- Dialog and Tooltip wrappers preserve Radix labels, descriptions, keyboard
  behavior, focus management, and portal semantics.

## Why Radix is used selectively

Dialog and Tooltip have nontrivial focus, escape-key, keyboard, ARIA, layering,
and portal behavior. Radix supplies those accessibility mechanics while Kastur
owns the public wrapper API, Bahasa Indonesia copy, semantic tokens, and
`.ks-*` appearance. Simple controls continue to use native HTML whenever native
semantics are sufficient. This keeps accessibility behavior dependable without
letting a third-party visual system become Kastur's design authority.

`Drawer` is intentionally deferred. Its responsive placement and task use vary
between POS and Back Office, and M0-004 does not need to invent those screen
decisions. A future Drawer may reuse the same Radix dialog mechanics after a
screen specification fixes its behavior.

`Sidebar` and `Breadcrumb` are also deferred until the application-shell and
routing slices define their real navigation behavior. `Container`, `Stack`,
and `Inline` provide layout foundations without smuggling a final shell into
M0-004.

## Development showcase

The Back Office development server exposes a development-only `/__ui`
showcase. Use it to review a representative primitive and state set, focus
treatments, light/dark tokens, and narrow/wide behavior without adding a
business screen. The route must not be treated as production navigation or as
an application feature.

Before accepting a visual-foundation change, review `/__ui` with keyboard-only
navigation, at a narrow viewport, at a desktop viewport, in both themes, and
with reduced motion enabled. Automated type, unit, boundary, and build checks
remain required; the showcase complements rather than replaces them.
