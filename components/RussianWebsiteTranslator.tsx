"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useStorePreferences } from "./StorePreferences";

const russianText: Record<string, string> = {
  "Return to dashboard": "Вернуться в личный кабинет",
  "← Return to dashboard": "← Вернуться в личный кабинет",
  "Available balance": "Доступный баланс",
  "USD wallet": "USD-кошелёк",
  "Add money": "Пополнить кошелёк",
  "Choose an amount and pay using any available gateway.":
    "Выберите сумму и оплатите через любой доступный способ.",
  "Add money through any available payment gateway.":
    "Пополняйте баланс через любой доступный способ оплаты.",
  "Your balance is credited automatically after verified payment.":
    "Баланс пополняется автоматически после подтверждения платежа.",
  "Top-up amount (USD)": "Сумма пополнения (USD)",
  "Minimum amount: $10": "Минимальная сумма: $10",
  "Payment method": "Способ оплаты",
  "Instant verification": "Мгновенное подтверждение",
  "Cards and local methods": "Карты и местные способы оплаты",
  "Available payment methods": "Доступные способы оплаты",
  "Add amount": "Сумма пополнения",
  "New balance": "Новый баланс",
  "Minimum wallet top-up: $10. New configured gateway adapters appear here automatically.":
    "Минимальное пополнение кошелька: $10. Новые способы оплаты появляются здесь автоматически.",
  "Continue to payment": "Перейти к оплате",
  "Bulk delivery information": "Информация об оптовой доставке",
  "Bulk Delivery Time: 1-15 Working Days": "Срок оптовой доставки: 1–15 рабочих дней",
  "Please confirm that you understand the delivery time.":
    "Подтвердите, что вы понимаете срок доставки.",
  "I understand": "Понятно",
  "Your cart contains a bulk delivery product. Confirm before continuing to payment.":
    "В вашей корзине есть товар с оптовой доставкой. Подтвердите это перед переходом к оплате.",
  "Cancel": "Отмена",
  "Opening payment gateway...": "Открываем платёжную систему...",
  "Recent top-ups": "Недавние пополнения",
  "No top-ups yet.": "Пополнений пока нет.",
  "Welcome back": "С возвращением",
  "Sign in to manage your orders, wallet and profile.":
    "Войдите, чтобы управлять заказами, кошельком и профилем.",
  "Customer account": "Аккаунт покупателя",
  "Email address": "Адрес электронной почты",
  Password: "Пароль",
  "Sign in": "Войти",
  "Forgot password?": "Забыли пароль?",
  "New customer?": "Новый покупатель?",
  "Create account": "Создать аккаунт",
  "Create your account": "Создайте аккаунт",
  "Already have an account?": "Уже есть аккаунт?",
  "Enter your OTP": "Введите код",
  "Verify & Activate Account": "Подтвердить и активировать аккаунт",
  "Resend verification code": "Отправить код повторно",
  "Use a different email address": "Использовать другой email",
  "My orders": "Мои заказы",
  "My codes": "Мои коды",
  "My wallet": "Мой кошелёк",
  Profile: "Профиль",
  "Sign out": "Выйти",
  "Wallet balance": "Баланс кошелька",
  "Delivered codes": "Полученные коды",
  Notifications: "Уведомления",
  "Account details": "Данные аккаунта",
  "Full name": "Полное имя",
  Phone: "Телефон",
  "Save profile": "Сохранить профиль",
  "Shopping Cart": "Корзина",
  "Your cart is empty.": "Ваша корзина пуста.",
  "Continue shopping": "Продолжить покупки",
  Product: "Товар",
  Price: "Цена",
  Quantity: "Количество",
  Subtotal: "Промежуточный итог",
  Discount: "Скидка",
  Delivery: "Доставка",
  Taxes: "Налоги",
  "Total Amount": "Итоговая сумма",
  "Remove": "Удалить",
  "Clear cart": "Очистить корзину",
  "Proceed to checkout": "Перейти к оформлению",
  "Secure order processing": "Безопасное оформление заказа",
  "Complete your details and choose a payment method.":
    "Заполните данные и выберите способ оплаты.",
  "Billing details": "Данные покупателя",
  "Customer name": "Имя покупателя",
  "Email for delivery": "Email для доставки",
  "Phone number": "Номер телефона",
  "Delivery Method": "Способ доставки",
  "Payment Method": "Способ оплаты",
  "Order Note": "Примечание к заказу",
  "Optional delivery instructions.": "Дополнительные инструкции по доставке.",
  "Continue to Payment": "Перейти к оплате",
  "Your information is securely processed":
    "Ваши данные обрабатываются безопасно",
  "I agree to the Terms, privacy policy and applicable returns or replacement policy.":
    "Я принимаю Условия, политику конфиденциальности и правила возврата или замены.",
  "Payment unavailable": "Оплата недоступна",
  "Return to checkout": "Вернуться к оформлению",
  "Order total": "Сумма заказа",
  "Pay securely with PayPalych": "Безопасная оплата через PayPalych",
  "Continue to PayPalych": "Перейти к PayPalych",
  "Pay with USDT": "Оплатить USDT",
  "Direct wallet payment": "Прямая оплата на кошелёк",
  "Your payment is verified automatically on the blockchain.":
    "Платёж автоматически проверяется в блокчейне.",
  "Select the network you will send from": "Выберите сеть отправки",
  "Solana network": "\u0421\u0435\u0442\u044c Solana",
  Network: "Сеть",
  "Send exactly": "Отправьте точно",
  "Receiving address": "Адрес получателя",
  "Copy address": "Копировать адрес",
  "I have sent the payment": "Я отправил платёж",
  "Invoice expires in": "Счёт истекает через",
  "Payment detected": "Платёж обнаружен",
  "Waiting for blockchain confirmation...":
    "Ожидаем подтверждение в блокчейне...",
  "Contact Support": "Связаться с поддержкой",
  "How can we help?": "Чем мы можем помочь?",
  "Get help with orders, payments, delivery and your account.":
    "Получите помощь по заказам, оплате, доставке и аккаунту.",
  "Telegram Support": "Поддержка в Telegram",
  "Message us on Telegram": "Написать нам в Telegram",
  "WhatsApp Support": "Поддержка в WhatsApp",
  "Message us on WhatsApp": "Написать нам в WhatsApp",
  "Support hours": "Часы поддержки",
  "Frequently asked questions": "Часто задаваемые вопросы",
  "Track your order": "Отследить заказ",
  "Enter your order number and email address to check its status.":
    "Введите номер заказа и email, чтобы проверить статус.",
  "Order number": "Номер заказа",
  "Check status": "Проверить статус",
  "Order status": "Статус заказа",
  Status: "Статус",
  Date: "Дата",
  Amount: "Сумма",
  "Order items": "Товары в заказе",
  "Featured Products": "Рекомендуемые товары",
  "Popular Categories": "Популярные категории",
  "For resellers & businesses": "Для реселлеров и бизнеса",
  "Need products in bulk quantity?": "Нужны товары оптом?",
  "Explore bulk products with flexible quantities, competitive B2B pricing and dedicated support.":
    "Ознакомьтесь с оптовыми товарами, гибкими объёмами, выгодными B2B-ценами и персональной поддержкой.",
  "View B2B Bulk Products": "Смотреть оптовые товары B2B",
  "B2B Bulk Products": "Оптовые товары B2B",
  "Bulk digital products for resellers and businesses with flexible quantities and dedicated support.":
    "Оптовые цифровые товары для реселлеров и бизнеса с гибкими объёмами и персональной поддержкой.",
  "No active products are available in this collection yet.":
    "В этой оптовой категории пока нет доступных товаров.",
  "View all": "Смотреть все",
  "Shop now": "Купить сейчас",
  "No products found.": "Товары не найдены.",
  "Accepted payment methods": "Принимаемые способы оплаты",
  "Secure payments • Automatic verification":
    "Безопасная оплата • Автоматическое подтверждение",
  "Live Chat": "Онлайн-чат",
  "InGamePin Support": "Поддержка InGamePin",
  "We usually reply shortly": "Обычно мы отвечаем быстро",
  "Start chat": "Начать чат",
  Name: "Имя",
  Email: "Email",
  Message: "Сообщение",
  Send: "Отправить",
  "Close chat": "Закрыть чат",
  "Type your message...": "Введите сообщение...",
  "Terms & Conditions": "Условия использования",
  "Return & Refund Policy": "Политика возврата средств",
  "Privacy Policy": "Политика конфиденциальности",
  "Last updated": "Последнее обновление",
  "Back to store": "Вернуться в магазин",
  "Different products": "Разные товары",
  "Total quantity": "Общее количество",
  "Your product discounts": "Ваши скидки на товары",
  "USDT network": "Сеть USDT",
  "Top-up pending": "Пополнение ожидает подтверждения",
  "Top-up requests": "Заявки на пополнение",
  "No wallet top-up requests yet.": "Заявок на пополнение пока нет.",
  "Wallet transactions": "Операции кошелька",
  "No wallet transactions yet.": "Операций по кошельку пока нет.",
  "Wallet": "Кошелёк",
  "Customer": "Покупатель",
  "Overview": "Обзор",
  "My account": "Мой аккаунт",
  "Manage purchases, codes, notifications and wallet balance.": "Управляйте покупками, кодами, уведомлениями и балансом кошелька.",
  "Add money or view transactions →": "Пополнить баланс или посмотреть операции →",
  "Total orders": "Всего заказов",
  "Available securely below": "Доступно в защищённом разделе ниже",
  "Newest purchases appear first.": "Новые покупки отображаются первыми.",
  "Track an order": "Отследить заказ",
  "No orders found for this email address.": "Заказы для этого адреса электронной почты не найдены.",
  "Products": "Товары",
  "My delivered codes": "Мои полученные коды",
  "Keep codes private and redeem them only on the official platform.": "Храните коды в тайне и активируйте их только на официальной платформе.",
  "No delivered digital codes yet.": "Полученных цифровых кодов пока нет.",
  "Delivered": "Доставлено",
  "No notifications yet.": "Уведомлений пока нет.",
  "Not added": "Не добавлено",
  "Email status": "Статус email",
  "Verified": "Подтверждён",
  "Welcome to InGamePin": "Добро пожаловать в InGamePin",
  "Sign in to track orders, access delivered codes and manage your wallet.": "Войдите, чтобы отслеживать заказы, получать коды и управлять кошельком.",
  "Login": "Вход",
  "Reset password": "Сбросить пароль",
  "We will send a secure reset link to your email.": "Мы отправим безопасную ссылку для сброса пароля на ваш email.",
  "Send reset link": "Отправить ссылку для сброса",
  "Return to login": "Вернуться ко входу",
  "Choose new password": "Выберите новый пароль",
  "New password": "Новый пароль",
  "Confirm password": "Подтвердите пароль",
  "Update password": "Обновить пароль",
  "Add money to your wallet": "Пополнить кошелёк",
  "Binance calculates the supported cryptocurrency amount from your USD top-up.": "Binance рассчитает сумму поддерживаемой криптовалюты из суммы пополнения в USD.",
  "Wallet top-up": "Пополнение кошелька",
  "Cancel and return to wallet": "Отменить и вернуться в кошелёк",
  "Monday - Sunday": "Понедельник — воскресенье",
  "Response Time": "Время ответа",
  "Usually 5–15 mins": "Обычно 5–15 минут",
  "Language": "Язык",
  "English, Hindi, Bengali": "Английский, хинди, бенгальский",
  "Select state": "Выберите штат",
  "Balance": "Баланс",
  "Digital Email Delivery": "Цифровая доставка по email",
  "Delivery instructions will be sent to your email.": "Инструкции по доставке будут отправлены на ваш email.",
  "FREE": "БЕСПЛАТНО",
  "Pay securely with Binance": "Безопасная оплата через Binance",
  "Pay with USDT on TRC20, BEP20, or Solana": "\u041e\u043f\u043b\u0430\u0442\u0430 USDT \u0432 \u0441\u0435\u0442\u044f\u0445 TRC20, BEP20 \u0438\u043b\u0438 Solana",
  "Cards and other payment methods": "Карты и другие способы оплаты",
  "Faster Payments System or USDT": "Система быстрых платежей или USDT",
  "Insufficient wallet balance": "Недостаточно средств в кошельке",
  "Sign in to use your wallet": "Войдите, чтобы использовать кошелёк",
  "Included": "Включено",
  "Secure": "Безопасно",
  "Genuine": "Оригинальные товары",
  "Support": "Поддержка",
  "Trending Now": "Сейчас популярно",
  "Find Your Product": "Найдите свой товар",
  "Explore Products": "Смотреть товары",
  "Browse all products": "Все товары",
  "View product": "Открыть товар",
  "From": "От",
  "In stock": "В наличии",
  "Out of stock": "Нет в наличии",
  "Choose your product option": "Выберите вариант товара",
  "Select product option": "Выберите вариант товара",
  "Selected option": "Выбранный вариант",
  "Add to Cart": "Добавить в корзину",
  "Buy Now": "Купить сейчас",
  "Secure checkout": "Безопасное оформление",
  "Product Description": "Описание товара",
  "Game Features": "Особенности игры",
  "Region": "Регион",
  "Digital Product": "Цифровой товар",
  "Required customer information": "Необходимые данные покупателя",
  "Complete the required information for this product.": "Заполните обязательные данные для этого товара.",
  "Enter your details": "Введите данные",
  "Order summary": "Сводка заказа",
  "Place Order": "Оформить заказ",
  "Processing order...": "Обрабатываем заказ...",
  "Creating payment...": "Создаём платёж...",
  "Payment successful": "Оплата прошла успешно",
  "Your order has been paid successfully.": "Ваш заказ успешно оплачен.",
  "Continue": "Продолжить",
  "Back": "Назад",
  "Copy": "Копировать",
  "Copied": "Скопировано",
  "Loading...": "Загрузка...",
  "Please wait...": "Пожалуйста, подождите...",
  "Try again": "Попробовать снова",
  "Something went wrong.": "Что-то пошло не так.",
  "Payment failed": "Ошибка оплаты",
  "The payment was cancelled or could not be completed.": "Платёж был отменён или не удалось его завершить.",
  "Return to cart": "Вернуться в корзину",
  "Order completed": "Заказ завершён",
  "Thank you for your order.": "Спасибо за ваш заказ.",
  "Track Order": "Отследить заказ",
  "Search": "Найти",
  "Search products": "Поиск товаров",
  "All Products": "Все товары",
  "Home": "Главная",
  "Cart": "Корзина",
  "My Account": "Мой аккаунт",
  "Preorder": "Предзаказ",
  "Preorder Now": "Оформить предзаказ",
  "Preorder price": "Цена предзаказа",
  "Launches In": "До выхода",
  "Days": "Дней",
  "Hours": "Часов",
  "Min": "Мин",
  "Sec": "Сек",
  "Maybe Later": "Может быть позже",
  "Customer information": "Данные покупателя",
  "Submit preorder": "Оформить предзаказ",
  "Secure your preorder": "Оформите безопасный предзаказ",
  "Direct USDT": "Прямой платёж USDT",
  "PayPalych": "PayPalych",
  "FreeKassa": "FreeKassa",
  "Binance Pay": "Binance Pay",
  PENDING: "ОЖИДАЕТ",
  PAID: "ОПЛАЧЕН",
  VERIFIED: "ПОДТВЕРЖДЁН",
  PROCESSING: "ОБРАБАТЫВАЕТСЯ",
  DELIVERED: "ДОСТАВЛЕН",
  COMPLETED: "ЗАВЕРШЁН",
  FAILED: "ОШИБКА",
  CANCELLED: "ОТМЕНЁН",
  EXPIRED: "ИСТЁК",
};

const russianPatterns: Array<[RegExp, (...matches: string[]) => string]> = [
  [/^Hello,\s+(.+)$/, (name) => `Здравствуйте, ${name}`],
  [/^Minimum amount:\s*\$(.+)$/, (amount) => `Минимальная сумма: $${amount}`],
  [/^Order\s+(.+)$/, (number) => `Заказ ${number}`],
  [/^(.+)\s+items?$/, (count) => `${count} товар(ов)`],
  [/^Orders using\s+(.+)$/, (email) => `Заказы пользователя ${email}`],
  [/^We sent an?\s+(?:six|eight)-digit verification code to\s+(.+)\.$/, (email) => `Мы отправили код подтверждения на ${email}.`],
  [/^Invoice expires in\s+(.+)$/, (time) => `Счёт истекает через ${time}`],
  [/^(.+)\s+available$/, (count) => `Доступно: ${count}`],
];

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["placeholder", "title", "aria-label"];

function translateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const normalized = trimmed.replace(/\s+/g, " ");

  let translated = russianText[normalized];
  if (!translated) {
    for (const [pattern, formatter] of russianPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        translated = formatter(...match.slice(1));
        break;
      }
    }
  }

  if (!translated) return value;
  const leadingSpace = value.match(/^\s*/)?.[0] ?? "";
  const trailingSpace = value.match(/\s*$/)?.[0] ?? "";
  return `${leadingSpace}${translated}${trailingSpace}`;
}

function isExcluded(node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  return Boolean(
    element?.closest(
      "script, style, code, pre, textarea, [data-no-auto-translate], [contenteditable='true']",
    ),
  );
}

function updatePage(root: HTMLElement, useRussian: boolean) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    if (!isExcluded(textNode)) {
      if (useRussian) {
        const source = originalText.get(textNode) ?? textNode.data;
        const translated = translateValue(source);
        if (translated !== source) {
          originalText.set(textNode, source);
          if (textNode.data !== translated) textNode.data = translated;
        }
      } else {
        const source = originalText.get(textNode);
        if (source !== undefined && textNode.data !== source) {
          textNode.data = source;
        }
      }
    }
    current = walker.nextNode();
  }

  for (const element of root.querySelectorAll("*")) {
    if (isExcluded(element)) continue;

    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;

      if (useRussian) {
        const saved = originalAttributes.get(element);
        const source = saved?.get(attribute) ?? element.getAttribute(attribute) ?? "";
        const translated = translateValue(source);
        if (translated !== source) {
          const values = saved ?? new Map<string, string>();
          values.set(attribute, source);
          originalAttributes.set(element, values);
          if (element.getAttribute(attribute) !== translated) {
            element.setAttribute(attribute, translated);
          }
        }
      } else {
        const source = originalAttributes.get(element)?.get(attribute);
        if (source !== undefined && element.getAttribute(attribute) !== source) {
          element.setAttribute(attribute, source);
        }
      }
    }
  }
}

export default function RussianWebsiteTranslator() {
  const pathname = usePathname();
  const { language } = useStorePreferences();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const root = document.body;
    const observer = new MutationObserver(() => {
      observer.disconnect();
      updatePage(root, language === "ru");
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: translatedAttributes,
      });
    });

    updatePage(root, language === "ru");
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes,
    });

    return () => observer.disconnect();
  }, [language, pathname]);

  return null;
}
