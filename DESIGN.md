# Design System - Co-Create

## Overview

A minimalist black and white design philosophy with sharp, hard cornered aesthetics. The interface is deliberately colorless except for royal blue accents used sparingly at maximum 50% opacity. Geometric forms dominate the composition.

---

## Typography

### Primary Font: Inter (Bold/Black weights)
- **Headers**: `Inter Tight Bold` or `Inter Black`
  - Sharp x-height with condensed proportions
  - No curve softening in letterforms
  - Used for all headings (H1-H6), section titles, and callouts
- **Body**: `Inter Regular` or `JetBrains Mono`
  - Clean, highly legible without decorative elements
  - Monospaced variant available for code/tool descriptions

### Font Stacking
```css
/* Headers */
font-family: 'Inter Tight', 'Inter', sans-serif;
font-weight: 800 to 900;

/* Body Text */
font-family: 'Inter', 'JetBrains Mono', monospace;
font-weight: 400;
```

---

## Color Palette

### Core Colors (Black & White Only)
| Name | Value | Usage |
|------|-------|-------|
| `bg-primary` | `#FFFFFF` | Background surfaces |
| `bg-secondary` | `#FAFAFA` | Subtle surface variation |
| `surface-dark` | `#1A1A1A` | Inverted dark areas |
| `text-primary` | `#000000` | Primary text |
| `text-muted` | `#666666` | Secondary text, labels |

### Accent Color: Royal Blue
| Name | Hex | Opacity Range | Usage |
|------|-----|---------------|-------|
| `blue-royal` | `#4169E1` | 20% - 50% max | All interactive elements, glows, highlights |

**Important**: Royal blue must never exceed 50% opacity in any context. This creates a ghostly, subtle presence that doesn't dominate the monochrome foundation.

---

## Shape Language

### Corners
- **All hard corners (0px border-radius)**
- No rounded buttons, no rounded cards, no soft edges anywhere
- Sharp 90-degree angles throughout UI
- This creates a brutalist, industrial aesthetic

### Borders
| Element | Width | Color |
|---------|-------|-------|
| Cards/Panels | 1px | `#E0E0E0` |
| Buttons (default) | 1px | `#333333` |
| Tool cards | 2px solid | Royal Blue at 30% |

### Spacing System
```css
--space-xs: 4px;   /* Tight gaps */
--space-sm: 8px;   /* Minimal spacing */
--space-md: 16px;  /* Default spacing */
--space-lg: 24px;  /* Section breaks */
--space-xl: 32px;  /* Major sections */
```

---

## Layout Philosophy

### Grid System
- 12-column grid with 24px gutters
- All containers have hard rectangular boundaries
- No padding rounding

### Container Defaults
| Type | Max Width | Padding |
|------|-----------|---------|
| Narrow (sidebar) | 300px | 16px |
| Standard | 800px | 24px |
| Full page | 1400px | 40px top/bottom |

---

## Commentary Elements

### Placement & Rotation
- **90-degree clockwise rotation** (vertical reading)
- Positioned on left or right edges of container
- Maximum height: 35% of parent viewport
- Float from top edge, anchored to side

### Styling
```css
.commentary {
  position: absolute;
  top: var(--space-md);
  /* Left or right positioning */
  
  background: #FAFAFA;
  border: 1px solid #333333;
  padding: var(--space-sm);
  
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
```

### Content Purpose
Commentaries serve three functions:
1. **Feature Descriptions**: What each tool does
2. **Usage Instructions**: How to invoke the tool
3. **Decorative Accents**: Pure aesthetic presence in colorless interface

### Example Commentary Text
```
"Call /invoke with --json flag
to return structured output."
```

---

## Starting Screen (Landing)

### Composition

```
┌─────────────────────────────────────────┐
│                                          │
│                                         ║  [Royal Blue glow]
│    CO-CREATE                            ║  emanating from bottom
│                                         ║
│   Design in a way you understand...     ║
│                                          │
│              [START CREATING]           │
│              (1px border, hard         │
│               corners, black text)     │
│                                          │
└─────────────────────────────────────────┘

Visual Hierarchy:
1. Site name in large bold Inter Black
2. Subtitle at 40% header weight
3. Button centered, sharp rectangular
4. Bottom glow: royal blue @ 30% opacity, radial gradient fading upward
```

### Styling Details

#### Site Name
- `font-size: clamp(3rem, 5vw, 6rem)`
- `line-height: 1`
- `letter-spacing: -0.02em`
- `color: #000000`

#### Subtitle  
- `font-size: clamp(1.2rem, 2vw, 1.8rem)`
- `font-weight: 400`
- `line-height: 1.5`
- `color: #333333`

#### Button
```css
button.start-create {
  background: transparent;
  border: 1px solid #000000;
  padding: 16px 32px;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  
  transition: border-color 0.2s ease;
}

button.start-create:hover {
  border-color: rgba(65, 105, 225, 0.5); /* Royal blue at 50% on hover */
}
```

#### Bottom Glow (Only Color Element)
```css
.bottom-glow {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 80px;
  background: radial-gradient(
    ellipse at center,
    rgba(65, 105, 225, 0.3) 0%,
    rgba(65, 105, 225, 0.05) 40%,
    transparent 70%
  );
  filter: blur(12px);
}

/* Max opacity is 50% (0.3 RGBA above with blur = ~0.1 effective) */
```

---

## Component Library

### Buttons
| Type | Background | Border | Text Color | Hover Effect |
|------|------------|--------|------------|--------------|
| Primary | Transparent | Black 1px | Black | Blue border at 50% |
| Secondary | White | Gray 1px | Black | Gray 40% flash |
| Tool Invoke | Royal Blue @30% | None | Black | Opacity →45% |

### Cards (Tools/Features)
```css
.tool-card {
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  padding: 24px;
  
  &:hover {
    border-color: rgba(65, 105, 225, 0.3); /* Royal Blue @30% */
  }
}

.tool-card.active {
  border: 2px solid rgba(65, 105, 225, 0.3); /* Active state */
}
```

### Tool Invocations
- Display as sharp rectangular blocks
- Background: Royal Blue at 30% opacity
- Text: Black, uppercase, small (white on a 30% blue tint fails contrast)
- Hard corners throughout
- Example: `/invoke src/ai/tools --json`

---

## Shadows & Depth

Shadows are **flat and hard** to maintain the minimalist aesthetic:

```css
.shadow-hard {
  box-shadow: 4px 4px 0px rgba(0, 0, 0, 1); /* Solid offset */
}
```

No blurred shadows, no soft depth cues. All elevation comes from border weight changes or solid shadow blocks.

---

## Animation Principles

### Timing
- **Fast**: 200ms for interactions
- **Standard**: 300ms for state changes
- **Slow**: 600ms only for dramatic reveals

### Easing
- `cubic-bezier(0.4, 0, 0.2, 1)` - Sharp start, quick settle
- No elastic or bouncy animations

### Motion Rules
1. Content scales in from hard edges (no blur)
2. Tool cards slide up with no fade delay
3. Commentary elements appear with a sharp pop-in
4. All motion maintains rectangular boundaries

---

## Responsive Behavior

### Breakpoints
- Desktop: > 1200px
- Tablet: 800px - 1200px  
- Mobile: < 800px

### Adaptive Elements
- Commentary on mobile: Stack below content instead of sides
- Typography scales but maintains sharp weights
- Grid collapses to single column, borders remain sharp

---

## Accessibility Considerations

- All text contrast ratios > 7:1 on white backgrounds
- Royal blue elements at 50% opacity still pass AA standards when paired with black/white
- Focus states use a solid 2px royal blue outline (`outline-ring`, offset 2px), no border-radius — the one place royal is used at full strength, because a focus indicator needs ≥3:1 contrast (WCAG 1.4.11 / 2.4.13)
- Reduced motion mode respects system preferences (animations reduce to instant state changes)

---

## File Conventions

### Design Tokens Location
The live tokens are the `[data-theme="cocreate"]` block in `src/themes.css`
(shadcn-style `--color-*` names, `--radius: 0`) plus `--color-royal` and the
`--font-display/sans/mono` families in the `@theme` block of `src/styles.css`.
In Tailwind use `bg-background`, `text-foreground`, `border-border`,
`font-display`, and royal blue only with an opacity modifier (`border-royal/50`,
`bg-royal/20`); focus indicators use `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. The values below are the reference palette:

```css
:root {
  /* Colors */
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --surface-dark: #1A1A1A;
  --text-primary: #000000;
  --text-muted: #666666;
  --blue-royal: #4169E1;
  
  /* Typography */
  --font-header: 'Inter Tight', 'Inter', sans-serif;
  --font-body: 'Inter', 'JetBrains Mono', monospace;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}
```

### Utility Class Naming (Tailwind-style)
- `text-sharp` - Headers with Inter Tight bold
- `bg-monochrome` - White or near-white backgrounds
- `border-hard` - Sharp 1px borders
- `blue-glow` - Royal blue at ≤50% opacity
- `commentary-right` - Rotated commentary block, right side
- `commentary-left` - Rotated commentary block, left side

---

## Do's and Don'ts

### ✅ DO
- Use hard corners everywhere
- Keep royal blue subtle (≤50% opacity)
- Let black and white dominate the interface
- Place commentary as decorative elements or info callouts
- Scale typography with tight tracking for headers

### ❌ DON'T
- Never use rounded corners anywhere
- Don't exceed 50% opacity on any blue element
- Avoid gradients except the bottom glow on landing screen
- No drop shadows with blur radius > 0px
- Don't soften the bold font weights to regular or medium

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Nov 2026 | Initial design system created |
