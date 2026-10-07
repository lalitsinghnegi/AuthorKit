import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuthorKit",
  description: "CSS package generator for content authoring teams",
};

export default function RootLayout({ children, actions }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AppShell actions={actions}>{children}</AppShell>
      </body>
    </html>
  );
}
