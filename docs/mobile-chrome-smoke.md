# Mobile Chrome smoke (Feature 022a)

Validate in **Chrome DevTools → device mode** before Capacitor / real phones.

## Presets

- iPhone 14 (390×844) or equivalent
- Optional: Pixel 7 (412×915)
- Regression: desktop 1365×768

## Checklist

1. [ ] Shelf loads without forced ~1100px horizontal scroll.
2. [ ] Cover grid readable (2+ columns or tidy auto-fill); import button reachable.
3. [ ] Filter rail opens overlay; dimmed content still behind; close works.
4. [ ] Open builtin 《长征》; page turns (next/prev) work.
5. [ ] Open 目录 — panel overlays page; canvas not permanently halved; backdrop/toggle closes.
6. [ ] Theme / 书签 / 笔记 / 续读恢复 panels same overlay behavior.
7. [ ] Recovery card (if shown) fits width and is scrollable.
8. [ ] Desktop 1365×768: rail + push panel still look like before phone work.

## Gate

```bash
npm run build
```
