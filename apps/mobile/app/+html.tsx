import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

// Web-only root HTML for static rendering (Node — no DOM APIs).
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>ClawQL — PhoneApprove</title>
        <meta
          name="description"
          content="Approve exact-change requests from your phone with ClawQL PhoneApprove."
        />
        <meta name="theme-color" content="#fbf8fd" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: rootStyles }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}

const rootStyles = `
html, body, #main, #root {
  height: 100%;
}
body {
  margin: 0;
  background-color: #fbf8fd;
}
#main {
  display: flex;
  flex-direction: column;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 9999;
  padding: 8px 12px;
  background: #3f5aa9;
  color: #ffffff;
  font: 600 14px/1.2 system-ui, sans-serif;
  text-decoration: none;
  border-radius: 0 0 8px 0;
}
.skip-link:focus {
  left: 0;
}
`;
