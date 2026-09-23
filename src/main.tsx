import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogProvider, MenuProvider } from "./components/ui";
import { bootApp } from "./lib/repo-data";
import { applyZoom } from "./lib/zoom";
import { StoreProvider } from "./state/StoreProvider";
import "./styles.css";

// 前回の表示倍率を最初の描画前に戻す (拡大した状態で起動してもチラつかせない)
applyZoom();

// 初期データは React のマウント前に読み切り、store の初期値として上から流す。
// 「マウント後に取りに行って state を書き戻す」という逆流を作らないため。
bootApp().then((boot) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <StoreProvider boot={boot}>
        <DialogProvider>
          <MenuProvider>
            <App />
          </MenuProvider>
        </DialogProvider>
      </StoreProvider>
    </StrictMode>,
  );
});
