import "./i18n";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Toaster dir="ltr" position="top-center" />
    <App />
  </React.StrictMode>,
);
