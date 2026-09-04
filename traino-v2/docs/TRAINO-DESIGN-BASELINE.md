# TRAINO Design Baseline

**Status:** Locked — Phase 12.5 ("TRAINO Final Design Baseline Lock")
**Source of truth model:** OLD REFERENCES → DESIGN REVIEW → **FINAL APPROVED UI (this document + the app itself)** → NEW GOLDEN SCREENSHOTS → AUTOMATED VISUAL REGRESSION

This document is the authoritative description of TRAINO's current, intended
visual and navigational design. It exists so that future changes have a
written baseline to diff against, instead of relying on memory or on the
historical `references/screens/*.png` mockups, which predate several
now-shipped features and are **not** the design source of truth.

---

## 1. Why this document exists

Phase 12 discovered that the project's original 11 reference screenshots
(`references/screens/*.png`, repo root) are stale: they were hand-designed
mockups from earlier in the project's history, produced before the Daily
Readiness engine, Progress analytics, Weekly Coaching intelligence, Nutrition
Engine, and other now-shipped systems existed. A pixel-diff against them
fails on every screen, but that failure is legitimate content evolution, not
a regression.

Phase 12.5 performed a deliberate design review (not a blind "restore the
mockup" pass, and not a blind "the current code is automatically right"
pass) and reached the decisions below. From this point forward, **the
running application is the design**, and the goldens in
`tests/visual/references/` are screenshots of that application, not
recreations of the old mockups.

---

## 2. Brand tokens (extracted verbatim from `tailwind.config.js`)

### Color

| Token | Value | Usage |
|---|---|---|
| `bg` | `#050505` | App background |
| `bg-secondary` | `#0A0A0D` | Secondary surfaces (e.g. bottom nav background is a close relative, `#0A0A0C`) |
| `card` | `#141417` | Standard card surface |
| `card-nested` | `#1B1B1F` | Icon chips / nested surfaces inside a card |
| `border` | `#242428` | Default border |
| `border-soft` | `#1E1E22` | Softer / lower-emphasis border |
| `red.DEFAULT` | `#E0272E` | Primary brand accent — CTAs, active states, highlights |
| `red.bright` | `#FF3B3B` | Bright red accent variant |
| `red.dim` | `#B01F24` | Dim red accent variant |
| `text.DEFAULT` | `#FFFFFF` | Primary text |
| `text.secondary` | `#A1A1AA` | Secondary text |
| `text.muted` | `#6B6B70` | Muted / inactive text (e.g. inactive nav icons) |
| `success` | `#3DDC84` | Positive status |
| `warn` | `#F5A623` | Warning status |
| `info` | `#3B82F6` | Informational status |

**Design language:** black/near-black backgrounds, red + white identity, no
gradients used for decoration (the one functional gradient is a legibility
scrim behind text on photo cards, e.g. `SportCard`), no glassmorphism, no
neon, no emoji icons anywhere in the app.

### Typography

| Token | Stack | Usage |
|---|---|---|
| `font-sans` | `Inter, system-ui, sans-serif` | Default — used for all current UI text |
| `font-arabic` | `Tajawal, system-ui, sans-serif` | Defined, **not currently used** in any component (see §4 RTL) |
| `font-display` | `Cairo, system-ui, sans-serif` | Defined, **not currently used** in any component |

`Tajawal` also appears as a fallback in the global `font-family` stack in
`src/index.css` (`'Inter','Tajawal',system-ui,sans-serif`), but no component
opts into it via `font-arabic`/`font-display` Tailwind classes.

### Layout

| Token | Value | Usage |
|---|---|---|
| `rounded-card` | `20px` | Primary card radius |
| `rounded-card-sm` | `14px` | Secondary/nested card radius |
| `rounded-button` | `16px` | Primary CTA button radius |
| `rounded-chip` | `999px` | Pill/chip radius |
| `spacing-18` | `4.5rem` | Custom spacing step |
| `shadow-card`, `shadow-card-red`, `shadow-button`, `shadow-nav` | — | Elevation for cards, red-accented cards, buttons, bottom nav |

Canonical mobile viewport used throughout design and testing: **390×844**
(iPhone 12/13/14 class). Responsive smoke is additionally verified at
375×812, 393×852, and 430×932 (see §7).

### Icons

`src/components/ui/Icon.tsx` — the "TRAINO_PRO_Icon_System": custom
hand-drawn SVG line-art, 24×24 viewBox, 1.8px default stroke width, round
linecap/linejoin, uses `currentColor` so it inherits text color, with an
optional `filled` prop for active-tab treatment. ~60 named icons, including
sport/equipment pictograms and a custom `aiMascot` mark. Zero emoji, zero
third-party icon-font dependency anywhere in the app. Icon-only interactive
elements carry an `aria-label` (see §9 accessibility).

---

## 3. Layout rules

- Single-column mobile layout, `max-w-[390px]` container, no desktop/tablet
  layout variant exists or is required.
- Every screen renders `<StatusBar />` at the top and, on screens with
  primary bottom navigation, `<BottomNav />` at the bottom (see §5).
- "Detail" screens (reached by drilling into something, not by primary tab)
  use a consistent header pattern instead of the bottom nav: a back chevron
  (`<Link to="...">` wrapping a `chevronLeft` icon) on the left, a centered
  uppercase `text-[15px] font-extrabold tracking-wide` title, and a
  balancing spacer `<div>` on the right so the title stays visually
  centered. This pattern is shared verbatim by Today's Workout, Weekly
  Report, Weekly Check-In, Daily Check-In, Human Coach, and Travel/
  Competition.
- Cards are the primary content unit: `bg-card`, `border border-border-soft`,
  `rounded-card` (or `rounded-card-sm` for nested/secondary cards).
- Primary CTAs are full-width red buttons: `bg-red rounded-button py-4
  text-white font-extrabold text-[15px] tracking-wide shadow-button`.

---

## 4. RTL / localization status

**Finding (exhaustive grep across `src/`):** zero usage of `dir="rtl"`,
`font-arabic`, `font-display`, or any `rtl:` Tailwind variant anywhere in
the codebase. `index.html` declares `lang="en"`.

**Conclusion:** TRAINO is currently an English-only, LTR-only product. The
`arabic`/`display` font tokens exist in the design system as forward-looking
infrastructure but are not wired into any screen. This is documented as the
honest current state — Phase 12.5 does not implement new RTL support (that
would be a new feature, out of scope) and does not claim RTL exists when it
doesn't.

---

## 5. Navigation architecture

### Bottom navigation

`src/components/ui/BottomNav.tsx` renders one of two item sets:

- **Default set** (Home, Nutrition, Progress, Profile): Home, Plan,
  Nutrition, Progress, Profile.
- **AI Coach set** (AI Coach screen only): Home, Plan, AI Coach (badge-
  styled active state — filled red circle instead of the plain filled-icon
  treatment every other tab uses), Nutrition, Profile.

Screens without a bottom nav (Sport Selection, all Assessment steps,
Equipment, Today's Workout, Weekly Report, Weekly Check-In, Daily Check-In,
Human Coach, Travel/Competition) use the back-chevron header pattern from
§3 instead — this is a deliberate, consistent distinction between "primary
tab" screens and "detail/flow" screens, not an inconsistency.

### §8 — The "Plan" navigation decision

**Problem found in Phase 12:** the bottom nav's "Plan" item pointed at
`/plan`, a route `App.tsx` never registered. This was a real dead
primary-nav item since the day it shipped.

**Decision:** repoint "Plan" to `/todays-workout` rather than inventing a
new `/plan` screen. Reasoning: an earlier product direction (reflected in
the old reference mockups) had a 5-tab layout where a "Plan" tab hosted
nutrition content. The current, actually-shipped app already gives
Nutrition its own independent tab and screen, so recreating that old
structure would either duplicate Nutrition or require inventing new screen
content with no functional backing — both prohibited by this phase's scope.
`/todays-workout` is already a fully-built, functionally complete "here is
your training for today" screen and is the natural target for a "Plan" tab
in the current architecture. This satisfies the requirement to reuse
existing, working screens rather than invent new ones.

**Implementation:** `src/components/ui/BottomNav.tsx`, both `DEFAULT_ITEMS`
and `AI_COACH_ITEMS`, `Plan` entry now reads `{ to: '/todays-workout', label:
'Plan', icon: 'calendar' }`.

### §9 — The "Human Coach" navigation decision

**Problem found in Phase 12:** `/human-coach` was a registered route with
zero in-app links to it anywhere — an orphaned route, unreachable except by
typing the URL directly.

**Decision:** make it reachable from the AI Coach screen's existing header
overflow icon (`dotsVertical`), which was previously decorative and had no
`onClick`/link. `HumanCoach.tsx`'s own pre-existing doc comment already
frames Human Coach as an escalation layer whose own actions loop back to AI
Coach ("Only the AI Coach is a real, working system in this app... every
action on this screen routes to the AI Coach chat"), making AI Coach the
natural reciprocal source screen. This avoids adding a new nav tab and
avoids redesigning either screen — it repurposes an existing, previously
non-functional affordance.

**Implementation:** `src/screens/AiCoach.tsx`, the `dotsVertical` icon in
the screen header is now wrapped in `<Link to="/human-coach"
aria-label="Talk to a human coach">`. The `sliders` icon next to it remains
decorative (no assigned destination — no such destination exists in the
current product).

### Full route inventory

| Route | Screen | Reachable via |
|---|---|---|
| `/` | Home | App entry / bottom nav "Home" |
| `/onboarding/about` | AssessmentAbout | Onboarding flow start |
| `/sport-selection` | SportSelection | Onboarding step 2 |
| `/assessment` | AssessmentTrainingLocation | Onboarding step 3 |
| `/equipment` | Equipment | Onboarding step 4 |
| `/assessment/experience` | AssessmentExperience | Onboarding step 5 |
| `/assessment/health` | AssessmentHealth | Onboarding step 6 |
| `/assessment/body` | AssessmentBody | Onboarding step 7 |
| `/assessment/nutrition-preferences` | AssessmentNutritionPreferences | Onboarding step 8 |
| `/ai-coach` | AiCoach | Home "Chat with AI" link; bottom nav "AI Coach" tab (on AI Coach screen only) |
| `/todays-workout` | TodaysWorkout | Bottom nav "Plan"; Daily Check-In result; Weekly Report; AI Coach |
| `/nutrition` | Nutrition | Bottom nav "Nutrition" |
| `/progress` | Progress | Bottom nav "Progress" |
| `/weekly-report` | WeeklyReport | Home coaching-summary card (once a Weekly Coaching record exists); direct navigation once available |
| `/weekly-check-in` | WeeklyCheckIn | Weekly Report flow |
| `/daily-check-in` | DailyCheckIn | Home daily-readiness card |
| `/human-coach` | HumanCoach | AI Coach header overflow icon (Phase 12.5 fix — previously orphaned) |
| `/profile` | Profile | Bottom nav "Profile" |
| `/travel-competition` | TravelCompetition | Home context banner / management entry point |

**Dead/orphaned routes found:** 2 (`/plan` dead link, `/human-coach`
orphaned route). **Both fixed this phase.** As of this document, there are
zero dead primary-nav items and zero orphaned routes.

---

## 6. Shared-component inventory

The actual shared UI surface is small and is documented here as an
architectural fact, not as a target for expansion in this phase:

- `src/components/ui/AssetSlot.tsx` — image/placeholder slot with a labeled
  fallback state.
- `src/components/ui/BottomNav.tsx` — primary tab bar (§5).
- `src/components/ui/Icon.tsx` — the icon system (§2).
- `src/components/ui/OnboardingHeader.tsx` — progress header used across
  onboarding/assessment steps.
- `src/components/ui/Screen.tsx` — page wrapper (max-width container,
  optional bottom-nav slot).
- `src/components/ui/StatusBar.tsx` — decorative status bar at the top of
  every screen.
- `src/components/ExerciseDetailPanel.tsx`, `ExerciseLogPanel.tsx`,
  `FoodDetailPanel.tsx` — feature-specific slide-up panels.

There is no separate Button/Card/Tabs/Input/Select/Modal/Badge component —
these patterns are inlined per-screen with consistent Tailwind utility
classes instead (e.g. every primary CTA uses the same `bg-red rounded-button
py-4 ...` class string). This is consistent across the app and did not
warrant extraction into new shared components for this phase, which is
scoped to navigation/visual-baseline work, not a component-library
refactor.

---

## 7. Screen inventory and final screen mapping

18 registered routes, 18 screen files — a 1:1 match (see §5 table).

### Screen categories

- **Public/onboarding:** AssessmentAbout, SportSelection,
  AssessmentTrainingLocation, Equipment, AssessmentExperience,
  AssessmentHealth, AssessmentBody, AssessmentNutritionPreferences.
- **Authenticated / primary tabs:** Home, Nutrition, Progress, Profile,
  AiCoach.
- **Workout:** TodaysWorkout.
- **Coaching:** WeeklyReport, WeeklyCheckIn, DailyCheckIn, HumanCoach.
- **Context:** TravelCompetition.

### Per-screen disposition (A. Keep / B. Adjust / C. Restore reference
element / D. Remove obsolete reference element / E. Fix navigation only /
F. No change)

| # | Screen | Disposition | Notes |
|---|---|---|---|
| 1 | Home | **B. Adjust (nav only)** | Daily Readiness card, notification affordance, and coaching-summary card are current shipped functionality and are kept — they are not in the old mockup but are not removed to match it (explicit spec requirement). "Chat with AI" link (Phase 12 fix) already functional. No further changes needed. |
| 2 | Sport Selection | **F. No change** | Coherent, functional, consistent with brand tokens; grid of `SportCard`s with photo-scrim pattern reused correctly. |
| 3 | Assessment / Training Location | **F. No change** | Consistent card-list pattern, working multi-select, disabled-until-valid CTA. |
| 4 | Equipment | **F. No change** | Consistent grid-of-toggles pattern, matches Training Location's visual language. |
| 5 | AI Coach | **E. Fix navigation only** | Header overflow icon wired to Human Coach (§9). No visual change. |
| 6 | Today's Workout | **F. No change** | Fully functional, exercise cards/sets/reps/logging/replace all wired to real engines. |
| 7 | Nutrition | **F. No change** | Wired to real Nutrition Engine; meal cards, logging, allergy filtering all functional. |
| 8 | Progress | **F. No change** | Wired to real Performance Analytics (Phase 10); this is the intended final Progress screen, not the old mockup's simpler version. |
| 9 | Weekly Report | **F. No change** | Wired to real Weekly Coaching Engine; reflects genuine coaching intelligence, not mockup placeholder content. |
| 10 | Human Coach | **E. Fix navigation only** | Screen itself unchanged; now reachable (§9). Its own honest self-documentation (AI Coach is the only real backend) is preserved as-is. |
| 11 | Profile | **F. No change** | Close enough to original intent; no interactive rows were added or removed. |
| 12 | Weekly Check-In | **F. No change** | Not one of the 11 legacy reference screens; functional, consistent header/card pattern. |
| 13 | Daily Check-In | **F. No change** | Not one of the 11 legacy reference screens; functional, consistent header/card pattern, safety-override pain flag intact. |
| 14 | Travel/Competition | **F. No change** | Not one of the 11 legacy reference screens; functional, consistent header/card pattern. |
| 15-18 | Remaining Assessment steps (Experience/Health/Body/Nutrition Preferences) | **F. No change** | Not part of the 11 legacy reference screens; consistent with Training Location/Equipment pattern. |

No screen required a "C. Restore reference element" or "D. Remove obsolete
reference element" disposition — the audit found no case where an old
mockup depicted UI that should be brought back, and no case where current
UI needed to be deleted to match an old mockup. The two real defects found
(§8, §9) were both navigation-only, not visual.

### Golden screenshot decisions (all 11 legacy reference PNGs)

| # | Legacy reference | Decision | Reason |
|---|---|---|---|
| 1 | Home | **REPLACE** | Predates Daily Readiness card and coaching-summary card, both now core shipped functionality. |
| 2 | Sport Selection | **REPLACE** | Regenerated from the real app for consistency/determinism, even though visually close to the mockup — screenshot must be a real render, not a recreation. |
| 3 | Assessment / Training Location | **REPLACE** | Same reasoning as above. |
| 4 | Equipment | **REPLACE** | Same reasoning as above. |
| 5 | AI Coach | **REPLACE** | Predates the header navigation fix (§9) and real deterministic-intent chat history. |
| 6 | Today's Workout | **REPLACE** | Predates real exercise-progression/logging data. |
| 7 | Nutrition | **REPLACE** | Predates the real Nutrition Engine's meal/macro output. |
| 8 | Progress | **REPLACE** | Predates Performance Analytics (Phase 10) — the old mockup depicts a materially simpler screen than the shipped one. |
| 9 | Weekly Report | **REPLACE** | Predates the real Weekly Coaching Engine's barrier/adjustment intelligence. |
| 10 | Human Coach | **REPLACE** | Predates the navigation fix (§9); screen content itself is close to the mockup but must be a real render for determinism. |
| 11 | Profile | **REPLACE** | Regenerated for consistency, though closest of the 11 to the original mockup. |

All 11 are replaced. This reflects the phase's own framing: the current
running application is the design baseline, not a set of static mockups,
and even screens that are visually close to their legacy reference must be
captured as real renders of the real app for the visual suite to be
meaningful.

---

## 8. Golden screenshot location and conventions

- **Location:** `tests/visual/references/*.png` (existing convention from
  Phase 12, preserved).
- **Filenames (stable, unchanged):** `home.png`, `sport-selection.png`,
  `assessment-location.png`, `equipment.png`, `ai-coach.png`,
  `todays-workout.png`, `nutrition.png`, `progress.png`,
  `weekly-report.png`, `human-coach.png`, `profile.png`.
- **Generation:** `npm run test:visual:update`, run only after a deliberate
  design review (never as an automatic "fix" for a failing diff).
- **Verification:** `npm run test:visual` immediately after, expecting
  11/11 PASS at `maxDiffPixelRatio: 0.01` (unchanged — never loosened to
  force green).
- **Viewport:** canonical 390×844, set globally in `playwright.config.ts`.
- **Determinism:** `tests/visual/helpers/visualFixtures.ts`'s
  `seedRepresentativeAthlete()` builds a fixed, realistic athlete state
  (onboarding + readiness check-in + exercise log + meal log + weekly
  check-in) so every screenshot represents the same known state, not
  "whatever happened to exist." `animations: 'disabled'` in
  `toHaveScreenshot` config. Fonts are intentionally left un-blocked in the
  visual fixture (unlike the functional E2E fixture) because pixel
  comparison must use the real typeface.

---

## 9. Accessibility

Primary interactive controls use `getByRole`-discoverable roles and
accessible names (links, buttons, headings). Icon-only controls carry an
explicit `aria-label` — e.g. the Human Coach entry point on AI Coach
(`aria-label="Talk to a human coach"`), readiness scale option buttons
(`aria-label` = the scale word, e.g. "Excellent"). This phase does not
redesign any screen to "solve" accessibility — it verifies that accessible
names already exist and are sensible, consistent with the phase's scope
(navigation/testability fixes only, no visual redesign).

---

## 10. Future design-change policy

A visual change to TRAINO is **not complete** until all five of the
following are true, in order:

1. The implementation itself is updated.
2. Affected E2E tests (`npm run test:e2e`) pass against the change.
3. Affected visual tests are reviewed — run `npm run test:visual` and look
   at the failing diffs, don't just read the pass/fail count.
4. Goldens are **deliberately** updated (`npm run test:visual:update`) only
   after that review confirms the new render is correct — never run this
   command reflexively to "fix" a failing test.
5. The full visual suite passes (`npm run test:visual`, 11/11, unchanged
   tolerance).

`npm run test:visual:update` must never be treated as an automatic fix for
a red visual test. A red visual test is a question ("did the render change
on purpose, and is the new render correct?") — it is answered by looking at
the diff, not by regenerating the goldens.

---

## 11. Scope boundary

This document, and the Phase 12.5 work it describes, covers **UI,
navigation, and visual/E2E test baseline only**. It made zero changes to:
Training Engine, Exercise Intelligence, Progression Engine, Nutrition
Engine, Readiness Engine, Performance Analytics, Weekly Coaching Engine,
Travel Engine, Competition Engine, or any Sport Module. The two code
changes made (`BottomNav.tsx`, `AiCoach.tsx`) are both navigation-only —
no business logic, calculation, or data model was touched.
