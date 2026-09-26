export const ja = {
  emptyResponse: "Claude Code から空の応答が返りました。",
  missingBranch: "branch (ブランチ名) がありません",
  incompletePlan: (errors: string) => `AI のプランが不完全です:\n${errors}`,
  invalidThemeAssignment: "AI がパレットの色をうまく割り当てられませんでした。もう一度試してください。",
};

export const en: typeof ja = {
  emptyResponse: "Claude Code returned an empty response.",
  missingBranch: "The plan has no branch name",
  incompletePlan: (errors) => `The AI plan is incomplete:\n${errors}`,
  invalidThemeAssignment: "The AI couldn't assign the palette colors properly. Please try again.",
};
