// A visitor library that can't be mapped. `code`: 'not-a-library', 'no-tracks' or 'too-large'.
export class VisitorError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'VisitorError';
    this.code = code;
  }
}
