import * as React from "react";
import { DialogContent, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const dialogWidths = {
  standard: "max-w-lg",
  large: "max-w-3xl",
  wide: "max-w-[1080px]",
};

export function FormDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-form-dialog-footer
      className={cn(className, "mt-0 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-6 py-4 sm:justify-end sm:space-x-0 [&_button]:min-h-10 [&_button]:min-w-24 [&>div]:flex-wrap")}
      {...props}
    />
  );
}

export const FormDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent> & { size?: keyof typeof dialogWidths }
>(({ children, className, size = "standard", ...props }, ref) => {
  const elements = React.Children.toArray(children);
  const header = elements.filter(child => React.isValidElement(child) && child.type === DialogHeader);
  const footer = elements.filter(child => React.isValidElement(child) && child.type === FormDialogFooter);
  const body = elements.filter(child => !header.includes(child) && !footer.includes(child));

  return (
    <DialogContent
      ref={ref}
      className={cn("w-[calc(100vw_-_2rem)]", dialogWidths[size], className, "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 rounded-lg")}
      {...props}
    >
      <div className="shrink-0 border-b px-6 py-3 pr-12 [&>div]:text-left [&_h2]:text-lg [&_h2]:leading-6">{header}</div>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5 [&>*]:!mt-0 [&>.space-y-3]:space-y-4 [&>fieldset]:gap-4">{body}</div>
      {footer}
    </DialogContent>
  );
});
FormDialogContent.displayName = "FormDialogContent";
