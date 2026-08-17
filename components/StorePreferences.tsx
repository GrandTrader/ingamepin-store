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

export type StoreLanguage = "en" | "ru" | "th";
export type StoreCurrency = "USD" | "INR" | "RUB";

const translations = {
  en: {
    digitalDelivery: "Digital Instant Delivery",
    genuineProducts: "Genuine Products",
    securePayment: "Secure Payment",
    customerSupport: "Customer Support",
    storeTagline: "Digital Game Store",
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
    affiliateProgram: "Affiliate Program",
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
    digitalDelivery: "Мгновенная цифровая доставка",
    genuineProducts: "Оригинальные товары",
    securePayment: "Безопасная оплата",
    customerSupport: "Поддержка клиентов",
    storeTagline: "Магазин цифровых игр",
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
    affiliateProgram: "Партнёрская программа",
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
  th: {
    digitalDelivery: "จัดส่งดิจิทัลทันที",
    genuineProducts: "สินค้าของแท้",
    securePayment: "ชำระเงินปลอดภัย",
    customerSupport: "ฝ่ายบริการลูกค้า",
    storeTagline: "ร้านเกมดิจิทัล",
    home: "หน้าหลัก",
    allProducts: "สินค้าทั้งหมด",
    support: "ช่วยเหลือ",
    trackOrder: "ติดตามคำสั่งซื้อ",
    cart: "ตะกร้า",
    myAccount: "บัญชีของฉัน",
    login: "เข้าสู่ระบบ",
    searchProducts: "ค้นหาสินค้า",
    searchPlaceholder: "ค้นหาเกม บัตรของขวัญ การสมัครสมาชิก...",
    search: "ค้นหา",
    searching: "กำลังค้นหาสินค้า...",
    noResults: "ไม่พบสินค้าที่ตรงกัน",
    openMenu: "เปิดเมนูนำทาง",
    closeMenu: "ปิดเมนูนำทาง",
    gamingTopups: "เติมเงินเกม",
    giftCards: "บัตรของขวัญ",
    subscriptions: "การสมัครสมาชิก",
    gameKeys: "คีย์เกม",
    inStock: "มีสินค้า",
    outOfStock: "สินค้าหมด",
    sold: "ขายแล้ว",
    unavailable: "ไม่พร้อมจำหน่าย",
    buy: "ซื้อ",
    yourDiscount: "ส่วนลดของคุณ {percent}%",
    productCategories: "หมวดหมู่สินค้า",
    customerHelp: "ช่วยเหลือลูกค้า",
    legal: "ข้อมูลทางกฎหมาย",
    paymentDelivery: "การชำระเงินและการจัดส่ง",
    trackYourOrder: "ติดตามคำสั่งซื้อของคุณ",
    contactSupport: "ติดต่อฝ่ายช่วยเหลือ",
    shoppingCart: "ตะกร้าสินค้า",
    terms: "ข้อกำหนดและเงื่อนไข",
    refundPolicy: "นโยบายคืนสินค้าและคืนเงิน",
    privacyPolicy: "นโยบายความเป็นส่วนตัว",
    affiliateProgram: "โปรแกรมพันธมิตร",
    viewAllProducts: "ดูสินค้าทั้งหมด",
    orderDeliveryLegal: "การจัดส่งและข้อมูลทางกฎหมาย",
    checkOrderStatus: "ตรวจสอบสถานะคำสั่งซื้อ",
    secureCheckout: "ชำระเงินอย่างปลอดภัย",
    confirmBeforePayment: "ตรวจสอบรายละเอียดคำสั่งซื้อก่อนชำระเงิน",
    footerSummary:
      "เติมเงินเกม บัตรของขวัญ การสมัครสมาชิก และคีย์เกม พร้อมการจัดส่งดิจิทัลที่ปลอดภัย",
    rightsReserved: "สงวนลิขสิทธิ์",
    trademarkNotice: "ชื่อสินค้าและเครื่องหมายการค้าเป็นของเจ้าของแต่ละราย",
    selectDeliveryMethod: "เลือกวิธีจัดส่ง",
    playerIdTopup: "เติมเงินด้วย ID ผู้เล่น",
    playerIdTopupDescription: "ระบบจะเติมเงินโดยใช้ ID ผู้เล่นของคุณ",
    gamingVoucher: "บัตรเติมเงินเกม",
    gamingVoucherDescription: "รับรหัสบัตรหลังจากยืนยันการชำระเงิน",
    selectValueType: "เลือกประเภทยอดเงิน",
    fixedValue: "มูลค่าคงที่",
    customValue: "กำหนดจำนวนเอง",
    selectProductOption: "เลือกตัวเลือกสินค้า",
    enterCustomValue: "กรอกจำนวนที่ต้องการ",
    enterAmount: "กรอกจำนวนเงิน",
    allowedRange: "ช่วงที่อนุญาต",
    playerId: "ID ผู้เล่น",
    checkPlayerId: "โปรดตรวจสอบให้ถูกต้อง ID ผู้เล่นที่ผิดอาจทำให้การจัดส่งล่าช้า",
    deliveryEmail: "อีเมลสำหรับจัดส่ง",
    quantity: "จำนวน",
    selectedOption: "ตัวเลือกที่เลือก",
    notSelected: "ยังไม่ได้เลือก",
    deliveryMethod: "วิธีจัดส่ง",
    total: "ยอดรวม",
    yourDiscountShort: "ส่วนลดของคุณ",
    addToCart: "เพิ่มลงตะกร้า",
    buyNow: "ซื้อเลย",
    secureCheckoutLabel: "ชำระเงินอย่างปลอดภัย",
    chooseProductOption: "เลือกตัวเลือกสินค้า",
    region: "ภูมิภาค",
    deliveryInstructions: "คำแนะนำการจัดส่ง",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

type StorePreferencesValue = {
  language: StoreLanguage;
  currency: StoreCurrency;
  usdRubRate: number;
  usdInrRate: number;
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
  const [usdInrRate, setUsdInrRate] = useState(102);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("storeLanguage");
    const savedCurrency = window.localStorage.getItem("storeCurrency");

    if (
      savedLanguage === "en" ||
      savedLanguage === "ru" ||
      savedLanguage === "th"
    ) {
      setLanguageState(savedLanguage);
    }

    if (
      savedCurrency === "USD" ||
      savedCurrency === "INR" ||
      savedCurrency === "RUB"
    ) {
      setCurrencyState(savedCurrency);
    }

    fetch("/api/store-settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { usdRubRate?: number; usdInrRate?: number } | null) => {
        const rubRate = Number(result?.usdRubRate);
        const inrRate = Number(result?.usdInrRate);
        if (Number.isFinite(rubRate) && rubRate > 0) setUsdRubRate(rubRate);
        if (Number.isFinite(inrRate) && inrRate > 0) setUsdInrRate(inrRate);
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
    (usdAmount: number) => {
      if (currency === "RUB") return usdAmount * usdRubRate;
      if (currency === "INR") return usdAmount * usdInrRate;
      return usdAmount;
    },
    [currency, usdInrRate, usdRubRate],
  );

  const formatPrice = useCallback(
    (
      usdAmount: number,
      options: Intl.NumberFormatOptions = {},
    ) =>
      new Intl.NumberFormat(
        language === "ru" ? "ru-RU" : language === "th" ? "th-TH" : "en-US",
        {
        style: "currency",
        currency,
        minimumFractionDigits: currency === "USD" ? 2 : 0,
        maximumFractionDigits: currency === "RUB" ? 2 : 2,
        ...options,
        },
      ).format(convertFromUsd(usdAmount)),
    [convertFromUsd, currency, language],
  );

  const value = useMemo(
    () => ({
      language,
      currency,
      usdRubRate,
      usdInrRate,
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
      usdInrRate,
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
