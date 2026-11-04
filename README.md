# @hulla/gittar

To install dependencies:

```bash
bun install
```

## Development commands

Run these commands from the package root:

| Command         | Behavior               |
| --------------- | ---------------------- |
| `bun run build` | Build `dist/`.         |
| `bun run lint`  | Check lint rules.      |
| `bun run fmt`   | Format the repository. |
| `bun test`      | Run the test suite.    |

Pass options directly to the tools and compose commands as needed:

```sh
bun run fmt --check
bun run fmt && bun run build
bun run lint && bun run build
```

The build command only builds. The release command uses that build without
automatically running formatting or linting.

## Cache freshness

Use `update: 'always'` to bypass the local cache and download the archive on every call:

```ts
import gittar from '@hulla/gittar'

const result = await gittar({
  url: 'https://github.com/owner/repo/tree/main',
  update: 'always',
})

// result.fromCache === false
```

| `update`             | Behavior                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| `'commit'` (default) | Check the remote commit and download when the cache is stale.                      |
| `'always'`           | Skip cache reads and download again, even when the cached commit matches.          |
| `'never'`            | Reuse cache for the requested revision without a remote check; otherwise download. |

`'always'` still writes the downloaded files and metadata to `cacheDir` for later reuse.
It does not disable cache storage.

### Branches, tags, and commits

The `branch` option accepts a branch name, tag name (including annotated tags), or full
40-character commit SHA. An explicit option takes precedence over a revision in the URL:

```ts
const result = await gittar({
  url: 'https://github.com/owner/repo',
  branch: 'v1.0.0',
})
```

Branch names take precedence over tags with the same name. Use `refs/tags/v1.0.0`
to explicitly select a tag in that case. When the revision resolves, the archive is
downloaded by commit SHA and `result.branch` retains the requested revision name.

With the default `'commit'` strategy, a failed remote lookup may reuse cache only
when its metadata identifies the requested revision. `'never'` also checks this local
revision identity. A different revision or missing metadata causes a download instead
of silently returning unrelated files. Without an explicit revision, cached `main`
or `master` is eligible for reuse. Cache freshness cannot be verified while offline.

## AI agent guidance

Install the [@hulla/gittar skill](https://github.com/hulladev/skills/tree/main/skills/gittar) for package-specific guidance on snapshot downloads, subpath copying, cache isolation, and freshness:

```sh
npx skills add hulladev/skills --skill gittar
```

Choose your coding agent in the installer. See [installation and version compatibility](https://hulla.dev/docs/cli/agent-skills) before adding or updating skills in your application.
