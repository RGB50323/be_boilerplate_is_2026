export class ValidacionAvisoError extends Error {
  constructor(
    public readonly campo: string,
    message: string,
  ) {
    super(message);
    this.name = ValidacionAvisoError.name;
  }
}
