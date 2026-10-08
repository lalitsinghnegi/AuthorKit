import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { hasUsers } from "@/lib/storage/users";
import { safeNext } from "@/lib/auth/next";
import { loginAction } from "../actions";
import { AuthForm } from "../AuthForm";

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Login {...props} />
    </Suspense>
  );
}

async function Login({ searchParams }: PageProps<"/login">) {
  if (!(await hasUsers())) redirect("/setup");
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser().catch(() => null)) redirect(next);
  return (
    <>
      <h1 style={{ fontSize: "1.3rem", margin: "0 0 16px" }}>Sign in</h1>
      <AuthForm
        action={loginAction}
        submit="Sign in"
        hidden={{ next }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
    </>
  );
}
