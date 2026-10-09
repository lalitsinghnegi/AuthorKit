import ui from "@/components/ui/ui.module.css";

/** Shown instead of a package preview when the build limits are reached. */
export function BusyNote({ message }: { message: string }) {
  return (
    <p role="alert" className={ui.error}>
      {message} Reload the page to try again.
    </p>
  );
}
