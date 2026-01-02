/**
 * Base error class for all gittar errors
 */
export class GittarError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * Error thrown when URL parsing or download fails
 */
export class URLError extends GittarError {}

/**
 * Error thrown when filesystem operations fail
 */
export class FSError extends GittarError {}
