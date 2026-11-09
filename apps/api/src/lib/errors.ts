export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

export const isEsStatus = (err: unknown, status: number) => (err as { meta?: { statusCode?: number } })?.meta?.statusCode === status;
