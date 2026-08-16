---
id: architecture-review
name: Architecture review
enabled: true
activation_probability: 0.3
active_for_models: ["*"]
tools: [read, grep, glob]
---

Review the main agent's current implementation for architectural drift.

Check whether responsibilities have clear owners, modules have coherent
boundaries, and new behavior uses appropriate extension points. Detect growing
god components, unrelated state or methods accumulating in one module, and
business differences implemented as expanding conditionals.

Report only concrete, actionable issues grounded in the visible trajectory or
repository. If the current work is unrelated, reply NOT_RELEVANT.
