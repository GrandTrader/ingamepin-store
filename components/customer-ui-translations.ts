import type { StoreLanguage } from "./StorePreferences";

const messages: Record<string, Record<Exclude<StoreLanguage, "en">, string>> = {
  "Home": {
    "de": "Start",
    "ru": "Главная",
    "fr": "Accueil",
    "zh": "首页",
    "es": "Inicio",
    "ar": "الرئيسية",
    "th": "หน้าแรก"
  },
  "Browse": {
    "de": "Stöbern",
    "ru": "Каталог",
    "fr": "Catalogue",
    "zh": "浏览",
    "es": "Explorar",
    "ar": "تصفح",
    "th": "เรียกดู"
  },
  "Orders": {
    "de": "Bestellungen",
    "ru": "Заказы",
    "fr": "Commandes",
    "zh": "订单",
    "es": "Pedidos",
    "ar": "الطلبات",
    "th": "คำสั่งซื้อ"
  },
  "Account": {
    "de": "Konto",
    "ru": "Аккаунт",
    "fr": "Compte",
    "zh": "账户",
    "es": "Cuenta",
    "ar": "الحساب",
    "th": "บัญชี"
  },
  "My account": {
    "de": "Mein Konto",
    "ru": "Мой аккаунт",
    "fr": "Mon compte",
    "zh": "我的账户",
    "es": "Mi cuenta",
    "ar": "حسابي",
    "th": "บัญชีของฉัน"
  },
  "Account dashboard": {
    "de": "Kontoübersicht",
    "ru": "Личный кабинет",
    "fr": "Tableau de bord",
    "zh": "账户概览",
    "es": "Panel de cuenta",
    "ar": "لوحة الحساب",
    "th": "ภาพรวมบัญชี"
  },
  "Account menu": {
    "de": "Kontomenü",
    "ru": "Меню аккаунта",
    "fr": "Menu du compte",
    "zh": "账户菜单",
    "es": "Menú de cuenta",
    "ar": "قائمة الحساب",
    "th": "เมนูบัญชี"
  },
  "Browse categories": {
    "de": "Kategorien",
    "ru": "Категории",
    "fr": "Catégories",
    "zh": "浏览分类",
    "es": "Ver categorías",
    "ar": "تصفح الفئات",
    "th": "หมวดหมู่สินค้า"
  },
  "See all": {
    "de": "Alle ansehen",
    "ru": "Все",
    "fr": "Tout voir",
    "zh": "查看全部",
    "es": "Ver todo",
    "ar": "عرض الكل",
    "th": "ดูทั้งหมด"
  },
  "Show less": {
    "de": "Weniger anzeigen",
    "ru": "Свернуть",
    "fr": "Voir moins",
    "zh": "收起",
    "es": "Ver menos",
    "ar": "عرض أقل",
    "th": "แสดงน้อยลง"
  },
  "More": {
    "de": "Mehr",
    "ru": "Ещё",
    "fr": "Plus",
    "zh": "更多",
    "es": "Más",
    "ar": "المزيد",
    "th": "เพิ่มเติม"
  },
  "New arrivals": {
    "de": "Neuheiten",
    "ru": "Новинки",
    "fr": "Nouveautés",
    "zh": "新品",
    "es": "Novedades",
    "ar": "وصل حديثًا",
    "th": "สินค้าใหม่"
  },
  "Top-ups": {
    "de": "Aufladungen",
    "ru": "Пополнения",
    "fr": "Recharges",
    "zh": "充值",
    "es": "Recargas",
    "ar": "شحن الرصيد",
    "th": "เติมเงิน"
  },
  "Search games & gift cards": {
    "de": "Spiele & Geschenkkarten suchen",
    "ru": "Поиск игр и подарочных карт",
    "fr": "Rechercher jeux et cartes cadeaux",
    "zh": "搜索游戏和礼品卡",
    "es": "Buscar juegos y tarjetas regalo",
    "ar": "ابحث عن الألعاب وبطاقات الهدايا",
    "th": "ค้นหาเกมและบัตรของขวัญ"
  },
  "Search games and gift cards": {
    "de": "Spiele und Geschenkkarten suchen",
    "ru": "Поиск игр и подарочных карт",
    "fr": "Rechercher jeux et cartes cadeaux",
    "zh": "搜索游戏和礼品卡",
    "es": "Buscar juegos y tarjetas regalo",
    "ar": "ابحث عن الألعاب وبطاقات الهدايا",
    "th": "ค้นหาเกมและบัตรของขวัญ"
  },
  "Clear search": {
    "de": "Suche löschen",
    "ru": "Очистить поиск",
    "fr": "Effacer la recherche",
    "zh": "清除搜索",
    "es": "Borrar búsqueda",
    "ar": "مسح البحث",
    "th": "ล้างการค้นหา"
  },
  "View all products": {
    "de": "Alle Produkte ansehen",
    "ru": "Все товары",
    "fr": "Voir tous les produits",
    "zh": "查看全部商品",
    "es": "Ver todos los productos",
    "ar": "عرض كل المنتجات",
    "th": "ดูสินค้าทั้งหมด"
  },
  "No products found. Try another search or category.": {
    "de": "Keine Produkte gefunden. Andere Suche oder Kategorie versuchen.",
    "ru": "Товары не найдены. Попробуйте другой запрос или категорию.",
    "fr": "Aucun produit trouvé. Essayez une autre recherche ou catégorie.",
    "zh": "未找到商品，请尝试其他搜索或分类。",
    "es": "No se encontraron productos. Prueba otra búsqueda o categoría.",
    "ar": "لم يتم العثور على منتجات. جرّب بحثًا أو فئة أخرى.",
    "th": "ไม่พบสินค้า ลองค้นหาใหม่หรือเลือกหมวดหมู่อื่น"
  },
  "Help & support": {
    "de": "Hilfe & Support",
    "ru": "Помощь и поддержка",
    "fr": "Aide et assistance",
    "zh": "帮助与支持",
    "es": "Ayuda y soporte",
    "ar": "المساعدة والدعم",
    "th": "ช่วยเหลือและสนับสนุน"
  },
  "Partnerships": {
    "de": "Partnerschaften",
    "ru": "Партнёрство",
    "fr": "Partenariats",
    "zh": "合作伙伴",
    "es": "Colaboraciones",
    "ar": "الشراكات",
    "th": "พันธมิตร"
  },
  "Terms": {
    "de": "Bedingungen",
    "ru": "Условия",
    "fr": "Conditions",
    "zh": "条款",
    "es": "Condiciones",
    "ar": "الشروط",
    "th": "ข้อกำหนด"
  },
  "Privacy": {
    "de": "Datenschutz",
    "ru": "Конфиденциальность",
    "fr": "Confidentialité",
    "zh": "隐私",
    "es": "Privacidad",
    "ar": "الخصوصية",
    "th": "ความเป็นส่วนตัว"
  },
  "B2B store": {
    "de": "B2B-Shop",
    "ru": "B2B-магазин",
    "fr": "Boutique B2B",
    "zh": "B2B 商店",
    "es": "Tienda B2B",
    "ar": "متجر الأعمال",
    "th": "ร้านค้า B2B"
  },
  "Choose denomination": {
    "de": "Nennwert wählen",
    "ru": "Выбрать номинал",
    "fr": "Choisir une valeur",
    "zh": "选择面额",
    "es": "Elegir denominación",
    "ar": "اختر الفئة",
    "th": "เลือกมูลค่า"
  },
  "View unavailable product": {
    "de": "Nicht verfügbares Produkt ansehen",
    "ru": "Посмотреть недоступный товар",
    "fr": "Voir le produit indisponible",
    "zh": "查看缺货商品",
    "es": "Ver producto no disponible",
    "ar": "عرض المنتج غير المتوفر",
    "th": "ดูสินค้าที่หมด"
  },
  "Mobile navigation": {
    "de": "Mobile Navigation",
    "ru": "Мобильная навигация",
    "fr": "Navigation mobile",
    "zh": "移动导航",
    "es": "Navegación móvil",
    "ar": "التنقل على الهاتف",
    "th": "เมนูนำทางมือถือ"
  },
  "Product collections": {
    "de": "Produktsammlungen",
    "ru": "Подборки товаров",
    "fr": "Collections de produits",
    "zh": "商品集合",
    "es": "Colecciones de productos",
    "ar": "مجموعات المنتجات",
    "th": "กลุ่มสินค้า"
  },
  "All": {
    "de": "Alle",
    "ru": "Все",
    "fr": "Tous",
    "zh": "全部",
    "es": "Todos",
    "ar": "الكل",
    "th": "ทั้งหมด"
  },
  "Completed": {
    "de": "Abgeschlossen",
    "ru": "Завершённые",
    "fr": "Terminées",
    "zh": "已完成",
    "es": "Completados",
    "ar": "مكتملة",
    "th": "เสร็จสิ้น"
  },
  "Processing": {
    "de": "In Bearbeitung",
    "ru": "В обработке",
    "fr": "En cours",
    "zh": "处理中",
    "es": "En proceso",
    "ar": "قيد المعالجة",
    "th": "กำลังดำเนินการ"
  },
  "Pending": {
    "de": "Ausstehend",
    "ru": "Ожидающие",
    "fr": "En attente",
    "zh": "待处理",
    "es": "Pendientes",
    "ar": "معلقة",
    "th": "รอดำเนินการ"
  },
  "Order status": {
    "de": "Bestellstatus",
    "ru": "Статус заказа",
    "fr": "Statut de commande",
    "zh": "订单状态",
    "es": "Estado del pedido",
    "ar": "حالة الطلب",
    "th": "สถานะคำสั่งซื้อ"
  },
  "Order pages": {
    "de": "Bestellseiten",
    "ru": "Страницы заказов",
    "fr": "Pages des commandes",
    "zh": "订单分页",
    "es": "Páginas de pedidos",
    "ar": "صفحات الطلبات",
    "th": "หน้าคำสั่งซื้อ"
  },
  "Previous order page": {
    "de": "Vorherige Bestellseite",
    "ru": "Предыдущая страница заказов",
    "fr": "Page de commandes précédente",
    "zh": "上一页订单",
    "es": "Página anterior de pedidos",
    "ar": "صفحة الطلبات السابقة",
    "th": "หน้าคำสั่งซื้อก่อนหน้า"
  },
  "Next order page": {
    "de": "Nächste Bestellseite",
    "ru": "Следующая страница заказов",
    "fr": "Page de commandes suivante",
    "zh": "下一页订单",
    "es": "Página siguiente de pedidos",
    "ar": "صفحة الطلبات التالية",
    "th": "หน้าคำสั่งซื้อถัดไป"
  },
  "No completed orders.": {
    "de": "Keine abgeschlossenen Bestellungen.",
    "ru": "Нет завершённых заказов.",
    "fr": "Aucune commande terminée.",
    "zh": "暂无已完成订单。",
    "es": "No hay pedidos completados.",
    "ar": "لا توجد طلبات مكتملة.",
    "th": "ไม่มีคำสั่งซื้อที่เสร็จสิ้น"
  },
  "No processing orders.": {
    "de": "Keine Bestellungen in Bearbeitung.",
    "ru": "Нет заказов в обработке.",
    "fr": "Aucune commande en cours.",
    "zh": "暂无处理中订单。",
    "es": "No hay pedidos en proceso.",
    "ar": "لا توجد طلبات قيد المعالجة.",
    "th": "ไม่มีคำสั่งซื้อที่กำลังดำเนินการ"
  },
  "No pending orders.": {
    "de": "Keine ausstehenden Bestellungen.",
    "ru": "Нет ожидающих заказов.",
    "fr": "Aucune commande en attente.",
    "zh": "暂无待处理订单。",
    "es": "No hay pedidos pendientes.",
    "ar": "لا توجد طلبات معلقة.",
    "th": "ไม่มีคำสั่งซื้อที่รอดำเนินการ"
  },
  "View inside each order": {
    "de": "In jeder Bestellung ansehen",
    "ru": "Смотрите внутри каждого заказа",
    "fr": "Voir dans chaque commande",
    "zh": "在各订单内查看",
    "es": "Ver dentro de cada pedido",
    "ar": "عرض داخل كل طلب",
    "th": "ดูภายในแต่ละคำสั่งซื้อ"
  },
  "Access your orders and wallet.": {
    "de": "Auf Bestellungen und Guthaben zugreifen.",
    "ru": "Доступ к заказам и кошельку.",
    "fr": "Accédez à vos commandes et à votre portefeuille.",
    "zh": "访问您的订单和钱包。",
    "es": "Accede a tus pedidos y monedero.",
    "ar": "الوصول إلى طلباتك ومحفظتك.",
    "th": "เข้าถึงคำสั่งซื้อและกระเป๋าเงิน"
  },
  "Sign in": {
    "de": "Anmelden",
    "ru": "Войти",
    "fr": "Se connecter",
    "zh": "登录",
    "es": "Iniciar sesión",
    "ar": "تسجيل الدخول",
    "th": "เข้าสู่ระบบ"
  },
  "Copy": {
    "de": "Kopieren",
    "ru": "Копировать",
    "fr": "Copier",
    "zh": "复制",
    "es": "Copiar",
    "ar": "نسخ",
    "th": "คัดลอก"
  },
  "Copied ✓": {
    "de": "Kopiert ✓",
    "ru": "Скопировано ✓",
    "fr": "Copié ✓",
    "zh": "已复制 ✓",
    "es": "Copiado ✓",
    "ar": "تم النسخ ✓",
    "th": "คัดลอกแล้ว ✓"
  },
  "Copy code": {
    "de": "Code kopieren",
    "ru": "Копировать код",
    "fr": "Copier le code",
    "zh": "复制代码",
    "es": "Copiar código",
    "ar": "نسخ الرمز",
    "th": "คัดลอกรหัส"
  },
  "Code copied": {
    "de": "Code kopiert",
    "ru": "Код скопирован",
    "fr": "Code copié",
    "zh": "代码已复制",
    "es": "Código copiado",
    "ar": "تم نسخ الرمز",
    "th": "คัดลอกรหัสแล้ว"
  },
  "Copy codes": {
    "de": "Codes kopieren",
    "ru": "Копировать коды",
    "fr": "Copier les codes",
    "zh": "复制代码",
    "es": "Copiar códigos",
    "ar": "نسخ الرموز",
    "th": "คัดลอกรหัสทั้งหมด"
  },
  "Copy all codes": {
    "de": "Alle Codes kopieren",
    "ru": "Копировать все коды",
    "fr": "Copier tous les codes",
    "zh": "复制全部代码",
    "es": "Copiar todos los códigos",
    "ar": "نسخ جميع الرموز",
    "th": "คัดลอกรหัสทั้งหมด"
  },
  "Copy all delivered codes": {
    "de": "Alle gelieferten Codes kopieren",
    "ru": "Копировать все выданные коды",
    "fr": "Copier tous les codes livrés",
    "zh": "复制全部已交付代码",
    "es": "Copiar todos los códigos entregados",
    "ar": "نسخ جميع الرموز المسلّمة",
    "th": "คัดลอกรหัสที่จัดส่งทั้งหมด"
  },
  "Could not copy. Select the code and copy manually.": {
    "de": "Kopieren fehlgeschlagen. Code markieren und manuell kopieren.",
    "ru": "Не удалось скопировать. Выделите код и скопируйте вручную.",
    "fr": "Copie impossible. Sélectionnez le code et copiez-le manuellement.",
    "zh": "无法复制。请选择代码并手动复制。",
    "es": "No se pudo copiar. Selecciona el código y cópialo manualmente.",
    "ar": "تعذّر النسخ. حدد الرمز وانسخه يدويًا.",
    "th": "คัดลอกไม่สำเร็จ โปรดเลือกรหัสแล้วคัดลอกด้วยตนเอง"
  },
  "Order total": {
    "de": "Bestellsumme",
    "ru": "Сумма заказа",
    "fr": "Total de la commande",
    "zh": "订单总额",
    "es": "Total del pedido",
    "ar": "إجمالي الطلب",
    "th": "ยอดรวมคำสั่งซื้อ"
  },
  "Payment status": {
    "de": "Zahlungsstatus",
    "ru": "Статус оплаты",
    "fr": "Statut du paiement",
    "zh": "支付状态",
    "es": "Estado del pago",
    "ar": "حالة الدفع",
    "th": "สถานะการชำระเงิน"
  },
  "Delivered": {
    "de": "Geliefert",
    "ru": "Доставлено",
    "fr": "Livré",
    "zh": "已交付",
    "es": "Entregado",
    "ar": "تم التسليم",
    "th": "จัดส่งแล้ว"
  },
  "Ordered units": {
    "de": "Bestellte Einheiten",
    "ru": "Заказано единиц",
    "fr": "Unités commandées",
    "zh": "订购数量",
    "es": "Unidades pedidas",
    "ar": "الوحدات المطلوبة",
    "th": "จำนวนที่สั่ง"
  },
  "Delivered codes": {
    "de": "Gelieferte Codes",
    "ru": "Выданные коды",
    "fr": "Codes livrés",
    "zh": "已交付代码",
    "es": "Códigos entregados",
    "ar": "الرموز المسلّمة",
    "th": "รหัสที่จัดส่ง"
  },
  "Remaining delivery": {
    "de": "Noch ausstehend",
    "ru": "Осталось выдать",
    "fr": "Reste à livrer",
    "zh": "待交付数量",
    "es": "Pendiente de entrega",
    "ar": "المتبقي للتسليم",
    "th": "รอจัดส่ง"
  },
  "Order receipt": {
    "de": "Bestellbeleg",
    "ru": "Квитанция заказа",
    "fr": "Reçu de commande",
    "zh": "订单收据",
    "es": "Recibo del pedido",
    "ar": "إيصال الطلب",
    "th": "ใบเสร็จคำสั่งซื้อ"
  },
  "Order items": {
    "de": "Bestellartikel",
    "ru": "Состав заказа",
    "fr": "Articles commandés",
    "zh": "订单商品",
    "es": "Artículos del pedido",
    "ar": "عناصر الطلب",
    "th": "รายการสินค้า"
  },
  "Delivered content": {
    "de": "Gelieferte Inhalte",
    "ru": "Выданные товары",
    "fr": "Contenu livré",
    "zh": "交付内容",
    "es": "Contenido entregado",
    "ar": "المحتوى المسلّم",
    "th": "เนื้อหาที่จัดส่ง"
  },
  "Not delivered yet": {
    "de": "Noch nicht geliefert",
    "ru": "Ещё не доставлено",
    "fr": "Pas encore livré",
    "zh": "尚未交付",
    "es": "Aún no entregado",
    "ar": "لم يتم التسليم بعد",
    "th": "ยังไม่ได้จัดส่ง"
  },
  "Payment method information": {
    "de": "Informationen zur Zahlungsmethode",
    "ru": "Информация о способе оплаты",
    "fr": "Informations sur le paiement",
    "zh": "支付方式信息",
    "es": "Información del método de pago",
    "ar": "معلومات طريقة الدفع",
    "th": "ข้อมูลวิธีชำระเงิน"
  },
  "ⓘ Payment information": {
    "de": "ⓘ Zahlungsinformationen",
    "ru": "ⓘ Информация об оплате",
    "fr": "ⓘ Informations de paiement",
    "zh": "ⓘ 支付信息",
    "es": "ⓘ Información de pago",
    "ar": "ⓘ معلومات الدفع",
    "th": "ⓘ ข้อมูลการชำระเงิน"
  },
  "Your USD wallet is credited after verified payment. Fees are shown below.": {
    "de": "Ihr USD-Guthaben wird nach bestätigter Zahlung aufgeladen. Gebühren stehen unten.",
    "ru": "USD-кошелёк пополняется после подтверждения оплаты. Комиссии указаны ниже.",
    "fr": "Votre portefeuille USD est crédité après vérification du paiement. Les frais figurent ci-dessous.",
    "zh": "付款验证后将充值到您的美元钱包。费用如下。",
    "es": "Tu monedero USD se abona tras verificar el pago. Las comisiones se muestran abajo.",
    "ar": "تُضاف الأموال إلى محفظتك بالدولار بعد التحقق من الدفع. الرسوم موضحة أدناه.",
    "th": "เงินจะเข้ากระเป๋า USD หลังตรวจสอบการชำระเงิน ค่าธรรมเนียมแสดงด้านล่าง"
  },
  "Transaction pages": {
    "de": "Transaktionsseiten",
    "ru": "Страницы операций",
    "fr": "Pages des transactions",
    "zh": "交易分页",
    "es": "Páginas de transacciones",
    "ar": "صفحات المعاملات",
    "th": "หน้าธุรกรรม"
  },
  "Previous transaction page": {
    "de": "Vorherige Transaktionsseite",
    "ru": "Предыдущая страница операций",
    "fr": "Page de transactions précédente",
    "zh": "上一页交易",
    "es": "Página anterior de transacciones",
    "ar": "صفحة المعاملات السابقة",
    "th": "หน้าธุรกรรมก่อนหน้า"
  },
  "Next transaction page": {
    "de": "Nächste Transaktionsseite",
    "ru": "Следующая страница операций",
    "fr": "Page de transactions suivante",
    "zh": "下一页交易",
    "es": "Página siguiente de transacciones",
    "ar": "صفحة المعاملات التالية",
    "th": "หน้าธุรกรรมถัดไป"
  },
  "Wallet transactions": {
    "de": "Wallet-Transaktionen",
    "ru": "Операции кошелька",
    "fr": "Transactions du portefeuille",
    "zh": "钱包交易",
    "es": "Transacciones del monedero",
    "ar": "معاملات المحفظة",
    "th": "ธุรกรรมกระเป๋าเงิน"
  },
  "Top-up requests": {
    "de": "Aufladeanfragen",
    "ru": "Запросы пополнения",
    "fr": "Demandes de recharge",
    "zh": "充值请求",
    "es": "Solicitudes de recarga",
    "ar": "طلبات الشحن",
    "th": "คำขอเติมเงิน"
  },
  "Approved refunds": {
    "de": "Genehmigte Erstattungen",
    "ru": "Одобренные возвраты",
    "fr": "Remboursements approuvés",
    "zh": "已批准退款",
    "es": "Reembolsos aprobados",
    "ar": "المبالغ المستردة المعتمدة",
    "th": "การคืนเงินที่อนุมัติ"
  },
  "Wallet balance": {
    "de": "Wallet-Guthaben",
    "ru": "Баланс кошелька",
    "fr": "Solde du portefeuille",
    "zh": "钱包余额",
    "es": "Saldo del monedero",
    "ar": "رصيد المحفظة",
    "th": "ยอดเงินในกระเป๋า"
  },
  "Add money": {
    "de": "Geld hinzufügen",
    "ru": "Пополнить",
    "fr": "Ajouter de l’argent",
    "zh": "充值",
    "es": "Añadir dinero",
    "ar": "إضافة أموال",
    "th": "เติมเงิน"
  },
  "Top-up amount (USD)": {
    "de": "Aufladebetrag (USD)",
    "ru": "Сумма пополнения (USD)",
    "fr": "Montant à recharger (USD)",
    "zh": "充值金额（美元）",
    "es": "Importe de recarga (USD)",
    "ar": "مبلغ الشحن (USD)",
    "th": "จำนวนเงินเติม (USD)"
  },
  "USDT network": {
    "de": "USDT-Netzwerk",
    "ru": "Сеть USDT",
    "fr": "Réseau USDT",
    "zh": "USDT 网络",
    "es": "Red USDT",
    "ar": "شبكة USDT",
    "th": "เครือข่าย USDT"
  },
  "Add amount": {
    "de": "Aufladebetrag",
    "ru": "Сумма пополнения",
    "fr": "Montant ajouté",
    "zh": "充值金额",
    "es": "Importe añadido",
    "ar": "المبلغ المضاف",
    "th": "จำนวนเงินที่เติม"
  },
  "Payment gateway fee": {
    "de": "Zahlungsgebühr",
    "ru": "Комиссия платёжной системы",
    "fr": "Frais de paiement",
    "zh": "支付手续费",
    "es": "Comisión de pago",
    "ar": "رسوم بوابة الدفع",
    "th": "ค่าธรรมเนียมชำระเงิน"
  },
  "Amount to pay": {
    "de": "Zu zahlender Betrag",
    "ru": "К оплате",
    "fr": "Montant à payer",
    "zh": "应付金额",
    "es": "Importe a pagar",
    "ar": "المبلغ المستحق",
    "th": "ยอดที่ต้องชำระ"
  },
  "New balance": {
    "de": "Neuer Kontostand",
    "ru": "Новый баланс",
    "fr": "Nouveau solde",
    "zh": "新余额",
    "es": "Nuevo saldo",
    "ar": "الرصيد الجديد",
    "th": "ยอดเงินใหม่"
  },
  "Continue to payment": {
    "de": "Weiter zur Zahlung",
    "ru": "Перейти к оплате",
    "fr": "Passer au paiement",
    "zh": "继续付款",
    "es": "Continuar al pago",
    "ar": "متابعة الدفع",
    "th": "ดำเนินการชำระเงิน"
  },
  "Opening payment gateway...": {
    "de": "Zahlungsseite wird geöffnet...",
    "ru": "Открываем платёжную систему...",
    "fr": "Ouverture du paiement...",
    "zh": "正在打开支付页面…",
    "es": "Abriendo pasarela de pago...",
    "ar": "جارٍ فتح بوابة الدفع...",
    "th": "กำลังเปิดหน้าชำระเงิน..."
  },
  "Earn up to": {
    "de": "Verdienen Sie bis zu",
    "ru": "Заработайте до",
    "fr": "Gagnez jusqu’à",
    "zh": "最高可赚取",
    "es": "Gana hasta",
    "ar": "اربح حتى",
    "th": "รับรายได้สูงสุด"
  },
  "Affiliate": {
    "de": "Partner",
    "ru": "Партнёрам",
    "fr": "Affiliation",
    "zh": "推广联盟",
    "es": "Afiliación",
    "ar": "التسويق بالعمولة",
    "th": "พันธมิตร"
  },
  "Browse gaming top-ups.": {
    "de": "Gaming-Aufladungen entdecken.",
    "ru": "Игровые пополнения.",
    "fr": "Parcourir les recharges de jeux.",
    "zh": "浏览游戏充值。",
    "es": "Explora recargas de juegos.",
    "ar": "تصفح شحن الألعاب.",
    "th": "ดูบริการเติมเงินเกม"
  },
  "Browse digital gift cards.": {
    "de": "Digitale Geschenkkarten entdecken.",
    "ru": "Цифровые подарочные карты.",
    "fr": "Parcourir les cartes cadeaux numériques.",
    "zh": "浏览数字礼品卡。",
    "es": "Explora tarjetas regalo digitales.",
    "ar": "تصفح بطاقات الهدايا الرقمية.",
    "th": "ดูบัตรของขวัญดิจิทัล"
  },
  "Browse gaming and digital subscriptions.": {
    "de": "Gaming- und Digitalabonnements entdecken.",
    "ru": "Игровые и цифровые подписки.",
    "fr": "Parcourir les abonnements numériques et de jeux.",
    "zh": "浏览游戏及数字订阅。",
    "es": "Explora suscripciones de juegos y digitales.",
    "ar": "تصفح اشتراكات الألعاب والخدمات الرقمية.",
    "th": "ดูการสมัครสมาชิกเกมและบริการดิจิทัล"
  },
  "Browse digital game keys.": {
    "de": "Digitale Spielschlüssel entdecken.",
    "ru": "Цифровые игровые ключи.",
    "fr": "Parcourir les clés de jeux numériques.",
    "zh": "浏览数字游戏密钥。",
    "es": "Explora claves de juegos digitales.",
    "ar": "تصفح مفاتيح الألعاب الرقمية.",
    "th": "ดูคีย์เกมดิจิทัล"
  },
  "of": {
    "de": "von",
    "ru": "из",
    "fr": "sur",
    "zh": "共",
    "es": "de",
    "ar": "من",
    "th": "จาก"
  },
  "orders": {
    "de": "Bestellungen",
    "ru": "заказов",
    "fr": "commandes",
    "zh": "订单",
    "es": "pedidos",
    "ar": "طلبات",
    "th": "คำสั่งซื้อ"
  },
  "Currency": {
    "de": "Währung",
    "ru": "Валюта",
    "fr": "Devise",
    "zh": "货币",
    "es": "Moneda",
    "ar": "العملة",
    "th": "สกุลเงิน"
  },
  "Language": {
    "de": "Sprache",
    "ru": "Язык",
    "fr": "Langue",
    "zh": "语言",
    "es": "Idioma",
    "ar": "اللغة",
    "th": "ภาษา"
  },
  "My wallet": {
    "de": "Mein Guthaben",
    "ru": "Мой кошелёк",
    "fr": "Mon portefeuille",
    "zh": "我的钱包",
    "es": "Mi monedero",
    "ar": "محفظتي",
    "th": "กระเป๋าเงินของฉัน"
  },
  "Notifications": {
    "de": "Benachrichtigungen",
    "ru": "Уведомления",
    "fr": "Notifications",
    "zh": "通知",
    "es": "Notificaciones",
    "ar": "الإشعارات",
    "th": "การแจ้งเตือน"
  },
  "From": {
    "de": "Ab",
    "ru": "От",
    "fr": "À partir de",
    "zh": "起价",
    "es": "Desde",
    "ar": "من",
    "th": "เริ่มต้น"
  },
  "No wallet transactions yet.": {
    "de": "Noch keine Transaktionen.",
    "ru": "Операций кошелька пока нет.",
    "fr": "Aucune transaction pour le moment.",
    "zh": "暂无钱包交易。",
    "es": "Aún no hay transacciones.",
    "ar": "لا توجد معاملات بعد.",
    "th": "ยังไม่มีธุรกรรม"
  },
  "No wallet top-up requests yet.": {
    "de": "Noch keine Aufladeanfragen.",
    "ru": "Запросов пополнения пока нет.",
    "fr": "Aucune demande de recharge.",
    "zh": "暂无充值请求。",
    "es": "Aún no hay solicitudes de recarga.",
    "ar": "لا توجد طلبات شحن بعد.",
    "th": "ยังไม่มีคำขอเติมเงิน"
  },
  "Enter an amount between USD 10 and USD 50,000.": {
    "de": "Betrag zwischen 10 und 50.000 USD eingeben.",
    "ru": "Введите сумму от 10 до 50 000 USD.",
    "fr": "Saisissez un montant de 10 à 50 000 USD.",
    "zh": "请输入 10 至 50,000 美元的金额。",
    "es": "Introduce un importe entre 10 y 50.000 USD.",
    "ar": "أدخل مبلغًا بين 10 و50,000 دولار.",
    "th": "กรอกจำนวนเงินระหว่าง 10 ถึง 50,000 USD"
  },
  "Transaction page {n}": {
    "de": "Transaktionsseite {n}",
    "ru": "Страница операций {n}",
    "fr": "Page de transactions {n}",
    "zh": "交易第 {n} 页",
    "es": "Página de transacciones {n}",
    "ar": "صفحة المعاملات {n}",
    "th": "หน้าธุรกรรม {n}"
  },
  "Order page {n}": {
    "de": "Bestellseite {n}",
    "ru": "Страница заказов {n}",
    "fr": "Page de commandes {n}",
    "zh": "订单第 {n} 页",
    "es": "Página de pedidos {n}",
    "ar": "صفحة الطلبات {n}",
    "th": "หน้าคำสั่งซื้อ {n}"
  },
  "{n} items in cart": {
    "de": "{n} Artikel im Warenkorb",
    "ru": "Товаров в корзине: {n}",
    "fr": "{n} articles au panier",
    "zh": "购物车内 {n} 件商品",
    "es": "{n} artículos en el carrito",
    "ar": "{n} عناصر في السلة",
    "th": "สินค้า {n} รายการในรถเข็น"
  },
  "Copy codes for {name}": {
    "de": "Codes kopieren: {name}",
    "ru": "Копировать коды: {name}",
    "fr": "Copier les codes : {name}",
    "zh": "复制代码：{name}",
    "es": "Copiar códigos de {name}",
    "ar": "نسخ رموز {name}",
    "th": "คัดลอกรหัสสำหรับ {name}"
  },
  "results for": {
    "de": "Ergebnisse für",
    "ru": "результатов по запросу",
    "fr": "résultats pour",
    "zh": "条结果，搜索",
    "es": "resultados para",
    "ar": "نتائج البحث عن",
    "th": "ผลลัพธ์สำหรับ"
  }
};

export function translateCustomerText(text: string, language: StoreLanguage): string | undefined {
  if (language === "en") return undefined;
  if (messages[text]) return messages[text][language];
  for (const [pattern, key, token] of [
    [/^Transaction page (\d+)$/, "Transaction page {n}", "{n}"],
    [/^Order page (\d+)$/, "Order page {n}", "{n}"],
    [/^(\d+) items in cart$/, "{n} items in cart", "{n}"],
    [/^Copy codes for (.+)$/, "Copy codes for {name}", "{name}"],
  ] as const) {
    const match = text.match(pattern);
    if (match) return messages[key][language].replace(token, match[1]);
  }
  return undefined;
}
