import { Button } from "@mantine/core";
import classes from "./message.module.css";

type MessageProps = {
  text: string;
  action?: { label: string; onClick: () => void };
  isProblem?: boolean;
};

/** Stands where the content would be: what is going on, and the way out. */
export function Message({ text, action, isProblem = false }: MessageProps) {
  return (
    <div className={classes.message}>
      <p role={isProblem ? "alert" : "status"} data-problem={isProblem || undefined}>
        {text}
      </p>
      {action !== undefined && (
        <Button variant="outline" size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
