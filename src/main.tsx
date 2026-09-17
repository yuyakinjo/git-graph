import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogProvider, MenuProvider } from "./components/ui";
import { bootApp } from "./lib/repo-data";
import { StoreProvider } from "./state/store";
import "./styles.css";

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
