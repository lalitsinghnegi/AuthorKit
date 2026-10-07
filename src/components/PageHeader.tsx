export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header style={{ marginBottom: 24 }}>
      <h1 style={{ margin: "0 0 4px" }}>{title}</h1>
      {description && <p style={{ margin: 0, color: "var(--ui-muted)" }}>{description}</p>}
    </header>
  );
}
