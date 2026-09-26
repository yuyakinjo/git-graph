import type { PullRequest } from "../lib/types";
import { useStore } from "../state/store";
import { DiffModal } from "./DiffModal";
import { LogModal } from "./LogModal";
import { PrModal } from "./PrModal";
import { RecomposeModal } from "./RecomposeModal";
import { Settings } from "./Settings";
import { TidyModal } from "./TidyModal";

/** 画面全体にかぶせるモーダル群。PR だけは App が持つ state から開く。 */
export function Modals({ pr, onClosePr }: { pr: PullRequest | null; onClosePr: () => void }) {
  const s = useStore();
  return (
    <>
      {s.diffModal ? <DiffModal /> : null}
      {pr ? <PrModal pr={pr} onClose={onClosePr} /> : null}
      {s.settingsOpen ? <Settings /> : null}
      {s.logsOpen ? <LogModal /> : null}
      {s.tidy ? (
        <TidyModal dir={s.tidy.dir} plan={s.tidy.plan} onClose={() => s.setTidy(null)} />
      ) : null}
      {s.recompose ? (
        <RecomposeModal
          key={`${s.recompose.dir}\0${s.recompose.branch}`}
          dir={s.recompose.dir}
          initialBranch={s.recompose.branch}
          onClose={() => s.setRecompose(null)}
        />
      ) : null}
    </>
  );
}
