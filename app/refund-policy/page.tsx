import type { Metadata } from "next";
import PolicyPage from "../../components/PolicyPage";

export const metadata: Metadata = { title: "Return & Refund Policy" };

const EFFECTIVE_DATE = "13 August 2026";

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Customer Policy"
      title="Return & Refund Policy"
      summary="This policy explains cancellations, replacements and refunds for digital products purchased from InGamePin, operated by AMAN G."
      sections={[
        { title: "Effective date", content: <p><strong>Effective date:</strong> {EFFECTIVE_DATE}</p> },
        { title: "Digital-product policy", content: <><p>Gaming Top-Ups, Gift Cards, Subscriptions and Game Keys are digital products that cannot be physically returned. Once a valid code is revealed, downloaded or delivered, or a top-up or subscription is successfully applied, the order is normally final.</p><p>This policy does not limit a refund, replacement or other remedy required by applicable consumer law.</p></> },
        { title: "When a remedy may be available", content: <><p>Contact us if a paid product was not delivered within its stated or a reasonable delivery time; a delivered code was already redeemed before delivery or is confirmed invalid; the wrong product was delivered because of our error; a top-up failed and was not credited; or you were charged more than once for the same order.</p><p>After verification, the remedy may be re-delivery, replacement, InGamePin Wallet credit or refund to the original payment method, depending on the circumstances and applicable law.</p></> },
        { title: "Generally non-refundable cases", content: <><ul><li>A valid code has been viewed, copied, downloaded, shared, redeemed or resold.</li><li>A top-up was successfully credited to the player ID, server or zone supplied by the customer.</li><li>The customer selected an incompatible country, region, platform, currency, edition, denomination or account.</li><li>The correctly delivered product is no longer wanted.</li><li>The customer’s account is restricted by a publisher or platform.</li><li>Payment cannot be verified as received by InGamePin.</li><li>A blockchain transfer was sent using the wrong network, token or address.</li></ul><p>We will still provide a remedy where applicable law requires one.</p></> },
        { title: "Cancellation", content: <><p>Request cancellation immediately. We may cancel an order only while it remains unprocessed and no code, entitlement or top-up has been supplied. Automatic fulfillment or manual preparation may begin promptly, so a request does not guarantee cancellation.</p></> },
        { title: "How to make a claim", content: <><p>Email <a href="mailto:support@ingamepin.com">support@ingamepin.com</a> promptly with the order number, checkout email, product, issue description, and relevant screenshots or error messages. Never send passwords, OTPs, authenticator codes, full payment credentials or private wallet keys.</p><p>For code issues, keep the code confidential and provide the platform’s redemption error and, if requested, evidence from the issuer showing activation or redemption status. For player-ID top-ups, provide the submitted ID and server plus relevant account evidence.</p></> },
        { title: "Investigation and processing", content: <><p>We may verify payment, delivery logs, download records, code status, player-account credit and supplier or publisher records. Additional information may be requested where reasonably necessary to prevent fraud and determine the claim.</p><p>Approved refunds are sent to the original payment method where practical. Cryptocurrency refunds may require verification of the refund address and network and may be reduced only by unavoidable provider or network costs where permitted and clearly disclosed. Provider and blockchain processing times are outside our control.</p></> },
        { title: "Payment failures and disputes", content: <><p>If funds were debited but InGamePin did not receive them, allow the provider’s normal reversal period and contact us with the transaction reference. Do not make a duplicate payment unless instructed.</p><p>Please contact us before opening a payment dispute so we can investigate. Fraudulent chargebacks, false invalid-code claims or altered evidence may result in account restriction and lawful recovery action.</p></> },
        { title: "Contact and grievance officer", content: <><p><strong>Operator:</strong> AMAN G<br /><strong>GSTIN:</strong> 19CMAPG4174K1ZV<br /><strong>Email:</strong> <a href="mailto:support@ingamepin.com">support@ingamepin.com</a><br /><strong>WhatsApp:</strong> <a href="https://wa.me/919073045011">+91 90730 45011</a><br /><strong>Telegram:</strong> <a href="https://t.me/ingamepinsupport">@ingamepinsupport</a></p></> },
      ]}
    />
  );
}
