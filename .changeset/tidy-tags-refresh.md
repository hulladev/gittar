---
'@hulla/gittar': patch
---

Resolve branch names, lightweight tags, and annotated tags to exact commits before
downloading explicit revisions. Prevent cache reuse across revisions when remote
resolution fails or `update: 'never'` skips remote checks.
