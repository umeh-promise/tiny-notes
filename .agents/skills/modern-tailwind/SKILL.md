---
name: modern-tailwind
description: Write clean, modern, concise Tailwind CSS code. Use whenever working on or reviewing Tailwind CSS code.
---

# Variables in arbitrary values

When using variables in arbitrary values, use the modern, shorter syntax.

Instead of:

```html
<div class="bg-[var(--color)]" />
```

write:

```html
<div class="bg-(--color)" />
```

# Layout best practices

Prefer grid for 2D layouts.
Prefer flex for 1D alignment.

Examples:

```html
<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  <div class="flex items-center justify-between"></div>
</div>
```