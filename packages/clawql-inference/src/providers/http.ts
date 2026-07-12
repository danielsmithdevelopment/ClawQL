export async function readHttpError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.slice(0, 400);
}
