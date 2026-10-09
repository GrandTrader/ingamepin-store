type ContactMessage = {
  name: string;
  email: string;
  body: string;
};

export function parseContactMessage(
  input: Record<string, unknown>,
  accountEmail?: string | null,
): { contact: ContactMessage; error?: never } | { error: string; contact?: never } {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const name = text(input.name);
  const email = text(accountEmail || input.email).toLowerCase();
  const subject = text(input.subject);
  const orderNumber = text(input.orderNumber);
  const message = text(input.message);

  if (text(input.website)) return { error: "Unable to send this message." };
  if (!name || name.length > 100 || /[\r\n]/.test(name)) return { error: "Enter your name (up to 100 characters)." };
  if (email.length > 254 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) return { error: "Enter a valid email address." };
  if (!subject || subject.length > 120 || /[\r\n]/.test(subject)) return { error: "Enter a subject (up to 120 characters)." };
  if (orderNumber.length > 80 || /[\r\n]/.test(orderNumber)) return { error: "Enter a valid order number (up to 80 characters)." };
  if (!message || message.length > 1500) return { error: "Enter your message (up to 1,500 characters)." };

  return {
    contact: {
      name,
      email,
      body: ["[Contact form]", `Subject: ${subject}`, ...(orderNumber ? [`Order number: ${orderNumber}`] : []), "", message].join("\n"),
    },
  };
}
