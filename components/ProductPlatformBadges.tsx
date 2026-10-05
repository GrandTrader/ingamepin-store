import { normalizeGamePlatforms } from "@/lib/game-platforms";
import LocalizedProductText from "./LocalizedProductText";
import styles from "./ProductPlatformBadges.module.css";

export default function ProductPlatformBadges({ platforms, placement = "inline" }: {
  platforms: unknown;
  placement?: "inline" | "cover";
}) {
  const values = normalizeGamePlatforms(platforms);
  if (!values.length) return null;
  return (
    <ul aria-label="Gaming platforms" className={`${styles.platforms} ${placement === "cover" ? styles.cover : ""}`}>
      {values.map((platform) => (
        <li key={platform} className={styles.platform}>
          <LocalizedProductText english={platform} russian={platform === "PC Only" ? "Только ПК" : platform} />
        </li>
      ))}
    </ul>
  );
}
