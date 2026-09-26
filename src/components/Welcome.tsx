import { useT } from "../i18n";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { btn, iconBtn } from "./classes";
import { Icon } from "./ui";

/** リポジトリを開いていないときの画面。最近開いたリポジトリから選び直せる。 */
export function Welcome() {
  const s = useStore();
  const act = useActions();
  const m = useT().app;
  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_30%_10%,var(--color-bg-3)_0%,var(--color-bg-1)_60%)]">
      <div className="w-120 max-w-[88vw] text-center">
        <h1 className="mx-0 mt-0 mb-6">
          <img
            className="mx-auto block h-32 w-auto"
            src="/logo.svg"
            alt="GitSquid"
            draggable={false}
          />
        </h1>
        <button className={btn("primary", "big")} onClick={() => act.openFolder()}>
          <Icon name="folder" size={16} /> {m.openRepo}
        </button>
        {s.recent.length ? (
          <div className="mt-6.5 text-left">
            <h2 className="mx-0 mt-0 mb-1.5 text-[11px] tracking-[0.06em] text-fg-faint uppercase">
              {m.recentRepos}
            </h2>
            {s.recent.map((p) => (
              <div key={p} className="flex items-center gap-1">
                <button
                  className="flex h-7.5 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-fg hover:bg-bg-2"
                  onClick={() => s.openRepo(p)}
                >
                  <Icon name="repo" size={14} />
                  <span className="flex-none font-semibold">{p.split("/").pop()}</span>
                  <span className="overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap text-fg-faint">
                    {p.replace(/^\/Users\/[^/]+/, "~")}
                  </span>
                </button>
                <button
                  className={iconBtn({ tiny: true })}
                  title={m.removeFromList}
                  onClick={() => s.removeRecent(p)}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
