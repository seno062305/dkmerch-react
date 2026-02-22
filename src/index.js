import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";

const convex = new ConvexReactClient(process.env.REACT_APP_CONVEX_URL);

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <NotificationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificationProvider>
    </ConvexProvider>
  </React.StrictMode>
);