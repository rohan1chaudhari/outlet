export class ConnectorError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.status = status;
  }
}
export const fail = (code, message, status) => {
  throw new ConnectorError(code, message, status);
};
export function publicError(error) {
  if (error instanceof ConnectorError)
    return { code: error.code, message: error.message };
  if (error?.name === "AbortError")
    return { code: "cancelled", message: "The request was cancelled." };
  return {
    code: "provider_error",
    message:
      "The AI connection could not complete the request. Check the connector.",
  };
}
