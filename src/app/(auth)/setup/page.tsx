import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ensureSetupCode } from "@/lib/auth/setup";
import { setupAction } from "../actions";
import { AuthForm } from "../AuthForm";

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  // Only reachable while there are no users; prints the code to the server log.
  if (!(await ensureSetupCode())) notFound();
  return (
    <>
      <h1 style={{ fontSize: "1.3rem", margin: "0 0 8px" }}>Create the first admin</h1>
      <p style={{ marginTop: 0, color: "var(--ui-muted)" }}>
        Enter the setup code printed in the server log when AuthorKit started.
      </p>
      <AuthForm
        action={setupAction}
        submit="Create admin and sign in"
        fields={[
          { name: "code", label: "Setup code", type: "text", autoComplete: "one-time-code" },
          { name: "name", label: "Your name", type: "text", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
          },
        ]}
      />
    </>
  );
}
