import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "bootstrap/dist/css/bootstrap.css";
import "./index.css";
import AuthProvider from "./auth/authProvider";
import DemoDataResetGate from "./components/DemoDataResetGate";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <>
        <DemoDataResetGate>
          <AuthProvider>
            <App />
          </AuthProvider>
        </DemoDataResetGate>
        <Analytics />
      </>
    </BrowserRouter>
  </React.StrictMode>
);
