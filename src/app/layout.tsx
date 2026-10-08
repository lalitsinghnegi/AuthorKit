import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuthorKit",
  description: "CSS package generator for content authoring teams",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
