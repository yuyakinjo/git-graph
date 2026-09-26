export const ja = {
  noJsonPlan: "AI の応答に JSON のプランがありません",
  invalidJson: (detail: string) => `AI の応答を JSON として読めません: ${detail}`,
  noCommitsField: "AI の応答に commits がありません",
  noCommits: "コミットが 1 つもありません",
  commitNoMessage: (n: number) => `${n} 番目のコミットにメッセージがありません`,
  commitNoFiles: (n: number) => `${n} 番目のコミットにファイルがありません`,
  unknownFile: (file: string) => `変更の一覧に無いファイルがあります: ${file}`,
  duplicateFile: (file: string) => `${file} が複数のコミットに含まれています`,
  missingFiles: (files: string) => `どのコミットにも入っていないファイルがあります: ${files}`,
};

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${s}`;
};

export const en: typeof ja = {
  noJsonPlan: "The AI response contains no JSON plan",
  invalidJson: (detail) => `Couldn't parse the AI response as JSON: ${detail}`,
  noCommitsField: "The AI response has no commits",
  noCommits: "The plan has no commits",
  commitNoMessage: (n) => `The ${ordinal(n)} commit has no message`,
  commitNoFiles: (n) => `The ${ordinal(n)} commit has no files`,
  unknownFile: (file) => `File not in the list of changes: ${file}`,
  duplicateFile: (file) => `${file} is included in more than one commit`,
  missingFiles: (files) => `Files not included in any commit: ${files}`,
};
