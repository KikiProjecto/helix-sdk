# DESIGN.md — Visual Design Specification
## Helix SDK: Monitoring Dashboard & Documentation Site

---

## 0. DESIGN PHILOSOPHY & CONSTRAINTS

### Core Aesthetic Direction

Helix SDK is developer infrastructure. The design must communicate **precision, authority, and system intelligence** — not marketing hype. The audience is Solana engineers who can smell a template from 100 meters.

The visual language draws from:
- **Reference 1 (Spexigon)**: Bold statement typography over real photography. Strong hierarchy. The type IS the product announcement — not decoration on top of it. No wasted space.
- **Reference 2 (Planet Lizard)**: Total conviction. One strong color choice. Giant, fearless type. The background doesn't try to be clever — it just gets out of the way of the content.
- **Reference 3 (Sovryn)**: Depth and scale. Dark groundwork that lets the main visual breathe. Orange used as precision accent, not palette. Real 3D geometry.
- **Reference 4 (ChainGPT)**: Technical grid overlay as texture. Dark engineering feel. The product (a robot/tool) is the visual centerpiece — not a headline about the product.

**Synthesized direction for Helix:**
The hero section IS the product in action. A live-rendered terminal / RPC health panel showing real numbers (latency, success rate, pool status) with minimal chrome. The dashboard is the proof — users see it working before reading what it does. Bold monospace numbers. Surgical color use. Grid texture that implies engineering rigor without screaming about it.

### The Signature Element

**A glowing live RPC health matrix.** The hero section features a 3-column panel showing 3 RPC endpoints with real-time pulsing latency bars. On load, the numbers tick from 0 to real values. One endpoint briefly turns amber (simulating degradation) then Helix routes around it in 80ms and it goes green again. This animation plays on loop, showing the product working. No user needs to read the explanation — they watch it happen.

---

## 1. ABSOLUTE DESIGN RULES — NEVER VIOLATE

### ❌ STRICTLY FORBIDDEN (AI Slop Detection — any of these = full redesign)

- Ugly gradient text (CSS `background-clip: text` rainbow washes)
- Purple-to-cyan or purple-to-pink gradient backgrounds on body sections
- "Glassmorphism" used as a crutch (blur + border + 20% opacity everywhere)
- Neon glow effects on text (text-shadow neon bleed)
- Spinning globe / 3D blockchain animations
- Particle.js or `particles.js` type confetti backgrounds
- Stock photo business people shaking hands
- "Launch App" button with glow-on-hover rainbow border
- Dark mode card with `rgba(255,255,255,0.05)` background everywhere
- `border: 1px solid rgba(255,255,255,0.1)` as the only design decision
- Hero copy: "Unleash", "Power", "Supercharge", "Next-generation", "Revolutionize"
- Progress bars that are just decorative
- Crypto "moon" / "rocket" / "diamond hands" iconography
- Text with multiple color stops per word

### ✅ REQUIRED (Non-Negotiable Mandates)

- Every number displayed is a real metric or clearly marked [DEMO]
- Color is used for state (healthy/degraded/unhealthy), not decoration
- Typography carries the personality — color accent is secondary
- Motion serves function: shows data updating, system responding, state changing
- White space is designed, not leftover
- The Solana color identity (#9945FF, #14F195) used sparingly as precise accents — not as gradients
- All interactive elements have keyboard focus states
- Reduced motion respected (`@media (prefers-reduced-motion: reduce)`)

---

## 2. COLOR SYSTEM

### Core Palette

```css
:root {
  /* Base surfaces — the ground */
  --void: #07070D;           /* True black, main background */
  --surface-1: #0F0F1A;     /* Cards, panels */
  --surface-2: #161626;     /* Elevated cards, hover states */
  --surface-3: #1E1E30;     /* Active states, selected items */
  
  /* Grid & borders — structural lines */
  --border-subtle: #1A1A2E;  /* Hairline borders between sections */
  --border-default: #252540; /* Card borders, dividers */
  --border-strong: #3D3A60;  /* Active input borders, emphasized separators */
  
  /* Text hierarchy */
  --text-primary: #F0EEFF;   /* Headlines, active labels */
  --text-secondary: #9492B0; /* Body copy, descriptions */
  --text-muted: #55547A;     /* Placeholders, timestamps, disabled */
  --text-code: #C5C3E8;      /* Monospace values, addresses */
  
  /* Brand — Solana identity, used surgically */
  --solana-purple: #9945FF;  /* Primary actions, links, brand mark */
  --solana-green: #14F195;   /* Success state, health: good, confirmed tx */
  
  /* State system — semantic only, never decorative */
  --state-healthy: #14F195;  /* Endpoint up, tx confirmed */
  --state-degraded: #F59E0B; /* Slow, high latency, 429 recovering */
  --state-unhealthy: #F43F5E;/* Endpoint down, tx dropped, error */
  --state-pending: #9945FF;  /* In-flight, waiting for confirmation */
  --state-unknown: #55547A;  /* No data yet */
  
  /* Chart fill — subtle, desaturated */
  --chart-purple: rgba(153, 69, 255, 0.15);
  --chart-green: rgba(20, 241, 149, 0.12);
  --chart-amber: rgba(245, 158, 11, 0.15);
  --chart-red: rgba(244, 63, 94, 0.12);
}
```

### Color Usage Rules

**Purple (#9945FF):** Only for: primary CTA buttons, active links, the Helix brand mark, pending transaction state dots.

**Green (#14F195):** Only for: healthy endpoint indicators, confirmed transaction checkmarks, positive metric trends.

**Amber (#F59E0B):** Only for: degraded state indicators, warning alerts, latency above threshold.

**Red (#F43F5E):** Only for: unhealthy endpoints, dropped transactions, error states. Never used decoratively.

**If a use case doesn't map to a semantic state → use text hierarchy, not color.**

---

## 3. TYPOGRAPHY SYSTEM

### Typeface Stack

```css
/* DISPLAY — for headlines, hero text, large numbers */
/* Space Grotesk: technical character, slightly condensed, variable weight */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
--font-display: 'Space Grotesk', system-ui, sans-serif;

/* BODY — for copy, descriptions, UI labels */
/* Inter: neutral, readable, near-universal in dev tooling */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
--font-body: 'Inter', system-ui, sans-serif;

/* MONO — for all numbers, addresses, latency values, code */
/* JetBrains Mono: the default for developer tooling, ligatures for code */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

### Type Scale

```css
/* Display — hero section metrics, big numbers */
--text-display-xl: clamp(3.5rem, 8vw, 7rem);   /* "99.8%" health score hero */
--text-display-lg: clamp(2.5rem, 5vw, 4.5rem);  /* Section titles */
--text-display-md: clamp(1.8rem, 3vw, 2.75rem); /* Card headlines */

/* UI — labels, body, captions */
--text-body-lg: 1.125rem;   /* Feature descriptions */
--text-body-md: 1rem;       /* Standard body copy */
--text-body-sm: 0.875rem;   /* Secondary info */
--text-caption: 0.75rem;    /* Timestamps, sub-labels */
--text-micro: 0.6875rem;    /* Status badges, endpoint tags */

/* Code/Mono — metrics, values, addresses */
--text-mono-lg: 1.5rem;     /* Big metric numbers */
--text-mono-md: 1rem;       /* Latency values, tx signatures */
--text-mono-sm: 0.8125rem;  /* Addresses, hashes */
```

### Typography Treatment Rules

- **Headlines**: Space Grotesk, weight 600-700, tracking -0.02em (slightly tight)
- **Big numbers** (latency, uptime %): JetBrains Mono, weight 600, tabular nums
- **Body copy**: Inter, weight 400, line-height 1.6
- **Code samples**: JetBrains Mono, weight 400, 0.95em size
- **Status badges**: Space Grotesk, weight 500, uppercase, letter-spacing 0.05em

---

## 4. SPACING & LAYOUT SYSTEM

### Grid

```css
/* 8pt base grid */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
--space-20: 5rem;    /* 80px */
--space-24: 6rem;    /* 96px */
--space-32: 8rem;    /* 128px */
```

### Layout Structure (Dashboard)

```
┌────────────────────────────────────────────────────────────────────┐
│ NAV: Logo + links + "View on GitHub" CTA              [84px height] │
├──────────────────────────────────┬─────────────────────────────────┤
│                                  │                                  │
│   HERO: "Resilient by default"   │  LIVE RPC TERMINAL PANEL        │
│                                  │                                  │
│   Large display text             │  ┌──────┬──────────┬─────────┐  │
│   Subhead copy                   │  │ENDPT │ LATENCY  │ STATUS  │  │
│   [Get Started] [View Docs]      │  ├──────┼──────────┼─────────┤  │
│                                  │  │ H1   │  47ms ██ │ ● GOOD  │  │
│                                  │  │ H2   │  92ms ████│● GOOD  │  │
│   58vw column                    │  │ H3   │  --  ░░░ │ ⚠ DGRDD│  │
│                                  │  │ H3→H1│ FAILOVER  │ ✓ DONE │  │
│                                  │  └──────┴──────────┴─────────┘  │
│                                  │                                  │
│                                  │  42vw sticky panel              │
├──────────────────────────────────┴─────────────────────────────────┤
│ SECTION: Pool Health Stats [3-column metric cards]                  │
│                                                                     │
│  [99.8% Uptime]    [47ms P50 Latency]    [0 Dropped Transactions]  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION: How Helix Works [horizontal flow diagram, left-scrollable] │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION: Features [asymmetric grid - alternating 60/40 splits]      │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION: Quick Start code block [syntax highlighted terminal]       │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION: Observability preview [screenshot of Datadog dashboard]    │
├─────────────────────────────────────────────────────────────────────┤
│ FOOTER: Links, GitHub, license, Superteam Ukraine credit            │
└─────────────────────────────────────────────────────────────────────┘
```

### Dashboard App Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ SIDEBAR (220px fixed)         │ MAIN CONTENT (flex 1)              │
│                               │                                    │
│  ⬡ HELIX                     │ ┌─────────────────────────────────┐│
│                               │ │ POOL STATUS GRID                ││
│  ● Overview                  │ │                                 ││
│  ○ Endpoints                 │ │  [H1 ●] [H2 ●] [H3 ⚠] [+Add] ││
│  ○ Transactions              │ └─────────────────────────────────┘│
│  ○ Jito                      │                                    │
│  ○ Alerts                    │ ┌───────────────┐ ┌──────────────┐│
│  ○ Settings                  │ │ LATENCY CHART │ │ TX STREAM   ││
│                               │ │ (line chart)  │ │ (live feed) ││
│  ─────────────────           │ │               │ │             ││
│                               │ └───────────────┘ └──────────────┘│
│  POOL HEALTH                 │                                    │
│  ● 3 healthy                 │ ┌─────────────────────────────────┐│
│  ⚠ 1 degraded               │ │ ALERTS                          ││
│  ✕ 0 down                   │ │ [amber] H3 latency > 1500ms    ││
│                               │ └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. COMPONENT LIBRARY

### 5.1 Status Dot (Smallest Unit of State)

```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

/* Healthy — pulsing green */
.status-dot--healthy {
  background: var(--state-healthy);
  box-shadow: 0 0 0 0 rgba(20, 241, 149, 0.4);
  animation: pulse-green 2s ease-in-out infinite;
}
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(20, 241, 149, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(20, 241, 149, 0); }
}

/* Degraded — static amber */
.status-dot--degraded { background: var(--state-degraded); }

/* Unhealthy — fast red pulse */
.status-dot--unhealthy {
  background: var(--state-unhealthy);
  animation: pulse-red 0.75s ease-in-out infinite;
}
```

### 5.2 Metric Card

```
┌──────────────────────────────────┐
│ RPC LATENCY (P50)     [endpoint] │  ← label: --text-micro, uppercase
│                                  │
│  47 ms                           │  ← value: --text-mono-lg, --text-primary
│                                  │
│  ↓ 8ms from 1h ago    ● healthy  │  ← trend + status
│  ████████░░░░░░░ 47ms / 1500ms   │  ← capacity bar
└──────────────────────────────────┘

Card: background var(--surface-1), border var(--border-default)
Border-radius: 8px (not 16px — that's for apps, not dashboards)
Padding: 20px
No drop shadows — use borders only
```

### 5.3 Latency Sparkline

Mini line chart (60px height) showing last 60 data points:
- Line: 1.5px, `var(--solana-purple)` 
- Area fill: `var(--chart-purple)`
- No axes, no labels (space is a premium in cards)
- Hover: vertical line + tooltip with value + timestamp
- Built with Recharts `<ComposedChart>` + `<Area>` + `<Line>`

### 5.4 Live Transaction Feed

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRANSACTION STREAM                                    [pause/resume] │
├─────────────────────────────────────────────────────────────────────┤
│ ● 7xKm...4pQr   confirmed   47ms   Jito    0.000012 SOL    2s ago  │
│ ● 3bNp...9wXs   confirmed  120ms   RPC     0.000008 SOL    4s ago  │
│ ⚠ 2mYt...7kPl   retried    340ms   RPC     0.000015 SOL    6s ago  │
│ ● 8fRv...1nQa   confirmed   89ms   Jito    0.000010 SOL    8s ago  │
│ ✕ 5cSz...6vBn   dropped      —     —       —               12s ago │
│ ● 9hJw...2dMs   confirmed   55ms   Jito    0.000011 SOL   15s ago  │
└─────────────────────────────────────────────────────────────────────┘

Font: JetBrains Mono 0.8125rem
New items: slide-in from top with 200ms ease-out
Dropped items: row background tinted var(--chart-red)
Status icons: colored dots — no emoji
```

### 5.5 Pool Status Grid (Hero/Overview Component)

```
┌──────────────────────────────────────────────────────────────────┐
│ RPC POOL STATUS                           3 healthy · 1 degraded  │
├──────────┬────────────────┬────────────┬──────────┬─────────────┤
│ ENDPOINT │ STATUS         │ P50        │ P99      │ REQ/MIN     │
├──────────┼────────────────┼────────────┼──────────┼─────────────┤
│ Helius   │ ● HEALTHY      │  47ms      │  112ms   │  1,204      │
│ QuickNode│ ● HEALTHY      │  82ms      │  198ms   │  892        │
│ Triton   │ ⚠ DEGRADED    │ 1,847ms    │ 4,200ms  │  103        │
│ Public   │ ● HEALTHY      │  234ms     │  689ms   │  312        │
└──────────┴────────────────┴────────────┴──────────┴─────────────┘

Table: no background alternating rows (too zebra-stripy)
Use border-bottom: 1px solid var(--border-subtle) between rows
Degraded row: subtle amber left border (4px) + amber text on status
Click row → expand to show 24h latency chart below the row
```

### 5.6 Code Block (Documentation)

```
┌─────────────────────────────────────────────────────────────────────┐
│ TypeScript                                            [copy]  [run]  │
│ ─────────────────────────────────────────────────────────────────── │
│  import { createHelixClient } from '@helix-sdk/core';              │
│                                                                     │
│  const helix = createHelixClient({                                  │
│    endpoints: [                                                      │
│      'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',            │
│      'https://api.mainnet-beta.solana.com',                         │
│    ],                                                               │
│    jito: { enabled: true },                                         │
│  });                                                                │
└─────────────────────────────────────────────────────────────────────┘

Syntax theme: custom dark theme
Keywords: var(--solana-purple)
Strings: var(--state-healthy) — the green
Comments: var(--text-muted)
Numbers: var(--state-degraded) — amber
Background: #0B0B14 (1 step darker than surface-1)
Font: JetBrains Mono
Border-left: 3px solid var(--solana-purple) on first line for brand ID
```

### 5.7 Alert Banner

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠ Triton endpoint latency exceeded 1500ms threshold   [Dismiss] [→] │
└──────────────────────────────────────────────────────────────────────┘

Colors by severity:
  warning:  background: rgba(245, 158, 11, 0.08), border-left: 3px solid #F59E0B
  error:    background: rgba(244, 63, 94, 0.08),  border-left: 3px solid #F43F5E
  info:     background: rgba(153, 69, 255, 0.08), border-left: 3px solid #9945FF
Animation: slide-down from top of panel, 250ms ease-out
Auto-dismiss: info after 10s, warning never (require user action)
```

### 5.8 Navigation

```
MARKETING SITE NAV:
┌─────────────────────────────────────────────────────────────────────┐
│  ⬡ helix    Features   Docs   Observability   CLI           GitHub ↗│
└─────────────────────────────────────────────────────────────────────┘

- Height: 64px
- Background: rgba(7, 7, 13, 0.85) + backdrop-filter: blur(12px) [sticky]
- Border-bottom: 1px solid var(--border-subtle) on scroll (add via JS IntersectionObserver)
- Logo: Space Grotesk Bold, 18px — "⬡ helix" with hex icon before text
- Links: Inter 14px, var(--text-secondary), hover: var(--text-primary), transition 150ms
- GitHub CTA: outline button, 1px solid var(--border-default), hover: border-color: var(--solana-purple)
- NO hamburger menu for main breakpoints. Collapse to scrolling horizontal nav on mobile.
```

### 5.9 Primary CTA Button

```css
.btn-primary {
  background: var(--solana-purple);
  color: #FFFFFF;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.9375rem;
  padding: 12px 24px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background 150ms ease, transform 100ms ease;
}
.btn-primary:hover {
  background: #8035E8;   /* 10% darker, NOT a glow effect */
  transform: translateY(-1px);
}
.btn-primary:active {
  transform: translateY(0);
}
.btn-primary:focus-visible {
  outline: 2px solid var(--solana-purple);
  outline-offset: 3px;
}
/* NO: box-shadow glow. NO: gradient on hover. NO: scale transform > 1. */
```

---

## 6. MOTION & ANIMATION SYSTEM

### Animation Budget Rule
**Maximum 3 active animations on screen at any time.** Every animation has a purpose. No animation runs indefinitely without communicating information.

### Motion Tokens

```css
--transition-instant: 75ms ease;
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 400ms ease-out;
--transition-data: 600ms cubic-bezier(0.16, 1, 0.3, 1);  /* data reveals */
```

### Specific Motion Behaviors

**Page Load Sequence (marketing site):**
1. 0ms: Nav appears (opacity 0→1, 150ms)
2. 200ms: Hero text slides up (transform: translateY(24px)→0, 600ms cubic-bezier)
3. 600ms: Live terminal panel fades in (opacity 0→1, 400ms)
4. 800ms: Terminal data populates (numbers tick up from 0, stagger 50ms per row)
5. 1200ms: Demo degradation animation begins (Endpoint 3 → amber, failover → green)

**Metric Number Updates (dashboard):**
- When a latency value changes: `counter-up` animation, 400ms
- When status changes healthy→degraded: row background transitions over 300ms
- When failover fires: "FAILOVER" text flashes once (opacity pulse, 2 cycles, 600ms total)

**RPC Pool Status Dots:**
- Healthy: slow pulse (2s period, 0→6px box-shadow radius)
- Degraded: no animation (static amber)
- Unhealthy: fast pulse (0.75s period, agitated)

**Transaction Stream:**
- New item: slide in from top, 200ms ease-out
- Confirmed: checkmark draws in with SVG stroke animation, 300ms
- Dropped: row fades to red tint over 500ms, stays visible for 10s then fades out

**Scroll Animations (marketing site only):**
- Section entry: opacity 0→1 + translateY(16px)→0, 500ms
- Trigger: IntersectionObserver at 15% visibility threshold
- ONE animation per section entry, not element-by-element stagger

### Reduced Motion Override

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* Status dots: opacity 0.5/0.8/1.0 to show state without motion */
}
```

---

## 7. MARKETING SITE — SECTION-BY-SECTION SPEC

### Section 1: Hero

**Layout:** Two-column, 58/42 split on desktop. Stack on mobile.
**Left column:**
```
[LABEL: Space Grotesk 11px, uppercase, letter-spacing 0.1em, --text-muted]
Superteam Ukraine · Solana Infrastructure

[H1: Space Grotesk 700, clamp(3rem,6vw,5.5rem), --text-primary, tracking -0.03em]
RPC resilience.
Built into every
transaction.

[BODY: Inter 400, 1.125rem, --text-secondary, max-width 460px]
Helix SDK wraps @solana/web3.js with automatic failover, 
Jito MEV routing, dynamic fees, and OpenTelemetry metrics.
Your transactions land. Your users don't notice the infrastructure.

[CTA ROW: gap 12px]
[Get Started →]  [View Docs]
```

**Right column:** The live RPC health terminal (see §0 Signature Element)

**Background:** Pure `var(--void)`. No gradient. One subtle hexagonal grid texture at 4% opacity SVG pattern (`<pattern>` with hexagons, 30px wide, stroke: #FFFFFF, stroke-opacity: 0.04).

### Section 2: Stats Bar

```
Full-width band, background: var(--surface-1), border-top + bottom: var(--border-subtle)
Padding: 40px 0

┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│    99.8%         │     47ms         │      5            │    0             │
│    Uptime SLA    │    Avg P50       │    RPC Providers  │    Dropped Txs   │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

Numbers: JetBrains Mono 700, clamp(2.5rem,4vw,3.5rem), --text-primary
Labels: Inter 400, 0.875rem, --text-muted
Dividers: 1px solid var(--border-subtle) between columns
Counter animation on scroll-into-view: counts from 0 to final value, 1200ms
```

### Section 3: How It Works

Horizontal process diagram (desktop). Vertical stack (mobile).

```
[Build TX] → [Fee Simulation] → [Jito Routing] → [RPC Pool] → [Confirmation]
   │               │                  │               │              │
   └──────────────────────────────────────────────────────────────────┘
        "Helix handles every step between you and the blockchain"
```

Each step is a box with:
- Step number (JetBrains Mono, 11px, --text-muted)
- Icon (Phosphor Icons, 24px, --text-secondary)
- Label (Space Grotesk 600, 1rem, --text-primary)
- 1-line description (Inter 400, 0.875rem, --text-muted)
- Connector line: 1px dashed var(--border-default) between boxes

### Section 4: Features

Six feature cards in asymmetric grid: 2 large (60/40) + 4 small (25% each)

**Large card — RPC Failover:**
Shows the pool routing diagram as an SVG with arrows and colored nodes (no animation — static diagram is fine here)

**Large card — Jito MEV Protection:**
Shows a before/after comparison: without Helix (tx sandwich diagram) vs with Helix (bundle envelope icon)

**Small cards (4):** Dynamic Fees, OTel Metrics, TypeScript Types, Diagnostics CLI
Each: icon + headline + 2-line description

Card treatment: `var(--surface-1)`, `border: 1px solid var(--border-default)`, `border-radius: 8px`
Feature icon: Phosphor icon, 32px, `var(--solana-purple)` — the ONLY place purple appears as decoration

### Section 5: Quick Start

Full-width dark section with tabbed code block. Three tabs: npm install, Quick Start, Jito Config.

Tab style: text tabs (no background pill tabs — that's too app-like for a docs section)
Active tab: `border-bottom: 2px solid var(--solana-purple)`, text: `--text-primary`
Inactive: `--text-muted`, hover: `--text-secondary`

Alongside the code block: a minimal animated terminal showing `helix-diag check` command running with typed output.

### Section 6: Observability Preview

Mock screenshot of the monitoring dashboard with:
- Faint device frame (no browser chrome — just content)
- Real-looking metrics (not obviously fake)
- Caption: "Real-time monitoring dashboard — included with Helix SDK"
- Link to live demo

### Footer

```
┌────────────────────────────────────────────────────────────────────┐
│  ⬡ helix                                                           │
│  Open-source Solana infrastructure                                 │
│                                                                    │
│  SDK          Observability    Community                          │
│  Core         OpenTelemetry    GitHub                             │
│  Jito         Datadog          Discord                            │
│  Fees         Prometheus       Superteam Ukraine                  │
│  Wallet       Dashboard                                           │
│  CLI                                                              │
│                                                                    │
│  MIT License · Built for Superteam Ukraine Bounty                │
└────────────────────────────────────────────────────────────────────┘
Background: var(--surface-1)
No top border decoration. Simple.
```

---

## 8. DASHBOARD APP DESIGN

### 8.1 Sidebar

```
Width: 220px, fixed position
Background: var(--surface-1)
Right border: 1px solid var(--border-subtle)

Navigation items:
  Active: background var(--surface-2), left border 2px solid var(--solana-purple)
  Icon + label: Phosphor icons 18px + Inter 500 14px
  Gap between icon and label: 10px

Section header labels ("MONITORING", "CONFIGURE"):
  Space Grotesk 10px, uppercase, letter-spacing 0.08em, --text-muted
  Margin-bottom: 8px, margin-top: 24px

Pool health mini-summary at bottom of sidebar:
  Shows colored dot count: ● 3 healthy / ⚠ 1 degraded / ✕ 0 down
  Font: Inter 12px, --text-secondary
```

### 8.2 Dashboard Header

```
Height: 56px
Background: var(--surface-1)
Border-bottom: 1px solid var(--border-subtle)
Content: Page title (Space Grotesk 600, 18px) + breadcrumb + [Refresh] button + [Add Endpoint] button
Right: last updated timestamp (JetBrains Mono 12px, --text-muted)
```

### 8.3 Charts

All charts use Recharts with these base settings:
- Background: transparent
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)"`
- Tooltip: custom component, background `var(--surface-2)`, border `var(--border-default)`
- Axis ticks: `var(--text-muted)`, font Inter 11px
- Colors: from semantic state system (purple for pool metrics, green for success, red for errors)
- No legend labels that just repeat the chart title
- Responsive: all charts use `<ResponsiveContainer width="100%" height={...}>`

---

## 9. CLI DESIGN (helix-diag)

The CLI must look like a professional developer tool, not a colorful toy.

```
Terminal output style for helix-diag check:
─────────────────────────────────────────────────────
  HELIX DIAGNOSTICS · Endpoint Health Check
─────────────────────────────────────────────────────
  Endpoint: https://mainnet.helius-rpc.com
  Network:  mainnet-beta
  Checks:   10 requests

  ┌───────────┬──────────┬─────────────────────────┐
  │ Metric    │ Value    │ Rating                  │
  ├───────────┼──────────┼─────────────────────────┤
  │ Min       │  39ms   │ ████████████████ FAST   │
  │ P50       │  47ms   │ ████████████████ FAST   │
  │ P95       │  89ms   │ ████████████░░░░ GOOD   │
  │ P99       │ 112ms   │ ████████░░░░░░░░ OK     │
  │ Max       │ 203ms   │ ████████░░░░░░░░ OK     │
  │ Errors    │  0/10   │ ●●●●●●●●●●●●●●●● CLEAN  │
  └───────────┴──────────┴─────────────────────────┘

  Status: ● HEALTHY
  Current slot: 287,483,920
  Recommendation: Ready for production use.
─────────────────────────────────────────────────────
Colors: chalk/Ink for colors. Green bars for fast, amber for ok, red for slow.
Tables: cli-table3
Spinners: ora with dot spinner style
NO emoji other than the ● status dots
```

---

## 10. DOCUMENTATION SITE

If a separate docs site is built (using Nextra or Mintlify):
- Base color scheme: same as marketing site
- Sidebar: categorized by package (`@helix-sdk/core`, `@helix-sdk/jito`, etc.)
- Code examples: all runnable via StackBlitz embed or copy-to-clipboard
- API Reference: auto-generated from JSDoc via TypeDoc, styled to match

---

*Helix SDK Design System — Every pixel earns its place.*
