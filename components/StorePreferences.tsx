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

export type StoreLanguage =
  | "en"
  | "de"
  | "ru"
  | "fr"
  | "zh"
  | "es"
  | "ar"
  | "th";
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
    operatedBy: "operated by AMAN G.",
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
    operatedBy: "управляется компанией AMAN G.",
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
    operatedBy: "ดำเนินงานโดย AMAN G.",
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

const additionalTranslations: Record<
  "de" | "fr" | "zh" | "es" | "ar",
  Partial<Record<TranslationKey, string>>
> = {
  de: {
    digitalDelivery: "Sofortige digitale Lieferung", genuineProducts: "Originalprodukte", securePayment: "Sichere Zahlung", customerSupport: "Kundendienst", storeTagline: "Digitaler Spiele-Shop", home: "Startseite", allProducts: "Alle Produkte", support: "Support", trackOrder: "Bestellung verfolgen", cart: "Warenkorb", myAccount: "Mein Konto", login: "Anmelden", searchProducts: "Produkte suchen", searchPlaceholder: "Spiele, Geschenkkarten, Abonnements suchen...", search: "Suchen", searching: "Produkte werden gesucht...", noResults: "Keine passenden Produkte gefunden.", openMenu: "Navigationsmenü öffnen", closeMenu: "Navigationsmenü schließen", gamingTopups: "Gaming-Aufladungen", giftCards: "Geschenkkarten", subscriptions: "Abonnements", gameKeys: "Spielschlüssel", inStock: "Auf Lager", outOfStock: "Nicht auf Lager", sold: "Verkauft", unavailable: "Nicht verfügbar", buy: "Kaufen", yourDiscount: "Ihr Rabatt: {percent}%", productCategories: "Produktkategorien", customerHelp: "Kundenhilfe", legal: "Rechtliches", paymentDelivery: "Zahlung & Lieferung", trackYourOrder: "Bestellung verfolgen", contactSupport: "Support kontaktieren", shoppingCart: "Warenkorb", terms: "Allgemeine Geschäftsbedingungen", refundPolicy: "Rückgabe- und Erstattungsrichtlinie", privacyPolicy: "Datenschutzrichtlinie", affiliateProgram: "Partnerprogramm", viewAllProducts: "Alle Produkte anzeigen", secureCheckout: "Sicherer Checkout", checkOrderStatus: "Bestellstatus prüfen", selectDeliveryMethod: "Liefermethode wählen", playerIdTopup: "Aufladung per Spieler-ID", gamingVoucher: "Gaming-Gutschein", selectProductOption: "Produktoption wählen", playerId: "Spieler-ID", deliveryEmail: "Liefer-E-Mail", quantity: "Menge", selectedOption: "Ausgewählte Option", notSelected: "Nicht ausgewählt", deliveryMethod: "Liefermethode", total: "Gesamt", addToCart: "In den Warenkorb", buyNow: "Jetzt kaufen", secureCheckoutLabel: "Sicherer Checkout", chooseProductOption: "Produktoption auswählen", region: "Region", deliveryInstructions: "Lieferhinweise",
  },
  fr: {
    digitalDelivery: "Livraison numérique instantanée", genuineProducts: "Produits authentiques", securePayment: "Paiement sécurisé", customerSupport: "Service client", storeTagline: "Boutique de jeux numériques", home: "Accueil", allProducts: "Tous les produits", support: "Assistance", trackOrder: "Suivre la commande", cart: "Panier", myAccount: "Mon compte", login: "Connexion", searchProducts: "Rechercher des produits", searchPlaceholder: "Rechercher des jeux, cartes cadeaux, abonnements...", search: "Rechercher", searching: "Recherche de produits...", noResults: "Aucun produit correspondant.", openMenu: "Ouvrir le menu", closeMenu: "Fermer le menu", gamingTopups: "Recharges de jeux", giftCards: "Cartes cadeaux", subscriptions: "Abonnements", gameKeys: "Clés de jeux", inStock: "En stock", outOfStock: "Rupture de stock", sold: "Vendus", unavailable: "Indisponible", buy: "Acheter", yourDiscount: "Votre remise de {percent}%", productCategories: "Catégories de produits", customerHelp: "Aide client", legal: "Mentions légales", paymentDelivery: "Paiement et livraison", trackYourOrder: "Suivre votre commande", contactSupport: "Contacter l’assistance", shoppingCart: "Panier", terms: "Conditions générales", refundPolicy: "Politique de retour et remboursement", privacyPolicy: "Politique de confidentialité", affiliateProgram: "Programme d’affiliation", viewAllProducts: "Voir tous les produits", secureCheckout: "Paiement sécurisé", checkOrderStatus: "Vérifier le statut", selectDeliveryMethod: "Choisir le mode de livraison", playerIdTopup: "Recharge par ID joueur", gamingVoucher: "Bon de jeu", selectProductOption: "Sélectionner une option", playerId: "ID joueur", deliveryEmail: "E-mail de livraison", quantity: "Quantité", selectedOption: "Option sélectionnée", notSelected: "Non sélectionné", deliveryMethod: "Mode de livraison", total: "Total", addToCart: "Ajouter au panier", buyNow: "Acheter maintenant", secureCheckoutLabel: "Paiement sécurisé", chooseProductOption: "Choisissez votre option", region: "Région", deliveryInstructions: "Instructions de livraison",
  },
  zh: {
    digitalDelivery: "即时数字交付", genuineProducts: "正品保障", securePayment: "安全支付", customerSupport: "客户支持", storeTagline: "数字游戏商店", home: "首页", allProducts: "全部商品", support: "支持", trackOrder: "订单查询", cart: "购物车", myAccount: "我的账户", login: "登录", searchProducts: "搜索商品", searchPlaceholder: "搜索游戏、礼品卡、订阅...", search: "搜索", searching: "正在搜索商品...", noResults: "未找到匹配商品。", openMenu: "打开导航菜单", closeMenu: "关闭导航菜单", gamingTopups: "游戏充值", giftCards: "礼品卡", subscriptions: "订阅", gameKeys: "游戏密钥", inStock: "有货", outOfStock: "缺货", sold: "已售", unavailable: "不可用", buy: "购买", yourDiscount: "您的折扣 {percent}%", productCategories: "商品分类", customerHelp: "客户帮助", legal: "法律信息", paymentDelivery: "支付与交付", trackYourOrder: "查询您的订单", contactSupport: "联系支持", shoppingCart: "购物车", terms: "条款与条件", refundPolicy: "退货与退款政策", privacyPolicy: "隐私政策", affiliateProgram: "联盟计划", viewAllProducts: "查看全部商品", secureCheckout: "安全结账", checkOrderStatus: "查看订单状态", selectDeliveryMethod: "选择交付方式", playerIdTopup: "玩家 ID 充值", gamingVoucher: "游戏兑换券", selectProductOption: "选择商品选项", playerId: "玩家 ID", deliveryEmail: "接收邮箱", quantity: "数量", selectedOption: "已选选项", notSelected: "未选择", deliveryMethod: "交付方式", total: "总计", addToCart: "加入购物车", buyNow: "立即购买", secureCheckoutLabel: "安全结账", chooseProductOption: "选择商品选项", region: "地区", deliveryInstructions: "交付说明",
  },
  es: {
    digitalDelivery: "Entrega digital instantánea", genuineProducts: "Productos originales", securePayment: "Pago seguro", customerSupport: "Atención al cliente", storeTagline: "Tienda de juegos digitales", home: "Inicio", allProducts: "Todos los productos", support: "Soporte", trackOrder: "Rastrear pedido", cart: "Carrito", myAccount: "Mi cuenta", login: "Iniciar sesión", searchProducts: "Buscar productos", searchPlaceholder: "Buscar juegos, tarjetas regalo, suscripciones...", search: "Buscar", searching: "Buscando productos...", noResults: "No se encontraron productos.", openMenu: "Abrir menú", closeMenu: "Cerrar menú", gamingTopups: "Recargas de juegos", giftCards: "Tarjetas regalo", subscriptions: "Suscripciones", gameKeys: "Claves de juegos", inStock: "En stock", outOfStock: "Agotado", sold: "Vendidos", unavailable: "No disponible", buy: "Comprar", yourDiscount: "Tu descuento del {percent}%", productCategories: "Categorías de productos", customerHelp: "Ayuda al cliente", legal: "Información legal", paymentDelivery: "Pago y entrega", trackYourOrder: "Rastrear tu pedido", contactSupport: "Contactar soporte", shoppingCart: "Carrito", terms: "Términos y condiciones", refundPolicy: "Política de devoluciones y reembolsos", privacyPolicy: "Política de privacidad", affiliateProgram: "Programa de afiliados", viewAllProducts: "Ver todos los productos", secureCheckout: "Pago seguro", checkOrderStatus: "Consultar estado", selectDeliveryMethod: "Seleccionar método de entrega", playerIdTopup: "Recarga por ID de jugador", gamingVoucher: "Cupón de juego", selectProductOption: "Seleccionar opción", playerId: "ID de jugador", deliveryEmail: "Correo de entrega", quantity: "Cantidad", selectedOption: "Opción seleccionada", notSelected: "No seleccionado", deliveryMethod: "Método de entrega", total: "Total", addToCart: "Añadir al carrito", buyNow: "Comprar ahora", secureCheckoutLabel: "Pago seguro", chooseProductOption: "Elige una opción", region: "Región", deliveryInstructions: "Instrucciones de entrega",
  },
  ar: {
    digitalDelivery: "تسليم رقمي فوري", genuineProducts: "منتجات أصلية", securePayment: "دفع آمن", customerSupport: "دعم العملاء", storeTagline: "متجر الألعاب الرقمية", home: "الرئيسية", allProducts: "جميع المنتجات", support: "الدعم", trackOrder: "تتبع الطلب", cart: "السلة", myAccount: "حسابي", login: "تسجيل الدخول", searchProducts: "البحث عن المنتجات", searchPlaceholder: "ابحث عن الألعاب وبطاقات الهدايا والاشتراكات...", search: "بحث", searching: "جارٍ البحث عن المنتجات...", noResults: "لم يتم العثور على منتجات مطابقة.", openMenu: "فتح قائمة التنقل", closeMenu: "إغلاق قائمة التنقل", gamingTopups: "شحن الألعاب", giftCards: "بطاقات الهدايا", subscriptions: "الاشتراكات", gameKeys: "مفاتيح الألعاب", inStock: "متوفر", outOfStock: "نفد المخزون", sold: "تم البيع", unavailable: "غير متوفر", buy: "شراء", yourDiscount: "خصمك {percent}%", productCategories: "فئات المنتجات", customerHelp: "مساعدة العملاء", legal: "المعلومات القانونية", paymentDelivery: "الدفع والتسليم", trackYourOrder: "تتبع طلبك", contactSupport: "اتصل بالدعم", shoppingCart: "سلة التسوق", terms: "الشروط والأحكام", refundPolicy: "سياسة الإرجاع والاسترداد", privacyPolicy: "سياسة الخصوصية", affiliateProgram: "برنامج الشركاء", viewAllProducts: "عرض جميع المنتجات", secureCheckout: "دفع آمن", checkOrderStatus: "تحقق من حالة الطلب", selectDeliveryMethod: "اختر طريقة التسليم", playerIdTopup: "شحن بمعرّف اللاعب", gamingVoucher: "قسيمة ألعاب", selectProductOption: "اختر خيار المنتج", playerId: "معرّف اللاعب", deliveryEmail: "بريد التسليم", quantity: "الكمية", selectedOption: "الخيار المحدد", notSelected: "غير محدد", deliveryMethod: "طريقة التسليم", total: "الإجمالي", addToCart: "أضف إلى السلة", buyNow: "اشتر الآن", secureCheckoutLabel: "دفع آمن", chooseProductOption: "اختر خيار المنتج", region: "المنطقة", deliveryInstructions: "تعليمات التسليم",
  },
};

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
      savedLanguage === "de" ||
      savedLanguage === "ru" ||
      savedLanguage === "fr" ||
      savedLanguage === "zh" ||
      savedLanguage === "es" ||
      savedLanguage === "ar" ||
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
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
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
      const localized =
        language === "en" || language === "ru" || language === "th"
          ? translations[language][key]
          : additionalTranslations[language][key];
      let text: string = localized ?? translations.en[key];

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
        language === "ru"
          ? "ru-RU"
          : language === "th"
            ? "th-TH"
            : language === "de"
              ? "de-DE"
              : language === "fr"
                ? "fr-FR"
                : language === "zh"
                  ? "zh-CN"
                  : language === "es"
                    ? "es-ES"
                    : language === "ar"
                      ? "ar-SA"
                      : "en-US",
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
