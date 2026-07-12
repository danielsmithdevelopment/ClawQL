import type { Response } from "express";

export type OpenAiErrorBody = {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
};

export function sendOpenAiError(
  res: Response,
  status: number,
  message: string,
  type = "invalid_request_error"
): void {
  const body: OpenAiErrorBody = {
    error: { message, type, param: null, code: null },
  };
  res.status(status).json(body);
}
