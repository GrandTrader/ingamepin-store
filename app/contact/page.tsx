import { permanentRedirect } from "next/navigation";

export default function ContactRedirect() {
  permanentRedirect("/contact-us");
}
