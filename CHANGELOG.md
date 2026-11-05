# @hulla/gittar

## 0.0.7

### Patch Changes

- 95a73c6: Expose offline repository-source parsing so consumers can distinguish a repository/subdirectory identity from its branch, tag or commit revision.

## 0.0.6

### Patch Changes

- 575c6b5: Resolve branch names, lightweight tags, and annotated tags to exact commits before
  downloading explicit revisions. Prevent cache reuse across revisions when remote
  resolution fails or `update: 'never'` skips remote checks.

## 0.0.5

### Patch Changes

- Resolve full commit SHAs directly when checking cached revisions. A pinned commit
  now replaces a cache containing another revision and records its commit identity
  so subsequent requests can reuse the correct files.

- Limit published files to built library outputs and release documentation.

## 0.0.4

### Patch Changes

- sync commits and autobranches detection

## 0.0.3

### Patch Changes

- backwards compatibility for stale metadata

## 0.0.2

### Patch Changes

- update modes based on git commit ls

## 0.0.1

### Patch Changes

- minified build

## 0.0.0

### Patch Changes

- syntax updates, return types
- Alpha release
