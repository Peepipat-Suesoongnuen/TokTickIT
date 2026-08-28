export function sendError(
  res: import("express").Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>
) {
  const body: Record<string, unknown> = { error: { code, message } };
  if (fieldErrors) (body as Record<string, unknown>).fieldErrors = fieldErrors;
  res.status(status).json(body);
}
