// Replace only the previous importer’s standard paragraphs when the product
// actually uses protected account details. Preserve all other merchant copy.
export function gameAccountDescription(description: string | null | undefined, protectedFields: boolean) {
  if (!description || !protectedFields) return description;
  return description
    .replace("📧 Required: Your PlayStation account email and PSN Online ID.", "📧 Required: Login Email, Login Password and one 2FA backup/recovery code for your game account.")
    .replace("🔐 Secure verification: Enter your password and any 2FA code directly on PlayStation’s official sign-in page. Do not send passwords, verification codes or backup codes through chat.", "🔐 Account authorization: Use the protected form on this page to authorize InGamePin to complete your purchase. Do not send passwords or backup codes through chat. Details expire after 24 hours and are removed when the order is completed or cancelled.")
    .replace("📧 Что потребуется: адрес электронной почты вашей учетной записи PlayStation и PSN Online ID.", "📧 Что потребуется: email для входа, пароль и один резервный код двухфакторной аутентификации (2FA) вашей игровой учетной записи.")
    .replace("🔐 Безопасная проверка: вводите пароль и код двухфакторной аутентификации (2FA) только на официальной странице входа PlayStation. Не передавайте пароли, коды подтверждения или резервные коды в чате.", "🔐 Разрешение на доступ: заполните защищенную форму на этой странице, чтобы разрешить InGamePin выполнить покупку. Не передавайте пароли или резервные коды в чате. Данные действуют 24 часа и удаляются после выполнения или отмены заказа.");
}
