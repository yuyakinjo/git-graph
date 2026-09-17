import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogProvider, MenuProvider } from "./components/ui";
import { StoreProvider } from "./state/store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <DialogProvider>
        <MenuProvider>
          <App />
        </MenuProvider>
      </DialogProvider>
    </StoreProvider>
  </StrictMode>,
);
