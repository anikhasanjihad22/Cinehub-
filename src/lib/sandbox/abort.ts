export const providerAbortError = (): Error => {
  const error = new Error('Provider request aborted');
  error.name = 'AbortError';
  return error;
};

export const throwIfProviderAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw providerAbortError();
};
