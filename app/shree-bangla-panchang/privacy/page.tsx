import type { Metadata } from "next";
import PolicyPage from "../../../components/PolicyPage";

export const metadata: Metadata = {
  title: "Shree Bangla Panchang Privacy Policy",
  description:
    "Privacy policy for the Shree Bangla Panchang Android application.",
};

const EFFECTIVE_DATE = "29 August 2026";

export default function ShreeBanglaPanchangPrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Shree Bangla Panchang"
      title="App Privacy Policy"
      summary="This policy explains how the Shree Bangla Panchang Android app handles location, birth details, Panchang updates, notifications and other app data."
      sections={[
        {
          title: "Effective date and app operator",
          content: (
            <>
              <p><strong>Effective date:</strong> {EFFECTIVE_DATE}</p>
              <p>Shree Bangla Panchang is operated by AMAN G under the InGamePin website. Privacy questions may be sent to <a href="mailto:support@ingamepin.com">support@ingamepin.com</a>.</p>
            </>
          ),
        },
        {
          title: "Information handled by the app",
          content: (
            <>
              <ul>
                <li><strong>Optional location:</strong> If you choose GPS, the app may access approximate and precise location to determine coordinates and location-dependent Panchang or Kundli calculations. You may instead enter a place manually.</li>
                <li><strong>Kundli information:</strong> Name, birth date, birth time, birthplace, latitude and longitude that you enter or select are used to generate the requested Kundli.</li>
                <li><strong>Preferences:</strong> Language, region, notification choices and other settings may be stored on your device.</li>
                <li><strong>Online requests:</strong> When the app checks for Panchang, festival, Puja, Ekadashi, eclipse or notification updates, the server may receive standard technical request information such as IP address, request time and app version.</li>
              </ul>
            </>
          ),
        },
        {
          title: "How information is used",
          content: (
            <p>Information is used only to provide app functions, including location-based calculations, Bengali calendar and Panchang information, Kundli generation, downloadable Kundli PDFs, regional content for Bangladesh and West Bengal, online data updates, and reminders selected by the user.</p>
          ),
        },
        {
          title: "Location choices",
          content: (
            <>
              <p>Location permission is optional. The app requests it only when you choose a GPS-based feature. You can deny or revoke location permission in Android settings and use manual birthplace entry instead.</p>
              <p>GPS coordinates are processed for the requested feature and are not intentionally retained on our server. Android, Google Play services or a geocoding provider may process location under their own privacy terms when providing device location or converting coordinates into a place name.</p>
            </>
          ),
        },
        {
          title: "Kundli data and PDF files",
          content: (
            <p>Kundli inputs, calculations and generated PDF files are intended to remain on the user&apos;s device and are not intentionally uploaded to or stored by the app operator. A PDF is shared with another app only when the user chooses Android&apos;s share or save function.</p>
          ),
        },
        {
          title: "Online Panchang updates and server logs",
          content: (
            <>
              <p>The app connects securely to our online service to obtain current and future Panchang, festival, Puja, Ekadashi, Amavasya, Purnima, eclipse, Rashifal and notification information. These updates do not require an account.</p>
              <p>Hosting and security systems may temporarily retain ordinary server logs, including IP address, request time, requested resource and technical error information, for delivery, reliability, abuse prevention and troubleshooting. Logs are not used to create a personal profile.</p>
            </>
          ),
        },
        {
          title: "Notifications",
          content: (
            <p>If you enable notifications, the app uses Android notification and background scheduling features to remind you about selected festivals, Puja, Ekadashi, eclipses and other events. Notification permission can be changed at any time in the app or Android settings.</p>
          ),
        },
        {
          title: "Accounts, advertising and payments",
          content: (
            <p>The current app does not require account creation, does not include paid digital purchases and does not use information for targeted advertising. If these features are introduced later, this policy and the Google Play data-safety declaration will be updated before or when the change is released.</p>
          ),
        },
        {
          title: "Sharing and service providers",
          content: (
            <p>We do not sell personal information. Limited technical information may be processed by hosting, network-security, device-location or geocoding providers only as needed to operate the requested feature, protect the service or comply with law.</p>
          ),
        },
        {
          title: "Security and retention",
          content: (
            <>
              <p>Network requests are protected using HTTPS. No method of electronic transmission or storage is completely secure.</p>
              <p>On-device app information remains until it is removed through the app, Android settings or uninstalling the app. Server logs are retained only as reasonably necessary for security, reliability and legal obligations, then deleted or anonymized.</p>
            </>
          ),
        },
        {
          title: "Children",
          content: (
            <p>The app is intended for users aged 13 and over. It does not knowingly collect personal information from children under 13. A parent or guardian may contact us if they believe a child provided personal information.</p>
          ),
        },
        {
          title: "Your choices and contact",
          content: (
            <>
              <p>You may deny permissions, turn off notifications, use manual location entry, clear app storage or uninstall the app. Because the app has no user accounts, most user-entered information can be removed directly from the device.</p>
              <p>For questions or requests, contact <a href="mailto:support@ingamepin.com">support@ingamepin.com</a>. We may update this policy when the app or legal requirements change; the effective date will be revised when an update is published.</p>
            </>
          ),
        },
      ]}
    />
  );
}
