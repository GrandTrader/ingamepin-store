"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StoreLanguage = "en" | "ru";
export type StoreCurrency = "USD" | "RUB";

const translations = {
  en: {
    digitalDelivery: "Digital Delivery",
    genuineProducts: "Genuine Products",
    securePayment: "Secure Payment",
    customerSupport: "Customer Support",
    storeTagline: "Digital Gaming Store",
    home: "Home",
    allProducts: "All Products",
    support: "Support",
    trackOrder: "Track Order",
    cart: "Cart",
    myAccount: "My Account",
    login: "Login",
    searchProducts: "Search products",
    searchPlaceholder: "Search games, gift cards, subscriptions...",
    search: "Search",
    searching: "Searching products...",
    noResults: "No matching products found.",
    openMenu: "Open navigation menu",
    closeMenu: "Close navigation menu",
    gamingTopups: "Gaming Top-Ups",
    giftCards: "Gift Cards",
    subscriptions: "Subscriptions",
    gameKeys: "Game Keys",
    inStock: "In Stock",
    outOfStock: "Out of Stock",
    sold: "Sold",
    unavailable: "Unavailable",
    buy: "Buy",
    yourDiscount: "Your {percent}% discount",
    productCategories: "Product Categories",
    customerHelp: "Customer Help",
    legal: "Legal",
    paymentDelivery: "Payment & Delivery",
    trackYourOrder: "Track Your Order",
    contactSupport: "Contact Support",
    shoppingCart: "Shopping Cart",
    terms: "Terms & Conditions",
    refundPolicy: "Return & Refund Policy",
    privacyPolicy: "Privacy Policy",
    viewAllProducts: "View All Products",
    orderDeliveryLegal: "Order Delivery & Legal",
    checkOrderStatus: "Check order status",
    secureCheckout: "Secure checkout",
    confirmBeforePayment:
      "Confirm your order details before submitting payment.",
    footerSummary:
      "Gaming top-ups, gift cards, subscriptions and game keys with secure digital delivery.",
    rightsReserved: "All rights reserved.",
    trademarkNotice:
      "Product names and trademarks belong to their respective owners.",
    selectDeliveryMethod: "Select delivery method",
    playerIdTopup: "Player ID top-up",
    playerIdTopupDescription: "Top-up is processed using your Player ID.",
    gamingVoucher: "Gaming voucher",
    gamingVoucherDescription: "Receive a voucher code after payment approval.",
    selectValueType: "Select value type",
    fixedValue: "Fixed value",
    customValue: "Custom value",
    selectProductOption: "Select product option",
    enterCustomValue: "Enter custom value",
    enterAmount: "Enter amount",
    allowedRange: "Allowed range",
    playerId: "Player ID",
    checkPlayerId:
      "Check this value carefully. An incorrect Player ID may delay delivery.",
    deliveryEmail: "Delivery email",
    quantity: "Quantity",
    selectedOption: "Selected option",
    notSelected: "Not selected",
    deliveryMethod: "Delivery method",
    total: "Total",
    yourDiscountShort: "Your discount",
    addToCart: "Add to Cart",
    buyNow: "Buy Now",
    secureCheckoutLabel: "Secure checkout",
    chooseProductOption: "Choose your product option",
    region: "Region",
    deliveryInstructions: "Delivery instructions",
  },
  ru: {
    digitalDelivery: "Цифровая доставка",
    genuineProducts: "Оригинальные товары",
    securePayment: "Безопасная оплата",
    customerSupport: "Поддержка клиентов",
    storeTagline: "Магазин цифровых игровых товаров",
    home: "Главная",
    allProducts: "Все товары",
    support: "Поддержка",
    trackOrder: "Отследить заказ",
    cart: "Корзина",
    myAccount: "Мой аккаунт",
    login: "Войти",
    searchProducts: "Поиск товаров",
    searchPlaceholder: "Ищите игры, подарочные карты, подписки...",
    search: "Найти",
    searching: "Поиск товаров...",
    noResults: "Подходящие товары не найдены.",
    openMenu: "Открыть меню",
    closeMenu: "Закрыть меню",
    gamingTopups: "Пополнение игр",
    giftCards: "Подарочные карты",
    subscriptions: "Подписки",
    gameKeys: "Ключи игр",
    inStock: "В наличии",
    outOfStock: "Нет в наличии",
    sold: "продано",
    unavailable: "Недоступно",
    buy: "Купить",
    yourDiscount: "Ваша скидка {percent}%",
    productCategories: "Категории товаров",
    customerHelp: "Помощь покупателям",
    legal: "Правовая информация",
    paymentDelivery: "Оплата и доставка",
    trackYourOrder: "Отследить заказ",
    contactSupport: "Связаться с поддержкой",
    shoppingCart: "Корзина",
    terms: "Условия использования",
    refundPolicy: "Возврат и возмещение",
    privacyPolicy: "Политика конфиденциальности",
    viewAllProducts: "Все товары",
    orderDeliveryLegal: "Доставка и правовая информация",
    checkOrderStatus: "Проверить статус заказа",
    secureCheckout: "Безопасное оформление",
    confirmBeforePayment:
      "Проверьте данные заказа перед отправкой платежа.",
    footerSummary:
      "Пополнение игр, подарочные карты, подписки и игровые ключи с безопасной цифровой доставкой.",
    rightsReserved: "Все права защищены.",
    trademarkNotice:
      "Названия товаров и товарные знаки принадлежат их владельцам.",
    selectDeliveryMethod: "Выберите способ доставки",
    playerIdTopup: "Пополнение по ID игрока",
    playerIdTopupDescription: "Пополнение выполняется по вашему ID игрока.",
    gamingVoucher: "Игровой ваучер",
    gamingVoucherDescription: "Получите код ваучера после подтверждения оплаты.",
    selectValueType: "Выберите тип номинала",
    fixedValue: "Фиксированный номинал",
    customValue: "Своя сумма",
    selectProductOption: "Выберите вариант товара",
    enterCustomValue: "Введите свою сумму",
    enterAmount: "Введите сумму",
    allowedRange: "Допустимый диапазон",
    playerId: "ID игрока",
    checkPlayerId:
      "Внимательно проверьте значение. Неверный ID игрока может задержать доставку.",
    deliveryEmail: "Email для доставки",
    quantity: "Количество",
    selectedOption: "Выбранный вариант",
    notSelected: "Не выбрано",
    deliveryMethod: "Способ доставки",
    total: "Итого",
    yourDiscountShort: "Ваша скидка",
    addToCart: "Добавить в корзину",
    buyNow: "Купить сейчас",
    secureCheckoutLabel: "Безопасное оформление",
    chooseProductOption: "Выберите вариант товара",
    region: "Регион",
    deliveryInstructions: "Инструкции по доставке",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

type StorePreferencesValue = {
  language: StoreLanguage;
  currency: StoreCurrency;
  usdRubRate: number;
  setLanguage: (language: StoreLanguage) => void;
  setCurrency: (currency: StoreCurrency) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatPrice: (
    usdAmount: number,
    options?: Intl.NumberFormatOptions,
  ) => string;
  convertFromUsd: (usdAmount: number) => number;
};

const StorePreferencesContext = createContext<StorePreferencesValue | null>(
  null,
);

export function StorePreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<StoreLanguage>("en");
  const [currency, setCurrencyState] = useState<StoreCurrency>("USD");
  const [usdRubRate, setUsdRubRate] = useState(85);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("storeLanguage");
    const savedCurrency = window.localStorage.getItem("storeCurrency");

    if (savedLanguage === "en" || savedLanguage === "ru") {
      setLanguageState(savedLanguage);
    }

    if (savedCurrency === "USD" || savedCurrency === "RUB") {
      setCurrencyState(savedCurrency);
    }

    fetch("/api/store-settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { usdRubRate?: number } | null) => {
        const rate = Number(result?.usdRubRate);
        if (Number.isFinite(rate) && rate > 0) setUsdRubRate(rate);
      })
      .catch(() => {
        // Keep the safe default when the public setting is temporarily unavailable.
      });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((nextLanguage: StoreLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem("storeLanguage", nextLanguage);
  }, []);

  const setCurrency = useCallback((nextCurrency: StoreCurrency) => {
    setCurrencyState(nextCurrency);
    window.localStorage.setItem("storeCurrency", nextCurrency);
  }, []);

  const t = useCallback(
    (
      key: TranslationKey,
      values: Record<string, string | number> = {},
    ) => {
      let text: string = translations[language][key];

      for (const [name, value] of Object.entries(values)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }

      return text;
    },
    [language],
  );

  const convertFromUsd = useCallback(
    (usdAmount: number) =>
      currency === "RUB" ? usdAmount * usdRubRate : usdAmount,
    [currency, usdRubRate],
  );

  const formatPrice = useCallback(
    (
      usdAmount: number,
      options: Intl.NumberFormatOptions = {},
    ) =>
      new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: currency === "RUB" ? 0 : 2,
        maximumFractionDigits: currency === "RUB" ? 2 : 2,
        ...options,
      }).format(convertFromUsd(usdAmount)),
    [convertFromUsd, currency, language],
  );

  const value = useMemo(
    () => ({
      language,
      currency,
      usdRubRate,
      setLanguage,
      setCurrency,
      t,
      formatPrice,
      convertFromUsd,
    }),
    [
      language,
      currency,
      usdRubRate,
      setLanguage,
      setCurrency,
      t,
      formatPrice,
      convertFromUsd,
    ],
  );

  return (
    <StorePreferencesContext.Provider value={value}>
      {children}
    </StorePreferencesContext.Provider>
  );
}

export function useStorePreferences() {
  const context = useContext(StorePreferencesContext);

  if (!context) {
    throw new Error(
      "useStorePreferences must be used inside StorePreferencesProvider.",
    );
  }

  return context;
}
