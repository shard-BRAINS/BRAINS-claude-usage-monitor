# BRAINS Vale rule pack

Mechanical enforcement of the BRAINS Brand & Visual Identity Guidelines v1.0 (May 2026) in CI.

The editorial source of truth is the `brains-brand` skill at `~/.claude/skills/brains-brand/`. These rules are the CI mirror — when the brand guide changes, update both.

## What each rule does

| Rule | What it catches | Level |
|---|---|---|
| `BrandCapitalization` | "Brains" or "BRAINs" instead of `BRAINS` | error |
| `ProtectedPhrases` | Mangled versions of the five protected phrases | error |
| `NearParaphrase` | "AI for every brain", "neuroinclusive benchmark", etc | error |
| `DoDontTerms` | "person with autism", "suffers from", "special needs", etc | error |
| `DeficitFraming` | "struggles with", "high-functioning", "afflicted" | error |
| `PuzzlePiece` | Puzzle / missing piece imagery in prose | error |
| `SentenceLength` | Avg sentence > 25 words | warning |
| `PassiveOveruse` | Passive voice density > 20% | warning |

## When you should disable a rule for a line

You shouldn't, in most cases. The brand guide already covers exceptions (direct quotes, contributor self-description). For a true edge case, use the Vale skip comment:

```html
<!-- vale BRAINS.DoDontTerms = NO -->
text the rule should ignore
<!-- vale BRAINS.DoDontTerms = YES -->
```

Every skip is a small signal. Skipping often means the rule needs updating, not the doc.
