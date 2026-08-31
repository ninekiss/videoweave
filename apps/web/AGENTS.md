# AGENTS.md — VideoWeave Web

This file narrows the root `AGENTS.md` rules for `apps/web`.

## UI primitives

- Product UI must use established primitives before custom implementations.
- Prefer the current shadcn `new-york` component implementation and its maintained `radix-ui` dependency for interactive primitives.
- Do not use native `<select>` elements in product UI. Use shadcn/Radix `Select`; use a mature Combobox when search/filter behavior is required.
- Do not use raw `input[type=range]` when shadcn/Radix `Slider` satisfies the interaction.
- Native elements are acceptable when the maintained shadcn component intentionally wraps that native control, such as `Input` or `Textarea`.
- Do not create local dropdown, dialog, popover, tooltip, tabs, slider, menu, select, checkbox, switch, radio, scroll-area or form-control implementations when a maintained shadcn/Radix equivalent exists.

## Component boundaries

- `src/components/ui`: product-agnostic primitives only; no VideoWeave contracts or API calls.
- `src/components/domain`: reusable VideoWeave concepts such as Asset preview/status, Job progress, Shot cards and workflow/model summaries. Domain contracts are allowed; feature API orchestration is not.
- `src/features/<feature>`: concrete workflows, API calls, polling, mutations and feature state machines.
- Shared application chrome belongs in a clearly named shared layout component and must not own feature workflows.

Dependency direction:

```text
app routes
  -> features
  -> components/domain
  -> components/ui
```

A feature may use `components/ui` directly. `components/ui` must never depend on domain or feature code, and `components/domain` must never depend on a concrete feature.

## Styling

- Tailwind is the default styling mechanism.
- Keep global CSS limited to theme tokens, reset/base rules and genuinely global browser/media behavior.
- Use Lucide for standard interface icons.
- Avoid generic global class names that can collide with Tailwind utilities.
