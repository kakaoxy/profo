# Design System Strategy: The Architectural Ledger

## 1. Overview & Creative North Star
In an industry built on physical structures and high-stakes investments, the interface must mirror the permanence and precision of luxury architecture. We are moving beyond the "generic dashboard" to a **Creative North Star: The Digital Curator.**

This design system avoids the cluttered, line-heavy aesthetic of traditional enterprise software. Instead, it utilizes **Editorial Asymmetry** and **Tonal Depth** to guide the eye. We treat property data not as rows in a database, but as entries in a high-end architectural catalog. By utilizing expansive whitespace (using our `20` and `24` spacing tokens) and a sophisticated layering of surfaces, we create an environment that feels both authoritative and effortless.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a deep, intellectual blue (`primary: #005daa`), supported by organic greens and ambers that signal status without disrupting the visual harmony.

*   **The "No-Line" Rule:** To achieve a premium feel, 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined through background shifts—for example, a `surface_container_low` sidebar sitting against a `surface` main content area.
*   **Surface Hierarchy & Nesting:** Think of the UI as stacked sheets of vellum. 
    *   **Level 0 (Base):** `surface` (#f8f9ff)
    *   **Level 1 (Sections):** `surface_container_low` (#eff4ff)
    *   **Level 2 (Active Cards):** `surface_container_lowest` (#ffffff)
*   **The "Glass & Gradient" Rule:** Use `surface_tint` at 5% opacity with a `backdrop-blur` of 20px for floating navigation or filter bars. For primary CTAs, apply a subtle linear gradient from `primary` (#005daa) to `primary_container` (#0075d5) at a 135-degree angle to provide a "lithographic" depth.

---

## 3. Typography: The Editorial Scale
We employ a dual-font strategy to balance character with readability.

*   **Display & Headlines (Manrope):** Used for property titles and high-level analytics. The geometric nature of Manrope conveys modern construction and reliability. Use `headline-lg` for page titles to establish an immediate hierarchy.
*   **Body & Labels (Inter):** The workhorse for data entry and property specs. Inter’s high x-height ensures that even `label-sm` (0.6875rem) remains legible for complex real estate disclosures.
*   **Hierarchy Tip:** Always pair a `display-sm` value with a `label-md` uppercase caption to create an "Editorial Header" effect, common in high-end real estate magazines.

---

## 4. Elevation & Depth
We reject the heavy, "muddy" shadows of early 2010s design. Depth is achieved through **Tonal Layering.**

*   **The Layering Principle:** To highlight a property card, do not draw a box. Place a `surface_container_lowest` card on top of a `surface_container` background. The subtle shift from `#ffffff` to `#e5eeff` creates a natural, soft lift.
*   **Ambient Shadows:** For "Modal" property previews, use a shadow with a 40px blur, 0px offset, and 6% opacity using the `on_surface` color. This mimics natural light reflecting off a physical surface.
*   **The "Ghost Border" Fallback:** If a UI element (like a search input) risks washing out, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons & Interaction
*   **Primary:** High-contrast `primary` fill with `on_primary` text. Use `roundedness.md` (0.375rem) for a crisp, architectural corner.
*   **Secondary:** No fill. Use a "Ghost Border" (outline-variant at 20%) with `primary` text.
*   **Tertiary/Ghost:** Pure text with `primary` coloring. Use for low-emphasis actions like "Cancel" or "Clear Filters."

### Structured Form Layouts
*   **The Input Field:** Backgrounds must use `surface_container_highest`. Upon focus, the background shifts to `surface_container_lowest` with a 2px `primary` bottom-border only. This "underlined" look feels more like a legal ledger than a web form.
*   **Image Upload Cards:** Use a dashed `outline` token at 30% opacity. When a file is hovered, transition the card background to `primary_fixed` to provide a tactile "drop zone" feel.

### Status Tags (Chips)
*   **Draft:** `surface_variant` background / `on_surface_variant` text.
*   **Published:** `secondary_container` background / `on_secondary_container` text.
*   **On-Sale:** `tertiary_container` background / `on_tertiary_container` text (using the sophisticated Amber/Gold).
*   **Note:** Tags should use `roundedness.full` and `label-sm` typography for a polished, "tag" appearance.

### Cards & Property Lists
*   **No Dividers:** Forbid horizontal lines between list items. Use the `spacing.8` (1.75rem) gap to create separation. Content is grouped by proximity, not by containment.

---

## 6. Do's and Don'ts

### Do
*   **Use Asymmetry:** Place property details slightly offset from their labels to create a custom, high-end feel.
*   **Respect the "Breath":** Use `spacing.16` around major dashboard widgets. Real estate is about space; the dashboard should reflect that.
*   **Tint Your Neutrals:** Always use `on_surface_variant` for secondary text rather than pure #000000 to maintain the "blue-ink" professional tone.

### Don't
*   **Don't use pure black:** It breaks the "Architectural Ledger" illusion. Use `on_background` (#0b1c30) for maximum contrast.
*   **Don't use 100% opaque borders:** They create "visual noise" that makes the dashboard feel like a spreadsheet rather than a premium management tool.
*   **Don't crowd the data:** If a table has more than 8 columns, move the secondary data into a "Level 2" drawer using `surface_container_low`.