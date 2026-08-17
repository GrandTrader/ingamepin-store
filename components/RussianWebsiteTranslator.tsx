"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  useStorePreferences,
  type StoreLanguage,
} from "./StorePreferences";

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
  "B2B Bulk": "B2B Оптом",
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
  "My Orders": "Мои заказы",
  "My Codes": "Мои коды",
  "Affiliate": "Партнёрская программа",
  "Affiliate Program": "Партнёрская программа",
  "View and track every purchase.": "Просматривайте и отслеживайте все покупки.",
  "Order, payment, and account updates.": "Обновления заказов, платежей и аккаунта.",
  "Delivered content": "Доставленные товары",
  "Customer details": "Данные покупателя",
  "Payment details": "Данные платежа",
  "Download All Codes (.txt)": "Скачать все коды (.txt)",
  "Download Product Codes": "Скачать коды товара",
  "Secure digital delivery": "Безопасная цифровая доставка",
  "Keep these codes private. Each code can normally be redeemed only once.":
    "Храните эти коды в тайне. Обычно каждый код можно активировать только один раз.",
  "Verified purchase": "Подтверждённая покупка",
  "How was your purchase?": "Как прошла ваша покупка?",
  "Positive": "Положительный",
  "Negative": "Отрицательный",
  "Optional comment about your purchase": "Необязательный комментарий о покупке",
  "Submitting...": "Отправка...",
  "Submit review": "Отправить отзыв",
  "Verified reviews": "Подтверждённые отзывы",
  "Positive / Negative": "Положительные / Отрицательные",
  "No verified reviews yet": "Подтверждённых отзывов пока нет",
  "Customers can review this product after a completed delivery.":
    "Покупатели могут оставить отзыв после завершения доставки.",
  "Description": "Описание",
  "Reviews": "Отзывы",
  "Delivery instructions": "Инструкции по доставке",
  "Generate invoice": "Создать счёт",
  "Invoice": "Счёт",
  "Invoice ready": "Счёт готов",
  "Full legal name": "Полное юридическое имя",
  "Country": "Страна",
  "Complete billing address": "Полный платёжный адрес",
  "House/building, street, city, state, postal code":
    "Дом/строение, улица, город, регион, почтовый индекс",
  "Tax ID / TIN": "Налоговый номер / ИНН",
  "Product / denomination": "Товар / номинал",
  "Qty": "Кол-во",
  "Rate": "Цена",
  "Total": "Итого",
  "This is a computer-generated invoice.": "Это автоматически сформированный счёт.",
  "Protect your account with a Passkey": "Защитите аккаунт с помощью ключа доступа",
  "Sign in securely using your phone, fingerprint, face or device PIN.":
    "Безопасно входите с помощью телефона, отпечатка пальца, распознавания лица или PIN-кода устройства.",
  "Account protection": "Защита аккаунта",
  "Security": "Безопасность",
  "Use a Passkey to sign in without Google Authenticator codes.":
    "Используйте ключ доступа для входа без кодов Google Authenticator.",
  "Passkeys": "Ключи доступа",
  "Loading passkeys...": "Загрузка ключей доступа...",
  "No passkey is connected yet.": "Ключ доступа ещё не подключён.",
  "Enable Passkey": "Включить ключ доступа",
  "Add Passkey": "Добавить ключ доступа",
  "Sign in with Passkey": "Войти с ключом доступа",
  "Checking passkey...": "Проверка ключа доступа...",
  "Customer App Installed": "Приложение покупателя установлено",
  "Install Customer App": "Установить приложение покупателя",
  "InGamePin Marketing Partners": "Маркетинговые партнёры InGamePin",
  "Promote digital products. Earn commission in USDT.":
    "Продвигайте цифровые товары. Получайте комиссию в USDT.",
  "Join Affiliate Program": "Вступить в партнёрскую программу",
  "Learn & Join": "Узнать и присоединиться",
  "Ready to become a partner?": "Готовы стать партнёром?",
  "Apply": "Подать заявку",
  "Create links": "Создавайте ссылки",
  "Promote": "Продвигайте",
  "Earn USDT": "Получайте USDT",
  "Affiliate code": "Партнёрский код",
  "Promotion channel": "Канал продвижения",
  "Commission": "Комиссия",
  "Affiliate application": "Заявка в партнёрскую программу",
  "Update application": "Обновить заявку",
  "Affiliate applications are currently closed.": "Приём заявок в партнёрскую программу временно закрыт.",
  "Your application is waiting for administrator review.":
    "Ваша заявка ожидает проверки администратором.",
  "Fast Delivery": "Быстрая доставка",
  "Genuine Products": "Оригинальные товары",
  "Secure Checkout": "Безопасное оформление",
  "Customer Support": "Поддержка покупателей",
  "Enter other amount": "Введите другую сумму",
  "Enter recipient email address": "Введите email получателя",
  "Decrease quantity": "Уменьшить количество",
  "Increase quantity": "Увеличить количество",
  "House number, building and street": "Номер дома, строение и улица",
  "Area, colony or locality": "Район или населённый пункт",
  "Nearby landmark": "Ближайший ориентир",
  "Enter city": "Введите город",
  "Payment gateway fee": "Комиссия платёжной системы",
  "Close live chat": "Закрыть онлайн-чат",
  "Your name": "Ваше имя",
  "Your email": "Ваш email",
  "Open live support chat": "Открыть чат поддержки",
  "Main navigation": "Основная навигация",
  "Mobile navigation": "Мобильная навигация",
  "Currency": "Валюта",
  "Mobile number": "Номер телефона",
  "Country calling code": "Телефонный код страны",
  "Loading payment...": "Загрузка платежа...",
  "Digital product": "Цифровой товар",
  "PENDING PAYMENT": "ОЖИДАЕТ ОПЛАТЫ",
  "PAYMENT REVIEW": "ПРОВЕРКА ПЛАТЕЖА",
  PENDING: "ОЖИДАЕТ",
  PENDING_PAYMENT: "ОЖИДАЕТ ОПЛАТЫ",
  PAYMENT_REVIEW: "ПРОВЕРКА ПЛАТЕЖА",
  SUBMITTED: "ОТПРАВЛЕН",
  PAID: "ОПЛАЧЕН",
  VERIFIED: "ПОДТВЕРЖДЁН",
  PROCESSING: "ОБРАБАТЫВАЕТСЯ",
  DELIVERED: "ДОСТАВЛЕН",
  COMPLETED: "ЗАВЕРШЁН",
  FAILED: "ОШИБКА",
  CANCELLED: "ОТМЕНЁН",
  REJECTED: "ОТКЛОНЁН",
  REFUNDED: "ВОЗВРАЩЁН",
  EXPIRED: "ИСТЁК",
};

const thaiText: Record<string, string> = {
  "Return to dashboard": "กลับไปที่แดชบอร์ด",
  "← Return to dashboard": "← กลับไปที่แดชบอร์ด",
  "Available balance": "ยอดเงินที่ใช้ได้",
  "USD wallet": "กระเป๋าเงิน USD",
  "Add money": "เติมเงิน",
  "Choose an amount and pay using any available gateway.":
    "เลือกจำนวนเงินและชำระผ่านช่องทางที่พร้อมใช้งาน",
  "Add money through any available payment gateway.":
    "เติมเงินผ่านช่องทางการชำระเงินที่พร้อมใช้งาน",
  "Your balance is credited automatically after verified payment.":
    "ยอดเงินจะเข้ากระเป๋าโดยอัตโนมัติหลังยืนยันการชำระเงิน",
  "Top-up amount (USD)": "จำนวนเงินเติม (USD)",
  "Payment method": "วิธีชำระเงิน",
  "Instant verification": "ยืนยันทันที",
  "Cards and local methods": "บัตรและช่องทางท้องถิ่น",
  "Available payment methods": "วิธีชำระเงินที่พร้อมใช้งาน",
  "Add amount": "จำนวนเงินเติม",
  "New balance": "ยอดเงินใหม่",
  "Continue to payment": "ดำเนินการชำระเงิน",
  "Bulk delivery information": "ข้อมูลการจัดส่งแบบขายส่ง",
  "Bulk Delivery Time: 1-15 Working Days": "ระยะเวลาจัดส่งแบบขายส่ง: 1–15 วันทำการ",
  "Please confirm that you understand the delivery time.":
    "โปรดยืนยันว่าคุณเข้าใจระยะเวลาจัดส่ง",
  "I understand": "ฉันเข้าใจ",
  Cancel: "ยกเลิก",
  "Opening payment gateway...": "กำลังเปิดช่องทางชำระเงิน...",
  "Recent top-ups": "รายการเติมเงินล่าสุด",
  "No top-ups yet.": "ยังไม่มีรายการเติมเงิน",
  "Welcome back": "ยินดีต้อนรับกลับ",
  "Sign in to manage your orders, wallet and profile.":
    "เข้าสู่ระบบเพื่อจัดการคำสั่งซื้อ กระเป๋าเงิน และโปรไฟล์",
  "Customer account": "บัญชีลูกค้า",
  "Email address": "อีเมล",
  Password: "รหัสผ่าน",
  "Sign in": "เข้าสู่ระบบ",
  "Forgot password?": "ลืมรหัสผ่าน?",
  "New customer?": "ลูกค้าใหม่?",
  "Create account": "สร้างบัญชี",
  "Create your account": "สร้างบัญชีของคุณ",
  "Already have an account?": "มีบัญชีอยู่แล้ว?",
  "Enter your OTP": "กรอกรหัส OTP",
  "Verify & Activate Account": "ยืนยันและเปิดใช้งานบัญชี",
  "Resend verification code": "ส่งรหัสยืนยันอีกครั้ง",
  "Use a different email address": "ใช้อีเมลอื่น",
  "My orders": "คำสั่งซื้อของฉัน",
  "My codes": "โค้ดของฉัน",
  "My wallet": "กระเป๋าเงินของฉัน",
  Profile: "โปรไฟล์",
  "Sign out": "ออกจากระบบ",
  "Wallet balance": "ยอดเงินในกระเป๋า",
  "Delivered codes": "โค้ดที่จัดส่งแล้ว",
  Notifications: "การแจ้งเตือน",
  "Account details": "รายละเอียดบัญชี",
  "Full name": "ชื่อ-นามสกุล",
  Phone: "โทรศัพท์",
  "Save profile": "บันทึกโปรไฟล์",
  "Shopping Cart": "ตะกร้าสินค้า",
  "Your cart is empty.": "ตะกร้าของคุณว่างเปล่า",
  "Continue shopping": "เลือกซื้อสินค้าต่อ",
  Product: "สินค้า",
  Price: "ราคา",
  Quantity: "จำนวน",
  Subtotal: "ยอดรวมย่อย",
  Discount: "ส่วนลด",
  Delivery: "การจัดส่ง",
  Taxes: "ภาษี",
  "Total Amount": "ยอดรวมทั้งหมด",
  Remove: "ลบ",
  Checkout: "ชำระเงิน",
  "Contact Information": "ข้อมูลติดต่อ",
  "Used for order updates and delivery communication.":
    "ใช้สำหรับแจ้งสถานะคำสั่งซื้อและการจัดส่ง",
  "Order Summary": "สรุปคำสั่งซื้อ",
  "Payment gateway fee": "ค่าธรรมเนียมช่องทางชำระเงิน",
  "Continue to Payment": "ดำเนินการชำระเงิน",
  "Secure checkout": "ชำระเงินอย่างปลอดภัย",
  "Choose your product option": "เลือกตัวเลือกสินค้า",
  "Select product option": "เลือกตัวเลือกสินค้า",
  "Selected option": "ตัวเลือกที่เลือก",
  "Delivery email": "อีเมลสำหรับจัดส่ง",
  "Add to Cart": "เพิ่มลงตะกร้า",
  "Buy Now": "ซื้อเลย",
  "In Stock": "มีสินค้า",
  "Out of Stock": "สินค้าหมด",
  "Digital Instant Delivery": "จัดส่งดิจิทัลทันที",
  "Genuine Products": "สินค้าของแท้",
  "Secure Payment": "ชำระเงินปลอดภัย",
  "Customer Support": "ฝ่ายบริการลูกค้า",
  Home: "หน้าหลัก",
  "All Products": "สินค้าทั้งหมด",
  "Track Order": "ติดตามคำสั่งซื้อ",
  Cart: "ตะกร้า",
  "My Account": "บัญชีของฉัน",
  Login: "เข้าสู่ระบบ",
  Search: "ค้นหา",
  "Gaming Top-Ups": "เติมเงินเกม",
  "Gift Cards": "บัตรของขวัญ",
  Subscriptions: "การสมัครสมาชิก",
  "Game Keys": "คีย์เกม",
  "Product Categories": "หมวดหมู่สินค้า",
  "Customer Help": "ช่วยเหลือลูกค้า",
  "Terms & Conditions": "ข้อกำหนดและเงื่อนไข",
  "Return & Refund Policy": "นโยบายคืนสินค้าและคืนเงิน",
  "Privacy Policy": "นโยบายความเป็นส่วนตัว",
  "Affiliate Program": "โปรแกรมพันธมิตร",
  "View All Products": "ดูสินค้าทั้งหมด",
  "Track Your Order": "ติดตามคำสั่งซื้อของคุณ",
  "Contact Support": "ติดต่อฝ่ายช่วยเหลือ",
  "Order number": "หมายเลขคำสั่งซื้อ",
  "Order Number": "หมายเลขคำสั่งซื้อ",
  "Order status": "สถานะคำสั่งซื้อ",
  "Payment status": "สถานะการชำระเงิน",
  "Customer email": "อีเมลลูกค้า",
  "Check Delivery Status": "ตรวจสอบสถานะการจัดส่ง",
  "Download All Codes (.txt)": "ดาวน์โหลดโค้ดทั้งหมด (.txt)",
  "Download Product Codes": "ดาวน์โหลดโค้ดสินค้า",
  "Secure digital delivery": "การจัดส่งดิจิทัลที่ปลอดภัย",
  "Your Digital Product Is Ready": "สินค้าดิจิทัลของคุณพร้อมแล้ว",
  "Thank You for Your Order": "ขอบคุณสำหรับคำสั่งซื้อ",
  "Payment is verified. Your private codes are displayed below.":
    "ยืนยันการชำระเงินแล้ว โค้ดส่วนตัวของคุณแสดงอยู่ด้านล่าง",
  "Payment Pending": "รอการชำระเงิน",
  "Payment Review": "กำลังตรวจสอบการชำระเงิน",
  "Your order": "คำสั่งซื้อของคุณ",
  "Order details": "รายละเอียดคำสั่งซื้อ",
  "No orders found.": "ไม่พบคำสั่งซื้อ",
  "No delivered digital codes yet.": "ยังไม่มีโค้ดดิจิทัลที่จัดส่งแล้ว",
  "Copy": "คัดลอก",
  "Copied": "คัดลอกแล้ว",
  "Live Chat": "แชตสด",
  "Open live support chat": "เปิดแชตฝ่ายช่วยเหลือ",
  "Mobile number": "หมายเลขโทรศัพท์",
  "Country calling code": "รหัสโทรศัพท์ประเทศ",
  "Loading payment...": "กำลังโหลดการชำระเงิน...",
  "Digital product": "สินค้าดิจิทัล",
  "PENDING PAYMENT": "รอการชำระเงิน",
  "PAYMENT REVIEW": "กำลังตรวจสอบการชำระเงิน",
  PENDING: "รอดำเนินการ",
  PENDING_PAYMENT: "รอการชำระเงิน",
  PAYMENT_REVIEW: "กำลังตรวจสอบการชำระเงิน",
  SUBMITTED: "ส่งแล้ว",
  PAID: "ชำระแล้ว",
  VERIFIED: "ยืนยันแล้ว",
  PROCESSING: "กำลังดำเนินการ",
  DELIVERED: "จัดส่งแล้ว",
  COMPLETED: "เสร็จสมบูรณ์",
  FAILED: "ล้มเหลว",
  CANCELLED: "ยกเลิกแล้ว",
  REJECTED: "ถูกปฏิเสธ",
  REFUNDED: "คืนเงินแล้ว",
  EXPIRED: "หมดอายุ",
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
  [/^Allowed quantity:\s*(.+)$/, (quantity) => `Допустимое количество: ${quantity}`],
  [/^Showing\s+(.+)\s+products?$/, (count) => `Показано товаров: ${count}`],
  [/^(.+)\s+Sold$/, (count) => `Продано: ${count}`],
];

const thaiPatterns: Array<[RegExp, (...matches: string[]) => string]> = [
  [/^Hello,\s+(.+)$/, (name) => `สวัสดี ${name}`],
  [/^Minimum amount:\s*\$(.+)$/, (amount) => `จำนวนขั้นต่ำ: $${amount}`],
  [/^Order\s+(.+)$/, (number) => `คำสั่งซื้อ ${number}`],
  [/^(.+)\s+items?$/, (count) => `${count} รายการ`],
  [/^Orders using\s+(.+)$/, (email) => `คำสั่งซื้อของ ${email}`],
  [/^We sent an?\s+(?:six|eight)-digit verification code to\s+(.+)\.$/, (email) => `เราได้ส่งรหัสยืนยันไปยัง ${email}`],
  [/^Invoice expires in\s+(.+)$/, (time) => `ใบแจ้งชำระหมดอายุใน ${time}`],
  [/^(.+)\s+available$/, (count) => `พร้อมจำหน่าย ${count}`],
  [/^Allowed quantity:\s*(.+)$/, (quantity) => `จำนวนที่อนุญาต: ${quantity}`],
  [/^Showing\s+(.+)\s+products?$/, (count) => `แสดงสินค้า ${count} รายการ`],
  [/^(.+)\s+Sold$/, (count) => `ขายแล้ว ${count}`],
];

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["placeholder", "title", "aria-label"];

function translateValue(value: string, language: StoreLanguage) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const normalized = trimmed.replace(/\s+/g, " ");

  const textMap = language === "th" ? thaiText : russianText;
  const patterns = language === "th" ? thaiPatterns : russianPatterns;
  let translated = textMap[normalized];
  if (!translated) {
    for (const [pattern, formatter] of patterns) {
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

function updatePage(root: HTMLElement, language: StoreLanguage) {
  const shouldTranslate = language !== "en";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    if (!isExcluded(textNode)) {
      if (shouldTranslate) {
        const source = originalText.get(textNode) ?? textNode.data;
        const translated = translateValue(source, language);
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

      if (shouldTranslate) {
        const saved = originalAttributes.get(element);
        const source = saved?.get(attribute) ?? element.getAttribute(attribute) ?? "";
        const translated = translateValue(source, language);
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
      updatePage(root, language);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: translatedAttributes,
      });
    });

    updatePage(root, language);
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
