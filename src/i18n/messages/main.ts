export const ja = {
  uncaughtError: (message: string) => `未処理の例外: ${message}`,
  unhandledRejection: "未処理の Promise の失敗",
};

export const en: typeof ja = {
  uncaughtError: (message) => `Uncaught error: ${message}`,
  unhandledRejection: "Unhandled promise rejection",
};
