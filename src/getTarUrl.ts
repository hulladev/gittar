/**
 * Generates a tar download URL for a git repository
 *
 * Supported input formats:
 * - Full URLs: https://github.com/user/repo
 * - Tree URLs: https://github.com/user/repo/tree/branch/path
 * - Short format: user/repo
 * - SSH format: git@github.com:user/repo.git
 *
 * Supported platforms:
 * - GitHub: https://github.com/{owner}/{repo}/archive/{ref}.tar.gz
 * - GitLab: https://gitlab.com/{owner}/{repo}/-/archive/{ref}/{repo}-{ref}.tar.gz
 * - Bitbucket: https://bitbucket.org/{owner}/{repo}/get/{ref}.tar.gz
 * - Gitea: https://{host}/{owner}/{repo}/archive/{ref}.tar.gz
 * - Codeberg: https://codeberg.org/{owner}/{repo}/archive/{ref}.tar.gz
 * - Forgejo: https://{host}/{owner}/{repo}/archive/{ref}.tar.gz
 *
 * Unsupported platforms (will return null):
 * - Azure DevOps: Does not support direct tar downloads
 *
 * @param input - Repository URL or identifier (user/repo, git@host:user/repo.git, https://...)
 * @param branch - Optional branch/commit/tag (defaults to "main")
 * @returns The tar download URL, or null if the platform doesn't support tar downloads
 */
export function getTarUrl(input: string, branch?: string): string | null {
  try {
    // Parse the input to extract owner, repo, hostname, and branch
    const parsed = parseInput(input, branch)

    if (!parsed) {
      return null
    }

    const { owner, repo, hostname, ref } = parsed
    const platform = detectPlatform(hostname)

    if (!platform) {
      return null
    }

    // Azure DevOps doesn't support direct tar downloads
    if (platform === 'azure') {
      return null
    }

    // Generate platform-specific tar URL
    switch (platform) {
      case 'github':
        return `https://${hostname}/${owner}/${repo}/archive/${ref}.tar.gz`

      case 'gitlab':
        return `https://${hostname}/${owner}/${repo}/-/archive/${ref}/${repo}-${ref}.tar.gz`

      case 'bitbucket':
        return `https://${hostname}/${owner}/${repo}/get/${ref}.tar.gz`

      default:
        return `https://${hostname}/${owner}/${repo}/archive/${ref}.tar.gz`
    }
  } catch {
    return null
  }
}

/**
 * Parses various input formats and extracts repository information
 */
export function parseInput(
  input: string,
  defaultBranch?: string
): {
  owner: string
  repo: string
  hostname: string
  ref: string
  subpath?: string
} | null {
  // Handle SSH format: git@github.com:user/repo.git
  if (input.startsWith('git@')) {
    return parseSshFormat(input, defaultBranch)
  }

  // Handle short format: user/repo
  if (!input.includes('://') && !input.startsWith('http') && !input.includes('@')) {
    return parseShortFormat(input, defaultBranch)
  }

  // Handle full URLs
  try {
    const url = new URL(input)
    return parseUrlFormat(url, defaultBranch)
  } catch {
    // If URL parsing fails, try short format as fallback
    return parseShortFormat(input, defaultBranch)
  }
}

/**
 * Parses SSH format: git@github.com:user/repo.git
 */
function parseSshFormat(
  input: string,
  defaultBranch?: string
): {
  owner: string
  repo: string
  hostname: string
  ref: string
  subpath?: string
} | null {
  // Format: git@host:owner/repo.git
  const match = input.match(/^git@([^:]+):(.+)$/)
  if (!match) {
    return null
  }

  const [, hostname, path] = match
  if (!hostname || !path) {
    return null
  }

  const repoPath = path.replace(/\.git$/, '') // Remove .git suffix
  const parts = repoPath.split('/').filter(Boolean)

  if (parts.length < 2) {
    return null
  }

  const [owner, repo] = parts
  if (!owner || !repo) {
    return null
  }

  return {
    owner,
    repo,
    hostname,
    ref: defaultBranch || 'main',
  }
}

/**
 * Parses short format: user/repo
 */
function parseShortFormat(
  input: string,
  defaultBranch?: string
): {
  owner: string
  repo: string
  hostname: string
  ref: string
  subpath?: string
} | null {
  const parts = input.split('/').filter(Boolean)

  if (parts.length < 2) {
    return null
  }

  const [owner, repo] = parts
  if (!owner || !repo) {
    return null
  }

  // Default to GitHub for short format
  return {
    owner,
    repo,
    hostname: 'github.com',
    ref: defaultBranch || 'main',
  }
}

/**
 * Parses full URL format: https://github.com/user/repo/tree/branch/path
 */
function parseUrlFormat(
  url: URL,
  defaultBranch?: string
): {
  owner: string
  repo: string
  hostname: string
  ref: string
  subpath?: string
} | null {
  const pathParts = url.pathname.split('/').filter(Boolean)

  if (pathParts.length < 2) {
    return null
  }

  const [owner, repo, ...rest] = pathParts
  if (!owner || !repo) {
    return null
  }

  // Check for tree/blob/src patterns to extract branch and subpath
  let ref = defaultBranch || 'main'
  let subpath: string | undefined = undefined

  if (rest.length > 0) {
    const type = rest[0] // 'tree', 'blob', 'raw', 'src', etc.

    // GitHub/GitLab/Gitea/Codeberg/Forgejo use 'tree' or 'blob'
    // Bitbucket uses 'src' or 'browse'
    if (type === 'tree' || type === 'blob' || type === 'raw' || type === 'src' || type === 'browse') {
      // Format: /tree/branch/path/to/folder or /blob/branch/path/to/file
      if (rest.length >= 2 && rest[1]) {
        ref = rest[1]
      }
      // Extract subpath if present (everything after branch)
      if (rest.length > 2) {
        subpath = rest.slice(2).join('/')
      }
    }
  }

  return {
    owner,
    repo,
    hostname: url.hostname,
    ref,
    subpath,
  }
}

/**
 * Detects the git hosting platform from hostname
 */
function detectPlatform(hostname: string): string | null {
  const normalized = hostname.toLowerCase()

  // Platform detection mappings: platform name -> array of substrings to check
  const platformMappings: Record<string, string[]> = {
    azure: ['dev.azure.com', 'visualstudio.com'],
    codeberg: ['codeberg'],
    forgejo: ['forgejo'],
    gitea: ['gitea'],
    github: ['github'],
    gitlab: ['gitlab'],
    bitbucket: ['bitbucket'],
  }

  for (const [platform, checks] of Object.entries(platformMappings)) {
    if (checks.some((check) => normalized.includes(check))) {
      return platform
    }
  }

  return null
}
