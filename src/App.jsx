import { useState, useEffect } from "react";
import { db, auth } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDoc,
  query,
  orderBy,
  setDoc,
  serverTimestamp,
  increment,
  writeBatch,
  runTransaction,
} from "firebase/firestore";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import { createPortal } from "react-dom";

import "./App.css";

const CLOUDINARY_CLOUD_NAME = "l4e38mhl";
const CLOUDINARY_UPLOAD_PRESET = "alnabea_products";

async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "al-nabea-products");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "تعذر رفع الصورة.");
  }

  return data.secure_url;
}

const ADMIN_UID = "iq8D0CIMh4eknIs2uAAtazalT8D3";

const categories = [
  "الكل",
  "عطور رجالية",
  "عطور نسائية",
  "عطور عربية",
  "عطور فرنسية",
  "العود",
  "البخور",
];

const adminInputStyle = {
  display: "block",
  width: "100%",
  marginTop: "8px",
  padding: "13px",
  background: "#10100e",
  color: "#f7f2e8",
  border: "1px solid #494131",
  borderRadius: "3px",
  outline: "none",
  boxSizing: "border-box",
};

const ORDER_STATUSES = [
  "جديد",
  "قيد التجهيز",
  "تم الشحن",
  "مكتمل",
  "ملغي",
];

// الحالات التي يُخصم عندها المخزون
const STOCK_DEDUCT_STATUSES = ["قيد التجهيز", "تم الشحن", "مكتمل"];

// الحالات التي يُعاد عندها المخزون إن كان قد خُصم
const STOCK_RESTORE_STATUSES = ["ملغي", "جديد"];

const PAYMENT_METHODS = [
  "الدفع عند الاستلام",
  "تحويل بنكي",
  "رابط دفع إلكتروني",
];

function formatPrice(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

// تحويل الرقم إلى الصيغة الدولية للسعودية (966...)
function normalizePhone(value) {
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "966" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("5")) digits = "966" + digits;
  return digits;
}

function generateOrderNumber() {
  const time = Date.now().toString(36).toUpperCase().slice(-5);
  const random = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `NB-${time}${random}`;
}

const CART_STORAGE_KEY = "nabea_cart_v1";

// قراءة السلة المحفوظة في المتصفح مع التحقق من سلامة بياناتها
function loadSavedCart() {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(CART_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return [];

    return saved
      .filter(
        (item) =>
          item &&
          typeof item.key === "string" &&
          typeof item.id === "string" &&
          Number.isFinite(Number(item.price)) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0
      )
      .map((item) => ({
        key: item.key,
        id: item.id,
        name: String(item.name || ""),
        size: String(item.size || ""),
        price: Number(item.price),
        stock: Number(item.stock ?? 10),
        quantity: item.quantity,
      }));
  } catch {
    return [];
  }
}

const DEFAULT_SITE = {
  logoUrl: "",
  storeName: "النابع",
  storeNameEn: "AL NABEA PERFUMES",
  whatsapp: "966501369866",
  instagram: "",
  tiktok: "",
  snapchat: "",
  twitter: "",
  shippingDefaultFee: 0,
  shippingFreeOver: 0,
  shippingCities: [],
  announcement: "✦ أهلاً بكم في عالم النابع للعطور ✦",
  aboutTitle: "النابع...",
  aboutHighlight: "أثرٌ لا يُنسى",
  aboutText:
    "نؤمن أن العطر أكثر من مجرد رائحة؛ إنه ذكرى وهوية وتفاصيل صغيرة تصنع حضورًا لا يُنسى.",
};

// يسمح فقط بروابط https/http أو روابط داخلية
function isSafeLink(link) {
  return /^(https?:\/\/|#|\/)/.test(String(link || "").trim());
}

// روابط الحسابات الخارجية: https أو http فقط
function isHttpUrl(link) {
  return /^https?:\/\/\S+$/.test(String(link || "").trim());
}

function BrandMark({ logoUrl }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="شعار النابع"
        style={{
          height: "46px",
          width: "auto",
          maxWidth: "130px",
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }

  return <span className="brand-symbol">ن</span>;
}

function BannerSlider({ banners }) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count < 2) return undefined;

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 5000);

    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  const current = Math.min(index, count - 1);
  const banner = banners[current];
  const linked = isSafeLink(banner.link);
  const external = /^https?:\/\//.test(String(banner.link || ""));

  const slide = (
    <div style={{ position: "relative" }}>
      <img
        src={banner.image}
        alt={banner.title || "عرض من النابع"}
        style={{
          width: "100%",
          aspectRatio: "16 / 6",
          minHeight: "170px",
          maxHeight: "460px",
          objectFit: "cover",
          display: "block",
        }}
      />

      {(banner.title || banner.subtitle) && (
        <div
          style={{
            position: "absolute",
            right: 0,
            left: 0,
            bottom: 0,
            padding: "40px 7% 38px",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))",
            color: "#f7f2e8",
          }}
        >
          {banner.title && (
            <h2 style={{ margin: "0 0 6px", color: "#e8d29b" }}>
              {banner.title}
            </h2>
          )}

          {banner.subtitle && <p style={{ margin: 0 }}>{banner.subtitle}</p>}
        </div>
      )}
    </div>
  );

  const arrowStyle = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "40px",
    height: "40px",
    border: "none",
    borderRadius: "50%",
    background: "rgba(16,16,14,0.65)",
    color: "#e8d29b",
    fontSize: "24px",
    cursor: "pointer",
    zIndex: 2,
  };

  return (
    <section
      aria-label="العروض"
      style={{ position: "relative", background: "#10100e" }}
    >
      {linked ? (
        <a
          href={banner.link}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          style={{ display: "block", color: "inherit" }}
        >
          {slide}
        </a>
      ) : (
        slide
      )}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="التالي"
            onClick={() => setIndex((current + 1) % count)}
            style={{ ...arrowStyle, left: "12px" }}
          >
            ‹
          </button>

          <button
            type="button"
            aria-label="السابق"
            onClick={() => setIndex((current - 1 + count) % count)}
            style={{ ...arrowStyle, right: "12px" }}
          >
            ›
          </button>

          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              gap: "8px",
              zIndex: 2,
            }}
          >
            {banners.map((item, dotIndex) => (
              <button
                type="button"
                key={item.id}
                aria-label={`الانتقال إلى العرض ${dotIndex + 1}`}
                onClick={() => setIndex(dotIndex)}
                style={{
                  width: "10px",
                  height: "10px",
                  padding: 0,
                  borderRadius: "50%",
                  border: "1px solid #c9a45c",
                  background: dotIndex === current ? "#c9a45c" : "transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const COUPON_CODE_PATTERN = /^[\p{L}\p{N}_-]{3,20}$/u;

function normalizeCouponCode(value) {
  return String(value || "").trim().toUpperCase();
}

// حساب خصم الكوبون على المجموع الفرعي (بعد خصومات المنتجات)
function evaluateCoupon(coupon, subtotal, now = new Date()) {
  const invalid = (message) => ({ valid: false, message, discount: 0 });

  if (!coupon) return invalid("");
  if (coupon.active === false) return invalid("هذا الكوبون غير مفعّل.");

  if (coupon.expiresOn) {
    const end = new Date(`${coupon.expiresOn}T23:59:59`);

    if (!Number.isNaN(end.getTime()) && now > end) {
      return invalid("انتهت صلاحية هذا الكوبون.");
    }
  }

  const minOrder = Number(coupon.minOrder) || 0;

  if (minOrder > 0 && subtotal < minOrder) {
    return invalid(`الحد الأدنى للطلب لهذا الكوبون ${formatPrice(minOrder)} ر.س.`);
  }

  const limit = Number(coupon.usageLimit) || 0;

  if (limit > 0 && (Number(coupon.usedCount) || 0) >= limit) {
    return invalid("تم استنفاد عدد مرات استخدام هذا الكوبون.");
  }

  const value = Number(coupon.value) || 0;
  let discount = coupon.type === "fixed" ? value : subtotal * (value / 100);

  const maxDiscount = Number(coupon.maxDiscount) || 0;

  if (coupon.type !== "fixed" && maxDiscount > 0) {
    discount = Math.min(discount, maxDiscount);
  }

  discount = round2(Math.min(Math.max(discount, 0), subtotal));

  return discount > 0
    ? { valid: true, message: "", discount }
    : invalid("لا ينطبق هذا الكوبون على سلتك.");
}

// رسوم الشحن: حسب المدينة أو الافتراضية، ومجانية فوق حد معين
function computeShipping(settings, amountAfterDiscount, city) {
  const cities = Array.isArray(settings.shippingCities)
    ? settings.shippingCities
    : [];

  const match = cities.find((entry) => entry && entry.name === city);
  const fee = match
    ? Number(match.fee)
    : Number(settings.shippingDefaultFee) || 0;

  const freeOver = Number(settings.shippingFreeOver) || 0;

  if (freeOver > 0 && amountAfterDiscount >= freeOver) return 0;

  return round2(Math.max(0, fee));
}

const ARABIC_DATE_LOCALE = "ar-SA-u-ca-gregory-nu-latn";

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const SALE_MODES = [
  ["confirmed", "المبيعات المؤكدة (قيد التجهيز وما بعدها)"],
  ["completed", "المكتملة فقط"],
  ["all", "كل الطلبات عدا الملغية"],
];

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatLongDate(date) {
  if (!date) return "—";
  return date.toLocaleDateString(ARABIC_DATE_LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date) {
  if (!date) return "—";
  return date.toLocaleString(ARABIC_DATE_LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatPhoneDisplay(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("9665")) {
    return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  return digits ? `+${digits}` : "";
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey || "").split("-");
  const name = ARABIC_MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : String(monthKey || "");
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// هل يُحتسب الطلب ضمن المبيعات حسب الوضع المختار؟
function isSaleOrder(order, mode) {
  if (mode === "completed") return order.status === "مكتمل";
  if (mode === "all") return order.status !== "ملغي";
  return STOCK_DEDUCT_STATUSES.includes(order.status);
}

// مؤشرات اليوم والشهر الحالي
function computeOverview(orders, mode) {
  const now = new Date();
  const result = { today: 0, todayCount: 0, month: 0, monthCount: 0 };

  for (const order of orders) {
    const date = toDateSafe(order.createdAt);

    if (!date || !isSaleOrder(order, mode)) continue;

    const amount = Number(order.total) || 0;

    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    ) {
      result.month += amount;
      result.monthCount += 1;

      if (date.getDate() === now.getDate()) {
        result.today += amount;
        result.todayCount += 1;
      }
    }
  }

  return result;
}

// بناء تقرير المبيعات لشهر محدد (monthKey بصيغة YYYY-MM)
function buildSalesReport(orders, monthKey, mode) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  const now = new Date();
  const year = Number(yearText) || now.getFullYear();
  const month = (Number(monthText) || now.getMonth() + 1) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daily = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    total: 0,
    count: 0,
  }));

  const productsMap = new Map();
  const paymentsMap = new Map();
  const statusMap = new Map();
  const yearTotals = Array(12).fill(0);
  const monthOrders = [];

  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;

  let total = 0;
  let count = 0;
  let itemsSold = 0;
  let prevTotal = 0;
  let discountsTotal = 0;
  let shippingTotal = 0;

  for (const order of orders) {
    const date = toDateSafe(order.createdAt);

    if (!date) continue;

    const amount = Number(order.total) || 0;
    const sale = isSaleOrder(order, mode);

    if (sale && date.getFullYear() === year) {
      yearTotals[date.getMonth()] += amount;
    }

    if (
      sale &&
      date.getFullYear() === prevYear &&
      date.getMonth() === prevMonth
    ) {
      prevTotal += amount;
    }

    if (date.getFullYear() !== year || date.getMonth() !== month) continue;

    monthOrders.push(order);
    statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);

    if (!sale) continue;

    total += amount;
    count += 1;
    discountsTotal += Number(order.discount) || 0;
    shippingTotal += Number(order.shippingFee) || 0;

    const bucket = daily[date.getDate() - 1];
    bucket.total += amount;
    bucket.count += 1;

    const payment = order.paymentMethod || "غير محدد";
    const paymentEntry = paymentsMap.get(payment) || { total: 0, count: 0 };
    paymentEntry.total += amount;
    paymentEntry.count += 1;
    paymentsMap.set(payment, paymentEntry);

    for (const item of order.items || []) {
      const quantity = Number(item.quantity) || 0;
      const revenue = (Number(item.price) || 0) * quantity;
      const label = `${item.name || "منتج"}${item.size ? ` (${item.size})` : ""}`;
      const entry = productsMap.get(label) || { label, quantity: 0, revenue: 0 };

      entry.quantity += quantity;
      entry.revenue += revenue;
      productsMap.set(label, entry);
      itemsSold += quantity;
    }
  }

  const round = (value) => Math.round(value * 100) / 100;

  return {
    year,
    month,
    monthKey,
    daily: daily.map((day) => ({ ...day, total: round(day.total) })),
    yearTotals: yearTotals.map(round),
    total: round(total),
    discountsTotal: round(discountsTotal),
    shippingTotal: round(shippingTotal),
    count,
    average: count > 0 ? round(total / count) : 0,
    itemsSold,
    prevTotal: round(prevTotal),
    change: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
    products: [...productsMap.values()]
      .map((entry) => ({ ...entry, revenue: round(entry.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    payments: [...paymentsMap.entries()]
      .map(([method, entry]) => ({ method, ...entry, total: round(entry.total) }))
      .sort((a, b) => b.total - a.total),
    statuses: ORDER_STATUSES.map((status) => ({
      status,
      count: statusMap.get(status) || 0,
    })).filter((entry) => entry.count > 0),
    monthOrders,
  };
}

// تصدير طلبات الشهر إلى ملف CSV يفتح في Excel
function exportOrdersCsv(orders, monthKey) {
  const header = [
    "رقم الطلب",
    "رقم الفاتورة",
    "التاريخ",
    "الحالة",
    "العميل",
    "الجوال",
    "العنوان",
    "طريقة الدفع",
    "الأصناف",
    "المدينة",
    "كود الخصم",
    "الخصم (ر.س)",
    "الشحن (ر.س)",
    "الإجمالي (ر.س)",
  ];

  const safe = (value) => {
    let text = String(value ?? "");
    // منع تنفيذ المعادلات عند فتح الملف في Excel
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = orders.map((order) => [
    order.orderNumber,
    order.invoiceNumber || "",
    formatDateTime(toDateSafe(order.createdAt)),
    order.status,
    order.customerName,
    order.customerPhone,
    order.customerAddress,
    order.paymentMethod,
    (order.items || [])
      .map(
        (item) =>
          `${item.name}${item.size ? ` (${item.size})` : ""} × ${item.quantity}`
      )
      .join(" | "),
    order.city || "",
    order.couponCode || "",
    Number(order.discount) || 0,
    Number(order.shippingFee) || 0,
    Number(order.total) || 0,
  ]);

  const csv =
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(safe).join(",")).join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `orders-${monthKey}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const PRINT_CSS = `
.print-portal { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,0.82); overflow: auto; overscroll-behavior: contain; }
.print-toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; padding: 12px; background: #1b1a15; border-bottom: 1px solid #c9a45c; color: #e8d29b; }
.print-toolbar button { padding: 10px 22px; border: 1px solid #c9a45c; background: #c9a45c; color: #10100e; cursor: pointer; font-weight: bold; font-family: inherit; }
.print-toolbar button.secondary { background: transparent; color: #e8d29b; }
.print-stage { padding: 20px 10px 50px; display: flex; justify-content: center; overflow-x: auto; }
.print-paper { width: 210mm; min-height: 297mm; flex: none; display: flex; flex-direction: column; background: #fff; color: #1b1a15; box-sizing: border-box; box-shadow: 0 10px 40px rgba(0,0,0,0.5); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.print-paper tr { break-inside: avoid; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body > *:not(.print-portal) { display: none !important; }
  .print-portal { position: static !important; background: none !important; overflow: visible !important; }
  .no-print { display: none !important; }
  .print-stage { padding: 0 !important; display: block !important; overflow: visible !important; }
  .print-paper { width: 100% !important; min-height: 295mm !important; box-shadow: none !important; }
}
`;

function PrintPortal({ title, onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="print-portal" dir="rtl">
      <style>{PRINT_CSS}</style>

      <div className="print-toolbar no-print">
        <strong>{title}</strong>
        <button type="button" onClick={() => window.print()}>
          🖨️ طباعة
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إغلاق
        </button>
      </div>

      <div className="print-stage">{children}</div>
    </div>,
    document.body
  );
}

function InvoiceLogo({ logoUrl, size = 78 }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const gold = "#b8924a";
  const ink = "#1b1a15";

  if (logoUrl && !failed) {
    // خلفية داكنة مثل ترويسة الموقع ليظهر الشعار مهما كان لونه
    return (
      <div
        style={{
          background: ink,
          padding: "8px 12px",
          borderRadius: "8px",
          border: `2px solid ${gold}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={logoUrl}
          alt="شعار المتجر"
          onError={() => setFailed(true)}
          style={{
            height: `${size}px`,
            width: "auto",
            maxWidth: "160px",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: ink,
        color: "#e8d29b",
        border: `2px solid ${gold}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `${Math.round(size * 0.5)}px`,
        fontWeight: "bold",
      }}
    >
      ن
    </div>
  );
}

function InvoiceSheet({ order, site, printedAt }) {
  const issued = toDateSafe(order.invoiceDate) || printedAt;
  const created = toDateSafe(order.createdAt);
  const items = order.items || [];

  const gold = "#b8924a";
  const ink = "#1b1a15";
  const muted = "#6b6559";
  const line = "#e7dfcf";

  const cell = {
    padding: "10px 10px",
    borderBottom: `1px solid ${line}`,
    textAlign: "right",
    fontSize: "13px",
  };

  const headCell = {
    ...cell,
    background: ink,
    color: "#e8d29b",
    fontWeight: "bold",
    borderBottom: "none",
  };

  const metaLabel = { color: muted, fontSize: "11px", marginBottom: "3px" };
  const metaValue = { color: ink, fontWeight: "bold", fontSize: "14px" };

  return (
    <div className="print-paper" dir="rtl">
      <div
        style={{
          height: "10px",
          background: `linear-gradient(90deg, ${gold}, #e8d29b, ${gold})`,
        }}
      />

      <div
        style={{
          padding: "12mm 14mm 10mm",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            paddingBottom: "16px",
            borderBottom: `2px solid ${ink}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <InvoiceLogo logoUrl={site.logoUrl} />

            <div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: ink }}>
                {site.storeName}
              </div>
              <div
                dir="ltr"
                style={{ fontSize: "11px", letterSpacing: "2px", color: gold, textAlign: "right" }}
              >
                {site.storeNameEn}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "34px", fontWeight: "bold", color: gold, lineHeight: 1 }}>
              فاتورة
            </div>
            <div dir="ltr" style={{ fontSize: "12px", letterSpacing: "4px", color: muted }}>
              INVOICE
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "14px",
            margin: "18px 0",
            padding: "14px 16px",
            background: "#faf6ec",
            border: `1px solid ${line}`,
          }}
        >
          <div>
            <div style={metaLabel}>رقم الفاتورة</div>
            <div dir="ltr" style={{ ...metaValue, textAlign: "right", color: gold }}>
              {order.invoiceNumber}
            </div>
          </div>

          <div>
            <div style={metaLabel}>تاريخ الفاتورة</div>
            <div style={metaValue}>{formatLongDate(issued)}</div>
          </div>

          <div>
            <div style={metaLabel}>رقم الطلب</div>
            <div dir="ltr" style={{ ...metaValue, textAlign: "right" }}>
              {order.orderNumber}
            </div>
          </div>

          <div>
            <div style={metaLabel}>تاريخ الطلب</div>
            <div style={metaValue}>{formatLongDate(created)}</div>
          </div>

          <div>
            <div style={metaLabel}>طريقة الدفع</div>
            <div style={metaValue}>{order.paymentMethod}</div>
          </div>

          <div>
            <div style={metaLabel}>حالة الطلب</div>
            <div style={metaValue}>{order.status}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div style={{ padding: "14px 16px", border: `1px solid ${line}` }}>
            <div style={{ color: gold, fontWeight: "bold", marginBottom: "8px" }}>
              بيانات العميل
            </div>
            <div style={{ fontSize: "14px", lineHeight: 1.9, color: ink }}>
              <div>
                <strong>{order.customerName}</strong>
              </div>
              <div dir="ltr" style={{ textAlign: "right" }}>
                {formatPhoneDisplay(order.customerPhone)}
              </div>
              <div style={{ color: muted }}>{order.customerAddress}</div>
            </div>
          </div>

          <div style={{ padding: "14px 16px", border: `1px solid ${line}` }}>
            <div style={{ color: gold, fontWeight: "bold", marginBottom: "8px" }}>
              بيانات التواصل
            </div>
            <div style={{ fontSize: "14px", lineHeight: 1.9, color: ink }}>
              <div>
                <strong>{site.storeName}</strong>
              </div>
              <div>
                واتساب:{" "}
                <span dir="ltr" style={{ unicodeBidi: "embed" }}>
                  {formatPhoneDisplay(site.whatsapp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "20px",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...headCell, width: "6%" }}>#</th>
              <th style={headCell}>الصنف</th>
              <th style={{ ...headCell, width: "13%" }}>الحجم</th>
              <th style={{ ...headCell, width: "10%" }}>الكمية</th>
              <th style={{ ...headCell, width: "16%" }}>سعر الوحدة</th>
              <th style={{ ...headCell, width: "16%" }}>الإجمالي</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item, index) => (
              <tr
                key={`${item.productId}-${index}`}
                style={{ background: index % 2 === 1 ? "#faf6ec" : "#fff" }}
              >
                <td style={cell}>{index + 1}</td>
                <td style={{ ...cell, fontWeight: "bold" }}>{item.name}</td>
                <td style={cell}>{item.size || "—"}</td>
                <td style={cell}>{item.quantity}</td>
                <td style={cell}>{formatMoney(item.price)} ر.س</td>
                <td style={{ ...cell, fontWeight: "bold" }}>
                  {formatMoney(Number(item.price) * Number(item.quantity))} ر.س
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "10px",
            marginTop: "18px",
            marginBottom: "30px",
          }}
        >
          {order.subtotal !== undefined && (
            <div style={{ minWidth: "270px", fontSize: "13px", color: ink }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: muted }}>المجموع</span>
                <span>{formatMoney(order.subtotal)} ر.س</span>
              </div>

              {Number(order.discount) > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 0",
                    color: "#a52a2a",
                  }}
                >
                  <span>خصم الكوبون ({order.couponCode})</span>
                  <span>-{formatMoney(order.discount)} ر.س</span>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: muted }}>
                  الشحن{order.city ? ` — ${order.city}` : ""}
                </span>
                <span>
                  {Number(order.shippingFee) > 0
                    ? `${formatMoney(order.shippingFee)} ر.س`
                    : "مجاني"}
                </span>
              </div>
            </div>
          )}

          <div
            style={{
              minWidth: "270px",
              padding: "14px 18px",
              background: ink,
              color: "#e8d29b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "24px",
              borderRight: `5px solid ${gold}`,
            }}
          >
            <span style={{ fontSize: "14px" }}>الإجمالي المستحق</span>
            <strong style={{ fontSize: "24px" }}>
              {formatMoney(order.total)} <small style={{ fontSize: "13px" }}>ر.س</small>
            </strong>
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: "14px",
            borderTop: `1px dashed ${gold}`,
            textAlign: "center",
            color: muted,
            fontSize: "12px",
            lineHeight: 1.9,
          }}
        >
          <div style={{ color: ink, fontSize: "15px", fontWeight: "bold" }}>
            شكرًا لتسوقكم من {site.storeName}
          </div>
          <div style={{ color: ink, fontSize: "14px", fontWeight: "bold", margin: "4px 0" }}>
            للتواصل والاستفسار:{" "}
            <span dir="ltr" style={{ unicodeBidi: "embed" }}>
              {formatPhoneDisplay(site.whatsapp)}
            </span>
          </div>
          <div>الأسعار بالريال السعودي • نسعد بخدمتكم دائمًا</div>
          <div style={{ fontSize: "10px", marginTop: "6px" }}>
            طُبعت بتاريخ {formatDateTime(printedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid #494131",
        background: "#10100e",
      }}
    >
      <div style={{ color: "#aaa59a", fontSize: "13px" }}>{label}</div>
      <div
        style={{
          color: tone || "#e8d29b",
          fontSize: "24px",
          fontWeight: "bold",
          margin: "6px 0 2px",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ color: "#aaa59a", fontSize: "12px" }}>{sub}</div>}
    </div>
  );
}

function ReportPanel({ title, children }) {
  return (
    <div
      style={{
        margin: "20px 0",
        padding: "16px",
        border: "1px solid #494131",
        background: "#10100e",
      }}
    >
      <strong style={{ color: "#e8d29b", display: "block", marginBottom: "14px" }}>
        {title}
      </strong>
      {children}
    </div>
  );
}

function SimpleBars({ values, labels, height = 130 }) {
  const max = Math.max(...values, 0);

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "3px",
          height: `${height + 24}px`,
          minWidth: `${values.length * 18}px`,
        }}
      >
        {values.map((value, index) => (
          <div
            key={labels[index]}
            title={`${labels[index]}: ${formatMoney(value)} ر.س`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              height: "100%",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "30px",
                height:
                  max > 0 && value > 0
                    ? `${Math.max(3, (value / max) * height)}px`
                    : "0px",
                background: "#c9a45c",
              }}
            />
            <span style={{ fontSize: "10px", color: "#aaa59a", marginTop: "5px" }}>
              {labels[index]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportSheet({ report, modeLabel, site, printedAt }) {
  const gold = "#b8924a";
  const ink = "#1b1a15";
  const muted = "#6b6559";
  const line = "#e7dfcf";

  const cell = {
    padding: "8px 10px",
    borderBottom: `1px solid ${line}`,
    textAlign: "right",
    fontSize: "13px",
  };
  const headCell = { ...cell, background: ink, color: "#e8d29b", fontWeight: "bold" };

  const salesDays = report.daily.filter((day) => day.count > 0);

  const summary = [
    ["إجمالي المبيعات", `${formatMoney(report.total)} ر.س`],
    ["عدد الطلبات", String(report.count)],
    ["متوسط قيمة الطلب", `${formatMoney(report.average)} ر.س`],
    ["عدد القطع المباعة", String(report.itemsSold)],
    ["خصومات الكوبونات", `${formatMoney(report.discountsTotal)} ر.س`],
    ["رسوم الشحن المحصّلة", `${formatMoney(report.shippingTotal)} ر.س`],
    [
      "التغير عن الشهر السابق",
      report.change === null
        ? "—"
        : `${report.change >= 0 ? "+" : ""}${report.change.toFixed(1)}٪`,
    ],
  ];

  return (
    <div className="print-paper" dir="rtl">
      <div
        style={{
          height: "10px",
          background: `linear-gradient(90deg, ${gold}, #e8d29b, ${gold})`,
        }}
      />

      <div style={{ padding: "12mm 14mm 10mm" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "14px",
            borderBottom: `2px solid ${ink}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <InvoiceLogo logoUrl={site.logoUrl} size={52} />
            <div style={{ fontSize: "22px", fontWeight: "bold" }}>{site.storeName}</div>
          </div>

          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: gold }}>
              تقرير المبيعات الشهري
            </div>
            <div style={{ color: muted }}>{monthLabel(report.monthKey)}</div>
          </div>
        </div>

        <p style={{ color: muted, fontSize: "12px", margin: "10px 0 18px" }}>
          أساس الاحتساب: {modeLabel}
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {summary.map(([label, value]) => (
              <tr key={label}>
                <td style={{ ...cell, color: muted, width: "50%" }}>{label}</td>
                <td style={{ ...cell, fontWeight: "bold", fontSize: "15px" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ margin: "24px 0 8px", color: ink }}>أكثر المنتجات مبيعًا</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headCell}>المنتج</th>
              <th style={{ ...headCell, width: "15%" }}>الكمية</th>
              <th style={{ ...headCell, width: "25%" }}>الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {report.products.slice(0, 10).map((product) => (
              <tr key={product.label}>
                <td style={cell}>{product.label}</td>
                <td style={cell}>{product.quantity}</td>
                <td style={cell}>{formatMoney(product.revenue)} ر.س</td>
              </tr>
            ))}
            {report.products.length === 0 && (
              <tr>
                <td style={cell} colSpan={3}>لا توجد مبيعات في هذا الشهر.</td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 style={{ margin: "24px 0 8px", color: ink }}>المبيعات اليومية</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headCell}>اليوم</th>
              <th style={{ ...headCell, width: "25%" }}>عدد الطلبات</th>
              <th style={{ ...headCell, width: "30%" }}>المبيعات</th>
            </tr>
          </thead>
          <tbody>
            {salesDays.map((day) => (
              <tr key={day.day}>
                <td style={cell}>{day.day} {ARABIC_MONTHS[report.month]}</td>
                <td style={cell}>{day.count}</td>
                <td style={cell}>{formatMoney(day.total)} ر.س</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "28px",
            paddingTop: "10px",
            borderTop: `1px dashed ${gold}`,
            textAlign: "center",
            color: muted,
            fontSize: "11px",
          }}
        >
          صدر هذا التقرير بتاريخ {formatDateTime(printedAt)}
        </div>
      </div>
    </div>
  );
}

function productHasSizes(product) {
  return Array.isArray(product?.sizes) && product.sizes.length > 0;
}

function getSizeOption(product, label) {
  return (product?.sizes || []).find((option) => option.label === label);
}

function getOriginalUnitPrice(product, sizeLabel) {
  if (productHasSizes(product)) {
    return Number(getSizeOption(product, sizeLabel)?.price ?? product.price);
  }
  return Number(product.price);
}

function getUnitPrice(product, sizeLabel) {
  const originalPrice = getOriginalUnitPrice(product, sizeLabel);
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(product.discountPercent) || 0)
  );
  return Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;
}

function getUnitStock(product, sizeLabel) {
  if (productHasSizes(product)) {
    return Number(getSizeOption(product, sizeLabel)?.stock ?? 0);
  }
  return Number(product.stock ?? 10);
}

// صفحة الإدارة منفصلة: /admin أو /#/admin ولا يوجد أي رابط لها في المتجر
function getIsAdminRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/admin" || window.location.hash.startsWith("#/admin");
}

function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(getIsAdminRoute);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDiscount, setProductDiscount] = useState("0");
  const [productCategory, setProductCategory] = useState("عطور رجالية");
  const [productDescription, setProductDescription] = useState("");
  const [productStock, setProductStock] = useState("10");
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const [productSizes, setProductSizes] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedSize, setSelectedSize] = useState("");

  const [adminTab, setAdminTab] = useState("products");

  const [siteSettings, setSiteSettings] = useState({});

  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponInput, setCouponInput] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [customerCity, setCustomerCity] = useState("");

  const [couponsList, setCouponsList] = useState([]);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponType, setCouponType] = useState("percent");
  const [couponValue, setCouponValue] = useState("");
  const [couponMinOrder, setCouponMinOrder] = useState("");
  const [couponMaxDiscount, setCouponMaxDiscount] = useState("");
  const [couponExpiresOn, setCouponExpiresOn] = useState("");
  const [couponUsageLimit, setCouponUsageLimit] = useState("");
  const [couponActive, setCouponActive] = useState(true);
  const [editingCouponCode, setEditingCouponCode] = useState(null);
  const [savingCoupon, setSavingCoupon] = useState(false);

  const [shipDefaultFee, setShipDefaultFee] = useState("0");
  const [shipFreeOver, setShipFreeOver] = useState("0");
  const [shipCityRows, setShipCityRows] = useState([]);
  const [savingShipping, setSavingShipping] = useState(false);
  const [bannersList, setBannersList] = useState([]);

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [siteStoreName, setSiteStoreName] = useState("");
  const [siteStoreNameEn, setSiteStoreNameEn] = useState("");
  const [siteWhatsapp, setSiteWhatsapp] = useState("");
  const [siteInstagram, setSiteInstagram] = useState("");
  const [siteTiktok, setSiteTiktok] = useState("");
  const [siteSnapchat, setSiteSnapchat] = useState("");
  const [siteTwitter, setSiteTwitter] = useState("");
  const [siteAnnouncement, setSiteAnnouncement] = useState("");
  const [siteAboutTitle, setSiteAboutTitle] = useState("");
  const [siteAboutHighlight, setSiteAboutHighlight] = useState("");
  const [siteAboutText, setSiteAboutText] = useState("");
  const [savingSite, setSavingSite] = useState(false);

  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [bannerLink, setBannerLink] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);

  const [invoiceOrderId, setInvoiceOrderId] = useState(null);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [reportMonth, setReportMonth] = useState(currentMonthKey);
  const [reportMode, setReportMode] = useState("confirmed");
  const [reportPrintOpen, setReportPrintOpen] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState("الكل");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [cart, setCart] = useState(loadSavedCart);
  const [toasts, setToasts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [search, setSearch] = useState("");

  // إشعار مؤقت يظهر أسفل الشاشة بدل نافذة alert
  function showToast(message, type, duration) {
    const kind =
      type ||
      (/^(تم|تمت|أُضيف)/.test(message)
        ? "success"
        : /(تعذر|خطأ|عذرًا|غير مصرح|تتجاوز|لا توجد كمية)/.test(message)
          ? "error"
          : "info");

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const visibleFor =
      duration || Math.min(10000, 2800 + String(message).length * 55);

    setToasts((current) => [...current.slice(-3), { id, message, kind }]);

    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, visibleFor);
  }

  // حفظ السلة في المتصفح عند كل تغيير
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // التخزين غير متاح (وضع خاص مثلًا): نتجاهل الحفظ
    }
  }, [cart]);

  // مطابقة السلة المحفوظة مع المنتجات الحالية (أسعار، مخزون، منتجات محذوفة)
  useEffect(() => {
    if (productsLoading || products.length === 0) return;

    setCart((current) => {
      let changed = false;
      const next = [];

      for (const item of current) {
        const live = products.find((product) => product.id === item.id);
        const sizeLabel = item.size || "";

        if (!live || (productHasSizes(live) && !getSizeOption(live, sizeLabel))) {
          changed = true;
          continue;
        }

        const stock = getUnitStock(live, sizeLabel);
        const price = getUnitPrice(live, sizeLabel);
        const quantity = Math.min(item.quantity, stock);

        if (quantity <= 0) {
          changed = true;
          continue;
        }

        if (
          quantity !== item.quantity ||
          price !== item.price ||
          stock !== item.stock ||
          live.name !== item.name
        ) {
          changed = true;
        }

        next.push({ ...item, name: live.name, price, stock, quantity });
      }

      return changed ? next : current;
    });
  }, [products, productsLoading]);

  // متابعة تغيّر العنوان (الانتقال بين المتجر وصفحة الإدارة)
  useEffect(() => {
    function updateRoute() {
      setIsAdminRoute(getIsAdminRoute());
    }

    window.addEventListener("hashchange", updateRoute);
    window.addEventListener("popstate", updateRoute);

    return () => {
      window.removeEventListener("hashchange", updateRoute);
      window.removeEventListener("popstate", updateRoute);
    };
  }, []);

  // صفحة الإدارة لا تُفهرس في محركات البحث
  useEffect(() => {
    if (!isAdminRoute) return undefined;

    const previousTitle = document.title;
    const meta = document.createElement("meta");

    document.title = "لوحة الإدارة";
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);

    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, [isAdminRoute]);

  // التحقق من حساب المدير عند تحميل التطبيق
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const authorized = Boolean(user && user.uid === ADMIN_UID);

      setIsAdmin(authorized);

      if (user && !authorized) {
        signOut(auth).catch((error) => {
          console.error("تعذر تسجيل خروج الحساب غير المصرح:", error);
        });
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // جلب المنتجات ومزامنتها مع Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const loadedProducts = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setProducts(loadedProducts);
        setProductsLoading(false);
      },
      (error) => {
        console.error("خطأ في تحميل المنتجات:", error);
        setProductsLoading(false);
        showToast("تعذر تحميل المنتجات. تحقق من اتصال Firebase وصلاحيات القراءة.");
      }
    );

    return () => unsubscribe();
  }, []);

  // نافذة التفاصيل: إغلاق بزر Escape ومنع تمرير الصفحة خلفها
  useEffect(() => {
    if (!selectedProductId) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelectedProductId(null);
        setSelectedSize("");
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProductId]);

  // جلب إعدادات الموقع (الشعار والنبذة) والبنرات
  useEffect(() => {
    const unsubscribeSettings = onSnapshot(
      doc(db, "settings", "site"),
      (snapshot) => {
        setSiteSettings(snapshot.exists() ? snapshot.data() : {});
      },
      (error) => console.error("خطأ في تحميل إعدادات الموقع:", error)
    );

    const unsubscribeBanners = onSnapshot(
      collection(db, "banners"),
      (snapshot) => {
        setBannersList(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        );
      },
      (error) => console.error("خطأ في تحميل البنرات:", error)
    );

    return () => {
      unsubscribeSettings();
      unsubscribeBanners();
    };
  }, []);

  // مزامنة حقول نموذج إعدادات الموقع مع القيم المحفوظة
  useEffect(() => {
    const merged = { ...DEFAULT_SITE, ...siteSettings };

    setSiteAnnouncement(merged.announcement);
    setSiteAboutTitle(merged.aboutTitle);
    setSiteAboutHighlight(merged.aboutHighlight);
    setSiteAboutText(merged.aboutText);
    setSiteStoreName(merged.storeName);
    setSiteStoreNameEn(merged.storeNameEn);
    setSiteWhatsapp(merged.whatsapp);
    setSiteInstagram(merged.instagram);
    setSiteTiktok(merged.tiktok);
    setSiteSnapchat(merged.snapchat);
    setSiteTwitter(merged.twitter);
    setLogoPreview(merged.logoUrl || "");
    setLogoFile(null);
  }, [siteSettings]);

  // مزامنة نموذج إعدادات الشحن مع القيم المحفوظة
  useEffect(() => {
    setShipDefaultFee(String(siteSettings.shippingDefaultFee ?? 0));
    setShipFreeOver(String(siteSettings.shippingFreeOver ?? 0));
    setShipCityRows(
      (Array.isArray(siteSettings.shippingCities)
        ? siteSettings.shippingCities
        : []
      ).map((entry) => ({
        name: String(entry.name ?? ""),
        fee: String(entry.fee ?? 0),
      }))
    );
  }, [siteSettings]);

  // جلب أكواد الخصم (للمدير فقط)
  useEffect(() => {
    if (!isAdmin || !isAdminRoute) {
      setCouponsList([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      collection(db, "coupons"),
      (snapshot) => {
        setCouponsList(
          snapshot.docs.map((item) => ({ code: item.id, ...item.data() }))
        );
      },
      (error) => console.error("خطأ في تحميل أكواد الخصم:", error)
    );

    return () => unsubscribe();
  }, [isAdmin, isAdminRoute]);

  // جلب الطلبات (للمدير فقط)
  useEffect(() => {
    if (!isAdmin || !isAdminRoute) {
      setOrders([]);
      return undefined;
    }

    const ordersQuery = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (error) => {
        console.error("خطأ في تحميل الطلبات:", error);
        showToast(
          "تعذر تحميل الطلبات. رمز الخطأ: " +
            error.code +
            (error.code === "permission-denied"
              ? " (تحقق من نشر قواعد Firestore وأنك سجلت الدخول بحساب المدير)"
              : "")
        );
      }
    );

    return () => unsubscribe();
  }, [isAdmin, isAdminRoute]);

  // البحث والتصنيف
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      activeCategory === "الكل" || product.category === activeCategory;

    const matchesSearch = (product.name || "")
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // إضافة منتج إلى السلة مع مراعاة الحجم والمخزون
  function addToCart(product, sizeLabel = "") {
    if (productHasSizes(product) && !getSizeOption(product, sizeLabel)) {
      showToast("يرجى اختيار الحجم أولًا.");
      return;
    }

    const stock = getUnitStock(product, sizeLabel);

    if (stock <= 0) {
      showToast("عذرًا، هذا المنتج غير متوفر حاليًا.");
      return;
    }

    const key = `${product.id}__${sizeLabel}`;
    const existing = cart.find((item) => item.key === key);

    if ((existing ? existing.quantity : 0) >= stock) {
      showToast("لا توجد كمية إضافية متاحة من هذا المنتج.");
      return;
    }

    setCart((currentCart) => {
      const found = currentCart.find((item) => item.key === key);

      if (found) {
        if (found.quantity >= stock) return currentCart;

        return currentCart.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...currentCart,
        {
          key,
          id: product.id,
          name: product.name,
          size: sizeLabel,
          price: getUnitPrice(product, sizeLabel),
          stock,
          quantity: 1,
        },
      ];
    });

    showToast(
      `أُضيف "${product.name}${sizeLabel ? ` (${sizeLabel})` : ""}" إلى السلة`,
      "success"
    );
  }

  // تغيير كمية المنتج داخل السلة
  function changeQuantity(key, amount) {
    const target = cart.find((item) => item.key === key);

    if (!target) return;

    if (target.quantity + amount > Number(target.stock ?? 10)) {
      showToast("الكمية المطلوبة تتجاوز المخزون المتوفر.");
      return;
    }

    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.key === key
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  // حفظ الطلب في Firestore ثم إرساله عبر واتساب
  async function checkout() {
    if (cart.length === 0) {
      showToast("سلة المشتريات فارغة!");
      return;
    }

    const name = customerName.trim();
    const phone = normalizePhone(customerPhone);
    const address = customerAddress.trim();

    if (name.length < 2) {
      showToast("يرجى إدخال اسمك.");
      return;
    }

    if (phone.length < 11 || phone.length > 15) {
      showToast("يرجى إدخال رقم جوال صحيح.");
      return;
    }

    if (address.length < 5) {
      showToast("يرجى إدخال عنوان التوصيل.");
      return;
    }

    if (
      shippingCities.length > 0 &&
      !shippingCities.some((entry) => entry.name === customerCity)
    ) {
      showToast("يرجى اختيار المدينة.");
      return;
    }

    const cityName = customerCity;

    // نعتمد على الأسعار والمخزون الحاليين من قاعدة البيانات لا من السلة
    const items = [];

    for (const cartItem of cart) {
      const live = products.find((product) => product.id === cartItem.id);
      const sizeLabel = cartItem.size || "";

      if (!live) {
        showToast(`المنتج "${cartItem.name}" لم يعد متوفرًا. تم حذفه من السلة.`);
        setCart((current) =>
          current.filter((item) => item.key !== cartItem.key)
        );
        return;
      }

      if (productHasSizes(live) && !getSizeOption(live, sizeLabel)) {
        showToast(`الحجم المختار من "${live.name}" لم يعد متوفرًا. تم حذفه من السلة.`);
        setCart((current) =>
          current.filter((item) => item.key !== cartItem.key)
        );
        return;
      }

      if (cartItem.quantity > getUnitStock(live, sizeLabel)) {
        showToast(`الكمية المطلوبة من "${live.name}" تتجاوز المخزون المتوفر.`);
        return;
      }

      items.push({
        productId: live.id,
        name: live.name,
        size: sizeLabel,
        price: getUnitPrice(live, sizeLabel),
        quantity: cartItem.quantity,
      });
    }

    const subtotal = round2(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    );

    const orderNumber = generateOrderNumber();

    // نفتح نافذة واتساب قبل العمليات غير المتزامنة لتجنب حظر المتصفح لها
    const whatsappWindow = window.open("about:blank", "_blank");

    setPlacingOrder(true);

    let discount = 0;
    let couponCode = "";

    if (appliedCoupon) {
      try {
        // نعيد جلب الكوبون للتأكد من حالته الحالية (تفعيل، صلاحية، عدد الاستخدام)
        const snap = await getDoc(doc(db, "coupons", appliedCoupon.code));
        const fresh = snap.exists()
          ? { code: appliedCoupon.code, ...snap.data() }
          : null;
        const result = evaluateCoupon(fresh, subtotal);

        if (!result.valid) {
          if (whatsappWindow) whatsappWindow.close();

          setAppliedCoupon(null);
          setPlacingOrder(false);
          showToast(
            `لم يعد الكوبون صالحًا. ${result.message || "تمت إزالته من السلة."}`
          );
          return;
        }

        discount = result.discount;
        couponCode = fresh.code;
      } catch (error) {
        console.error("خطأ في التحقق من الكوبون:", error);

        if (whatsappWindow) whatsappWindow.close();

        setPlacingOrder(false);
        showToast("تعذر التحقق من الكوبون. حاول مرة أخرى.");
        return;
      }
    }

    const shippingFee = computeShipping(site, subtotal - discount, cityName);
    const orderTotal = round2(subtotal - discount + shippingFee);

    try {
      await addDoc(collection(db, "orders"), {
        orderNumber,
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        city: cityName,
        paymentMethod,
        items,
        subtotal,
        discount,
        couponCode,
        shippingFee,
        total: orderTotal,
        status: "جديد",
        stockDeducted: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("خطأ في حفظ الطلب:", error);

      if (whatsappWindow) whatsappWindow.close();

      showToast("تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.");
      setPlacingOrder(false);
      return;
    }

    const orderDetails = items
      .map(
        (item) =>
          `• ${item.name}${item.size ? ` (${item.size})` : ""} × ${
            item.quantity
          } = ${formatPrice(item.price * item.quantity)} ريال`
      )
      .join("\n");

    const message =
      `السلام عليكم، أريد تأكيد طلبي من متجر ${site.storeName}\n` +
      `رقم الطلب: ${orderNumber}\n\n` +
      `${orderDetails}\n\n` +
      `المجموع: ${formatPrice(subtotal)} ريال\n` +
      (discount > 0
        ? `خصم الكوبون (${couponCode}): -${formatPrice(discount)} ريال\n`
        : "") +
      `الشحن: ${shippingFee > 0 ? `${formatPrice(shippingFee)} ريال` : "مجاني"}\n` +
      `الإجمالي: ${formatPrice(orderTotal)} ريال\n\n` +
      `الاسم: ${name}\n` +
      `الجوال: ${customerPhone.trim()}\n` +
      (cityName ? `المدينة: ${cityName}\n` : "") +
      `العنوان: ${address}\n` +
      `طريقة الدفع: ${paymentMethod}`;

    const whatsappUrl = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(
      message
    )}`;

    if (whatsappWindow) {
      whatsappWindow.location.href = whatsappUrl;
    } else {
      window.location.href = whatsappUrl;
    }

    setCart([]);
    setAppliedCoupon(null);
    setCouponInput("");
    setCustomerCity("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setPaymentMethod(PAYMENT_METHODS[0]);
    setPlacingOrder(false);

    showToast(`تم تسجيل طلبك برقم ${orderNumber}. شكرًا لك!`, "success", 12000);
  }

  // تسجيل دخول المدير
  async function handleAdminLogin(event) {
    event.preventDefault();

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        adminEmail.trim(),
        adminPassword
      );

      if (result.user.uid !== ADMIN_UID) {
        await signOut(auth);
        setIsAdmin(false);
        showToast("هذا الحساب غير مصرح له بإدارة المتجر.");
        return;
      }

      setIsAdmin(true);
      setAdminPassword("");

      showToast("تم تسجيل الدخول بنجاح.");
    } catch (error) {
      console.error("خطأ تسجيل الدخول:", error);

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        showToast("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      } else {
        showToast("رمز الخطأ: " + error.code + " | التفاصيل: " + error.message);
      }
    }
  }

  // تسجيل الخروج
  async function handleAdminLogout() {
    try {
      await signOut(auth);

      setIsAdmin(false);
      setAdminEmail("");
      setAdminPassword("");
      clearProductForm();

      showToast("تم تسجيل الخروج بنجاح.");
    } catch (error) {
      console.error("خطأ تسجيل الخروج:", error);
      showToast("تعذر تسجيل الخروج. حاول مرة أخرى.");
    }
  }

  // حفظ منتج جديد أو تعديل منتج موجود
  async function saveProduct(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("يجب تسجيل الدخول بحساب المدير أولًا.");
      return;
    }

    if (!productName.trim()) {
      showToast("يرجى إدخال اسم المنتج.");
      return;
    }

    let price = Number(productPrice);
    let stock = Number(productStock);
    const discountPercent = Number(productDiscount);
    const sizesData = [];

    if (
      productDiscount.trim() === "" ||
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      showToast("يرجى إدخال نسبة خصم من 0 إلى 100.");
      return;
    }

    if (productSizes.length > 0) {
      const seen = new Set();

      for (const row of productSizes) {
        const label = row.label.trim();
        const sizePrice = Number(row.price);
        const sizeStock = Number(row.stock);

        if (!label) {
          showToast("يرجى إدخال اسم لكل حجم (مثال: 50 مل).");
          return;
        }

        if (seen.has(label)) {
          showToast(`الحجم "${label}" مكرر.`);
          return;
        }

        seen.add(label);

        if (
          row.price.trim() === "" ||
          !Number.isFinite(sizePrice) ||
          sizePrice <= 0
        ) {
          showToast(`يرجى إدخال سعر صحيح للحجم "${label}".`);
          return;
        }

        if (
          row.stock.trim() === "" ||
          !Number.isInteger(sizeStock) ||
          sizeStock < 0
        ) {
          showToast(`يرجى إدخال مخزون صحيح للحجم "${label}".`);
          return;
        }

        sizesData.push({ label, price: sizePrice, stock: sizeStock });
      }

      // السعر المعروض هو الأقل، والمخزون الكلي هو مجموع الأحجام
      price = Math.min(...sizesData.map((size) => size.price));
      stock = sizesData.reduce((sum, size) => sum + size.stock, 0);
    } else {
      if (
        productPrice.trim() === "" ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        showToast("يرجى إدخال سعر صحيح أكبر من صفر.");
        return;
      }

      if (
        productStock.trim() === "" ||
        !Number.isInteger(stock) ||
        stock < 0
      ) {
        showToast("يرجى إدخال كمية صحيحة من الأعداد الصحيحة.");
        return;
      }
    }

    setSavingProduct(true);

    try {
      const existingImage =
        editingId !== null
          ? products.find((product) => product.id === editingId)?.image || ""
          : "";

      let imageUrl = existingImage;

      if (productImageFile) {
        imageUrl = await uploadProductImage(productImageFile);
      }

      if (!imageUrl) {
        showToast("يرجى اختيار صورة للمنتج.");
        return;
      }

      const productData = {
        name: productName.trim(),
        price,
        discountPercent,
        category: productCategory,
        description: productDescription.trim(),
        stock,
        sizes: sizesData,
        icon: "✨",
        image: imageUrl,
      };

      if (editingId !== null) {
        await updateDoc(doc(db, "products", editingId), productData);
      } else {
        await addDoc(collection(db, "products"), productData);
      }

      const wasEditing = editingId !== null;

      clearProductForm();

      showToast(
        wasEditing ? "تم تحديث المنتج بنجاح." : "تمت إضافة المنتج بنجاح."
      );
    } catch (error) {
      console.error("خطأ في حفظ المنتج:", error);
      showToast("تعذر حفظ المنتج: " + (error.message || "خطأ غير معروف"));
    } finally {
      setSavingProduct(false);
    }
  }

  // تحميل بيانات المنتج إلى النموذج للتعديل
  function editProduct(product) {
    if (!isAdmin) {
      showToast("غير مصرح لك بتعديل المنتجات.");
      return;
    }

    setEditingId(product.id);
    setProductName(product.name || "");
    setProductPrice(String(product.price ?? ""));
    setProductDiscount(String(product.discountPercent ?? 0));
    setProductCategory(product.category || "عطور رجالية");
    setProductDescription(product.description || "");
    setProductStock(String(product.stock ?? 10));

    setProductImageFile(null);
    setProductImagePreview(product.image || "");
    setProductSizes(
      (product.sizes || []).map((size) => ({
        label: String(size.label ?? ""),
        price: String(size.price ?? ""),
        stock: String(size.stock ?? 0),
      }))
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // حذف منتج من Firebase والسلة
  async function deleteProduct(id) {
    if (!isAdmin) {
      showToast("غير مصرح لك بحذف المنتجات.");
      return;
    }

    const confirmed = window.confirm("هل أنت متأكد من حذف هذا المنتج؟");

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "products", id));

      setCart((current) => current.filter((item) => item.id !== id));

      if (editingId === id) {
        clearProductForm();
      }

      showToast("تم حذف المنتج بنجاح.");
    } catch (error) {
      console.error("خطأ في حذف المنتج:", error);
      showToast("تعذر حذف المنتج. تحقق من صلاحيات Firebase.");
    }
  }

  // إعادة تعيين نموذج المنتج
  function clearProductForm() {
    setProductName("");
    setProductPrice("");
    setProductDiscount("0");
    setProductCategory("عطور رجالية");
    setProductDescription("");
    setProductStock("10");
    setEditingId(null);
    setProductImageFile(null);
    setProductImagePreview("");
    setProductSizes([]);
  }

  // إدارة صفوف الأحجام في نموذج المنتج
  function addSizeRow() {
    setProductSizes((current) => [
      ...current,
      { label: "", price: "", stock: "10" },
    ]);
  }

  function updateSizeRow(index, field, value) {
    setProductSizes((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  }

  function removeSizeRow(index) {
    setProductSizes((current) =>
      current.filter((row, rowIndex) => rowIndex !== index)
    );
  }

  // نافذة تفاصيل المنتج
  function openProductDetails(product) {
    setSelectedProductId(product.id);

    if (productHasSizes(product)) {
      const firstAvailable =
        product.sizes.find((size) => Number(size.stock) > 0) ||
        product.sizes[0];
      setSelectedSize(firstAvailable.label);
    } else {
      setSelectedSize("");
    }
  }

  function closeProductDetails() {
    setSelectedProductId(null);
    setSelectedSize("");
  }

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) || null;

  const selectedHasSizes = selectedProduct
    ? productHasSizes(selectedProduct)
    : false;

  const detailPrice = selectedProduct
    ? getUnitPrice(selectedProduct, selectedSize)
    : 0;

  const detailStock = selectedProduct
    ? getUnitStock(selectedProduct, selectedSize)
    : 0;

  // تغيير حالة الطلب مع خصم المخزون أو إعادته تلقائيًا
  async function changeOrderStatus(order, newStatus) {
    if (!isAdmin) {
      showToast("غير مصرح لك بإدارة الطلبات.");
      return;
    }

    if (order.status === newStatus) return;

    const shouldDeduct =
      STOCK_DEDUCT_STATUSES.includes(newStatus) && !order.stockDeducted;

    const shouldRestore =
      STOCK_RESTORE_STATUSES.includes(newStatus) && order.stockDeducted;

    try {
      const batch = writeBatch(db);
      const updates = { status: newStatus };

      if (shouldDeduct || shouldRestore) {
        const sign = shouldDeduct ? -1 : 1;
        const productUpdates = new Map();

        for (const item of order.items || []) {
          const product = products.find((p) => p.id === item.productId);

          // المنتج محذوف: نتجاوز تعديل مخزونه
          if (!product) continue;

          const sizeLabel = item.size || "";

          if (
            shouldDeduct &&
            getUnitStock(product, sizeLabel) < item.quantity
          ) {
            const proceed = window.confirm(
              `مخزون "${product.name}" ${sizeLabel} (${getUnitStock(
                product,
                sizeLabel
              )}) أقل من الكمية المطلوبة (${item.quantity}). هل تريد المتابعة؟`
            );

            if (!proceed) return;
          }

          if (productHasSizes(product)) {
            const current = productUpdates.get(product.id) || {
              sizes: product.sizes.map((size) => ({ ...size })),
            };

            const option = current.sizes.find(
              (size) => size.label === sizeLabel
            );

            if (!option) continue;

            option.stock = Number(option.stock) + sign * item.quantity;
            productUpdates.set(product.id, current);
          } else {
            const current = productUpdates.get(product.id) || { delta: 0 };
            current.delta += sign * item.quantity;
            productUpdates.set(product.id, current);
          }
        }

        for (const [productId, change] of productUpdates) {
          if (change.sizes) {
            batch.update(doc(db, "products", productId), {
              sizes: change.sizes,
              stock: change.sizes.reduce(
                (sum, size) => sum + Number(size.stock),
                0
              ),
            });
          } else {
            batch.update(doc(db, "products", productId), {
              stock: increment(change.delta),
            });
          }
        }

        // عدّاد استخدام الكوبون يتبع نفس منطق خصم المخزون
        if (
          order.couponCode &&
          couponsList.some((coupon) => coupon.code === order.couponCode)
        ) {
          batch.update(doc(db, "coupons", order.couponCode), {
            usedCount: increment(shouldDeduct ? 1 : -1),
          });
        }

        updates.stockDeducted = shouldDeduct;
      }

      batch.update(doc(db, "orders", order.id), updates);

      await batch.commit();
    } catch (error) {
      console.error("خطأ في تحديث الطلب:", error);
      showToast("تعذر تحديث الطلب. تحقق من صلاحيات Firebase.");
    }
  }

  // حذف طلب
  async function deleteOrder(order) {
    if (!isAdmin) {
      showToast("غير مصرح لك بحذف الطلبات.");
      return;
    }

    const warnings = [];

    if (order.invoiceNumber) {
      warnings.push(
        `هذا الطلب له فاتورة (${order.invoiceNumber}) وسيُحذف معها من سجل الفواتير.`
      );
    }

    if (order.stockDeducted) {
      warnings.push("هذا الطلب خُصم مخزونه، وحذفه لن يعيد المخزون.");
    }

    const confirmed = window.confirm(
      warnings.length > 0
        ? `${warnings.join("\n")}\nهل تريد المتابعة؟`
        : "هل أنت متأكد من حذف هذا الطلب؟"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "orders", order.id));
    } catch (error) {
      console.error("خطأ في حذف الطلب:", error);
      showToast("تعذر حذف الطلب. تحقق من صلاحيات Firebase.");
    }
  }

  const site = {
    ...DEFAULT_SITE,
    ...siteSettings,
    // هذه الحقول لا تقبل القيمة الفارغة
    storeName: siteSettings.storeName || DEFAULT_SITE.storeName,
    storeNameEn: siteSettings.storeNameEn || DEFAULT_SITE.storeNameEn,
    whatsapp: siteSettings.whatsapp || DEFAULT_SITE.whatsapp,
  };

  const socialLinks = [
    ["إنستغرام", site.instagram],
    ["تيك توك", site.tiktok],
    ["سناب شات", site.snapchat],
    ["X (تويتر)", site.twitter],
  ].filter(([, url]) => isHttpUrl(url));

  const sortedBanners = [...bannersList].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );

  const activeBanners = sortedBanners.filter(
    (banner) => banner.active !== false && banner.image
  );

  // حفظ إعدادات الموقع (الشعار + النبذة + شريط الإعلان)
  async function saveSiteSettings(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("غير مصرح لك بتعديل إعدادات الموقع.");
      return;
    }

    if (!siteAboutText.trim()) {
      showToast("يرجى كتابة نص النبذة.");
      return;
    }

    if (!siteStoreName.trim() || !siteStoreNameEn.trim()) {
      showToast("يرجى إدخال اسم المتجر بالعربي والإنجليزي.");
      return;
    }

    const whatsappDigits = normalizePhone(siteWhatsapp);

    if (whatsappDigits.length < 11 || whatsappDigits.length > 15) {
      showToast("يرجى إدخال رقم واتساب صحيح (مثل 0501234567).");
      return;
    }

    for (const [label, value] of [
      ["إنستغرام", siteInstagram],
      ["تيك توك", siteTiktok],
      ["سناب شات", siteSnapchat],
      ["X (تويتر)", siteTwitter],
    ]) {
      if (value.trim() && !isHttpUrl(value)) {
        showToast(`رابط ${label} يجب أن يبدأ بـ https://`);
        return;
      }
    }

    setSavingSite(true);

    try {
      let logoUrl = siteSettings.logoUrl || "";

      if (logoFile) {
        logoUrl = await uploadProductImage(logoFile);
      }

      await setDoc(
        doc(db, "settings", "site"),
        {
          logoUrl,
          announcement: siteAnnouncement.trim(),
          aboutTitle: siteAboutTitle.trim(),
          aboutHighlight: siteAboutHighlight.trim(),
          aboutText: siteAboutText.trim(),
          storeName: siteStoreName.trim(),
          storeNameEn: siteStoreNameEn.trim(),
          whatsapp: whatsappDigits,
          instagram: siteInstagram.trim(),
          tiktok: siteTiktok.trim(),
          snapchat: siteSnapchat.trim(),
          twitter: siteTwitter.trim(),
        },
        { merge: true }
      );

      showToast("تم حفظ إعدادات الموقع.");
    } catch (error) {
      console.error("خطأ في حفظ إعدادات الموقع:", error);
      showToast("تعذر حفظ الإعدادات: " + (error.message || "خطأ غير معروف"));
    } finally {
      setSavingSite(false);
    }
  }

  // الرجوع إلى الشعار الافتراضي (حرف ن)
  async function removeLogo() {
    if (!isAdmin) return;

    if (!window.confirm("هل تريد الرجوع إلى الشعار الافتراضي؟")) return;

    try {
      await setDoc(doc(db, "settings", "site"), { logoUrl: "" }, { merge: true });
    } catch (error) {
      console.error("خطأ في إزالة الشعار:", error);
      showToast("تعذر إزالة الشعار.");
    }
  }

  // إضافة بنر جديد
  async function addBanner(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("غير مصرح لك بإضافة البنرات.");
      return;
    }

    if (!bannerFile) {
      showToast("يرجى اختيار صورة البنر.");
      return;
    }

    if (bannerLink.trim() && !isSafeLink(bannerLink)) {
      showToast("الرابط يجب أن يبدأ بـ https:// أو # (مثل #products).");
      return;
    }

    setSavingBanner(true);

    try {
      const image = await uploadProductImage(bannerFile);

      await addDoc(collection(db, "banners"), {
        image,
        title: bannerTitle.trim(),
        subtitle: bannerSubtitle.trim(),
        link: bannerLink.trim(),
        active: true,
        order: Date.now(),
      });

      setBannerFile(null);
      setBannerPreview("");
      setBannerTitle("");
      setBannerSubtitle("");
      setBannerLink("");

      showToast("تمت إضافة البنر بنجاح.");
    } catch (error) {
      console.error("خطأ في إضافة البنر:", error);
      showToast("تعذر إضافة البنر: " + (error.message || "خطأ غير معروف"));
    } finally {
      setSavingBanner(false);
    }
  }

  async function toggleBanner(banner) {
    if (!isAdmin) return;

    try {
      await updateDoc(doc(db, "banners", banner.id), {
        active: banner.active === false,
      });
    } catch (error) {
      console.error("خطأ في تحديث البنر:", error);
      showToast("تعذر تحديث البنر.");
    }
  }

  async function deleteBanner(banner) {
    if (!isAdmin) return;

    if (!window.confirm("هل أنت متأكد من حذف هذا البنر؟")) return;

    try {
      await deleteDoc(doc(db, "banners", banner.id));
    } catch (error) {
      console.error("خطأ في حذف البنر:", error);
      showToast("تعذر حذف البنر.");
    }
  }

  // تحريك البنر للأعلى أو للأسفل بتبديل ترتيبه مع المجاور
  async function moveBanner(index, direction) {
    if (!isAdmin) return;

    const target = index + direction;

    if (target < 0 || target >= sortedBanners.length) return;

    const first = sortedBanners[index];
    const second = sortedBanners[target];

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "banners", first.id), { order: second.order });
      batch.update(doc(db, "banners", second.id), { order: first.order });

      await batch.commit();
    } catch (error) {
      console.error("خطأ في ترتيب البنرات:", error);
      showToast("تعذر تغيير الترتيب.");
    }
  }

  // ===== ملخص السلة: الكوبون والشحن =====
  const cartSubtotal = round2(total);

  const couponResult = appliedCoupon
    ? evaluateCoupon(appliedCoupon, cartSubtotal)
    : null;

  const couponDiscount = couponResult?.valid ? couponResult.discount : 0;

  const shippingCities = (
    Array.isArray(site.shippingCities) ? site.shippingCities : []
  ).filter((entry) => entry && entry.name);

  const cartShipping =
    cart.length > 0
      ? computeShipping(site, cartSubtotal - couponDiscount, customerCity)
      : 0;

  const grandTotal = round2(cartSubtotal - couponDiscount + cartShipping);

  const freeOverAmount = Number(site.shippingFreeOver) || 0;

  const freeShippingGap =
    freeOverAmount > 0 && cartShipping > 0
      ? round2(freeOverAmount - (cartSubtotal - couponDiscount))
      : 0;

  // تطبيق كود الخصم (يُقرأ بالكود مباشرة ولا يمكن استعراض بقية الأكواد)
  async function applyCoupon() {
    const code = normalizeCouponCode(couponInput);

    if (!code || !COUPON_CODE_PATTERN.test(code)) {
      showToast("يرجى إدخال كود خصم صحيح.");
      return;
    }

    setCheckingCoupon(true);

    try {
      const snap = await getDoc(doc(db, "coupons", code));

      if (!snap.exists()) {
        showToast("كود الخصم غير صحيح.");
        return;
      }

      const coupon = { code, ...snap.data() };
      const result = evaluateCoupon(coupon, cartSubtotal);

      if (!result.valid) {
        showToast(result.message || "لا ينطبق هذا الكوبون على سلتك.");
        return;
      }

      setAppliedCoupon(coupon);
      setCouponInput("");
      showToast(
        `تم تطبيق الكوبون ${code}: خصم ${formatPrice(result.discount)} ر.س`,
        "success"
      );
    } catch (error) {
      console.error("خطأ في التحقق من الكوبون:", error);
      showToast("تعذر التحقق من الكوبون. حاول مرة أخرى.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  // ===== الإدارة: إعدادات الشحن =====
  async function saveShippingSettings(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("غير مصرح لك بتعديل إعدادات الشحن.");
      return;
    }

    const defaultFee = Number(shipDefaultFee);
    const freeOver = Number(shipFreeOver);

    if (!Number.isFinite(defaultFee) || defaultFee < 0) {
      showToast("يرجى إدخال رسوم شحن افتراضية صحيحة (0 أو أكثر).");
      return;
    }

    if (!Number.isFinite(freeOver) || freeOver < 0) {
      showToast("يرجى إدخال حد الشحن المجاني (0 لتعطيله).");
      return;
    }

    const seen = new Set();
    const cities = [];

    for (const row of shipCityRows) {
      const name = row.name.trim();
      const fee = Number(row.fee);

      if (!name) {
        showToast("يرجى إدخال اسم لكل مدينة أو حذف الصف الفارغ.");
        return;
      }

      if (seen.has(name)) {
        showToast(`المدينة "${name}" مكررة.`);
        return;
      }

      if (row.fee.trim() === "" || !Number.isFinite(fee) || fee < 0) {
        showToast(`يرجى إدخال رسوم صحيحة للمدينة "${name}".`);
        return;
      }

      seen.add(name);
      cities.push({ name, fee: round2(fee) });
    }

    setSavingShipping(true);

    try {
      await setDoc(
        doc(db, "settings", "site"),
        {
          shippingDefaultFee: round2(defaultFee),
          shippingFreeOver: round2(freeOver),
          shippingCities: cities,
        },
        { merge: true }
      );

      showToast("تم حفظ إعدادات الشحن.", "success");
    } catch (error) {
      console.error("خطأ في حفظ إعدادات الشحن:", error);
      showToast("تعذر حفظ إعدادات الشحن: " + (error.message || ""));
    } finally {
      setSavingShipping(false);
    }
  }

  // ===== الإدارة: أكواد الخصم =====
  function clearCouponForm() {
    setCouponCodeInput("");
    setCouponType("percent");
    setCouponValue("");
    setCouponMinOrder("");
    setCouponMaxDiscount("");
    setCouponExpiresOn("");
    setCouponUsageLimit("");
    setCouponActive(true);
    setEditingCouponCode(null);
  }

  function editCoupon(coupon) {
    setEditingCouponCode(coupon.code);
    setCouponCodeInput(coupon.code);
    setCouponType(coupon.type === "fixed" ? "fixed" : "percent");
    setCouponValue(String(coupon.value ?? ""));
    setCouponMinOrder(coupon.minOrder ? String(coupon.minOrder) : "");
    setCouponMaxDiscount(coupon.maxDiscount ? String(coupon.maxDiscount) : "");
    setCouponExpiresOn(coupon.expiresOn || "");
    setCouponUsageLimit(coupon.usageLimit ? String(coupon.usageLimit) : "");
    setCouponActive(coupon.active !== false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCoupon(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("غير مصرح لك بإدارة أكواد الخصم.");
      return;
    }

    const code = normalizeCouponCode(couponCodeInput);

    if (!COUPON_CODE_PATTERN.test(code)) {
      showToast("الكود من 3 إلى 20 حرفًا أو رقمًا بدون مسافات (مثل RIYADH10).");
      return;
    }

    if (
      editingCouponCode === null &&
      couponsList.some((coupon) => coupon.code === code)
    ) {
      showToast("هذا الكود موجود مسبقًا. عدّله من القائمة.");
      return;
    }

    const value = Number(couponValue);

    if (!Number.isFinite(value) || value <= 0) {
      showToast("يرجى إدخال قيمة الخصم.");
      return;
    }

    if (couponType === "percent" && value > 100) {
      showToast("نسبة الخصم لا تتجاوز 100٪.");
      return;
    }

    const optionalNumber = (text) => (text.trim() === "" ? 0 : Number(text));
    const minOrder = optionalNumber(couponMinOrder);
    const maxDiscount = optionalNumber(couponMaxDiscount);
    const usageLimit = optionalNumber(couponUsageLimit);

    if (!Number.isFinite(minOrder) || minOrder < 0) {
      showToast("الحد الأدنى للطلب غير صحيح.");
      return;
    }

    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
      showToast("الحد الأقصى للخصم غير صحيح.");
      return;
    }

    if (!Number.isInteger(usageLimit) || usageLimit < 0) {
      showToast("عدد مرات الاستخدام يجب أن يكون رقمًا صحيحًا.");
      return;
    }

    if (couponExpiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(couponExpiresOn)) {
      showToast("تاريخ الانتهاء غير صحيح.");
      return;
    }

    setSavingCoupon(true);

    try {
      await setDoc(
        doc(db, "coupons", code),
        {
          type: couponType,
          value: round2(value),
          minOrder: round2(minOrder),
          maxDiscount: couponType === "percent" ? round2(maxDiscount) : 0,
          expiresOn: couponExpiresOn || "",
          usageLimit,
          active: couponActive,
          ...(editingCouponCode === null ? { usedCount: 0 } : {}),
        },
        { merge: true }
      );

      showToast(
        editingCouponCode === null
          ? `تمت إضافة الكوبون ${code}.`
          : `تم تحديث الكوبون ${code}.`,
        "success"
      );

      clearCouponForm();
    } catch (error) {
      console.error("خطأ في حفظ الكوبون:", error);
      showToast("تعذر حفظ الكوبون: " + (error.message || ""));
    } finally {
      setSavingCoupon(false);
    }
  }

  async function toggleCoupon(coupon) {
    if (!isAdmin) return;

    try {
      await updateDoc(doc(db, "coupons", coupon.code), {
        active: coupon.active === false,
      });
    } catch (error) {
      console.error("خطأ في تحديث الكوبون:", error);
      showToast("تعذر تحديث الكوبون.");
    }
  }

  async function deleteCoupon(coupon) {
    if (!isAdmin) return;

    if (!window.confirm(`هل أنت متأكد من حذف الكوبون ${coupon.code}؟`)) return;

    try {
      await deleteDoc(doc(db, "coupons", coupon.code));

      if (editingCouponCode === coupon.code) clearCouponForm();
    } catch (error) {
      console.error("خطأ في حذف الكوبون:", error);
      showToast("تعذر حذف الكوبون.");
    }
  }

  // فحص الطلب الجديد: هل الأسعار والإجمالي تطابق بيانات المتجر الحالية؟
  function getOrderIssues(order) {
    if (order.status !== "جديد") return [];

    const issues = [];
    const items = order.items || [];

    const itemsSubtotal = round2(
      items.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity),
        0
      )
    );

    const hasBreakdown = order.subtotal !== undefined;
    const orderDiscount = hasBreakdown ? Number(order.discount) || 0 : 0;
    const orderShipping = hasBreakdown ? Number(order.shippingFee) || 0 : 0;
    const expectedTotal = round2(itemsSubtotal - orderDiscount + orderShipping);

    if (Math.abs(expectedTotal - Number(order.total)) > 0.01) {
      issues.push(
        `الإجمالي المسجّل (${formatPrice(order.total)}) لا يطابق المحسوب من الأصناف والخصم والشحن (${formatPrice(expectedTotal)})`
      );
    }

    if (hasBreakdown) {
      if (order.couponCode) {
        const coupon = couponsList.find((entry) => entry.code === order.couponCode);

        if (!coupon) {
          issues.push(`الكوبون "${order.couponCode}" غير موجود في النظام`);
        } else {
          const expected = evaluateCoupon(
            { ...coupon, active: true, expiresOn: "", usageLimit: 0 },
            itemsSubtotal
          );

          if (Math.abs(expected.discount - orderDiscount) > 0.01) {
            issues.push(
              `خصم الكوبون المسجّل (${formatPrice(orderDiscount)}) يختلف عن المحسوب (${formatPrice(expected.discount)})`
            );
          }
        }
      } else if (orderDiscount > 0) {
        issues.push("يوجد خصم في الطلب بدون كود كوبون");
      }

      const expectedShipping = computeShipping(
        site,
        itemsSubtotal - orderDiscount,
        order.city
      );

      if (Math.abs(expectedShipping - orderShipping) > 0.01) {
        issues.push(
          `رسوم الشحن المسجّلة (${formatPrice(orderShipping)}) تختلف عن الرسوم الحالية (${formatPrice(expectedShipping)})`
        );
      }
    }

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      const sizeLabel = item.size || "";

      if (!product) {
        issues.push(`المنتج "${item.name}" لم يعد موجودًا`);
        continue;
      }

      if (productHasSizes(product) && !getSizeOption(product, sizeLabel)) {
        issues.push(`حجم "${item.name}" لم يعد موجودًا`);
        continue;
      }

      const currentPrice = getUnitPrice(product, sizeLabel);

      if (Math.abs(currentPrice - Number(item.price)) > 0.001) {
        issues.push(
          `سعر "${item.name}" في الطلب (${formatPrice(item.price)}) يختلف عن السعر الحالي (${formatPrice(currentPrice)})`
        );
      }
    }

    return issues;
  }

  // إصدار فاتورة برقم تسلسلي (مرة واحدة لكل طلب) ثم عرضها للطباعة
  async function openInvoice(order) {
    if (!isAdmin) {
      showToast("غير مصرح لك بإدارة الفواتير.");
      return;
    }

    if (order.invoiceNumber) {
      setInvoiceOrderId(order.id);
      return;
    }

    setIssuingInvoiceId(order.id);

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", order.id);
        const counterRef = doc(db, "settings", "counters");

        const orderSnap = await transaction.get(orderRef);

        if (!orderSnap.exists()) {
          throw new Error("الطلب غير موجود.");
        }

        // أُصدرت فاتورته من جهاز آخر في الأثناء
        if (orderSnap.data().invoiceNumber) return;

        const counterSnap = await transaction.get(counterRef);
        const next =
          (counterSnap.exists() ? Number(counterSnap.data().invoice) || 0 : 0) + 1;

        transaction.set(counterRef, { invoice: next }, { merge: true });

        transaction.update(orderRef, {
          invoiceNumber: `INV-${String(next).padStart(5, "0")}`,
          invoiceSeq: next,
          invoiceDate: serverTimestamp(),
        });
      });

      setInvoiceOrderId(order.id);
    } catch (error) {
      console.error("خطأ في إصدار الفاتورة:", error);
      showToast("تعذر إصدار الفاتورة: " + (error.message || "خطأ غير معروف"));
    } finally {
      setIssuingInvoiceId(null);
    }
  }

  const invoiceOrder = orders.find((order) => order.id === invoiceOrderId) || null;

  const issuedInvoices = orders
    .filter((order) => order.invoiceNumber)
    .sort((a, b) => Number(b.invoiceSeq || 0) - Number(a.invoiceSeq || 0));

  const invoiceQuery = invoiceSearch.trim().toLowerCase();

  const filteredInvoices = invoiceQuery
    ? issuedInvoices.filter((order) =>
        [
          order.invoiceNumber,
          order.orderNumber,
          order.customerName,
          order.customerPhone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(invoiceQuery)
      )
    : issuedInvoices;

  const ordersWithoutInvoice = orders.filter(
    (order) => !order.invoiceNumber && order.status !== "ملغي"
  );

  const isReportsTab = isAdminRoute && isAdmin && adminTab === "reports";

  const report = isReportsTab
    ? buildSalesReport(orders, reportMonth, reportMode)
    : null;

  const overview = isReportsTab
    ? computeOverview(orders, reportMode)
    : null;

  const modeLabel =
    SALE_MODES.find(([key]) => key === reportMode)?.[1] || "";

  // منتجات وأحجام مخزونها 3 قطع أو أقل
  const lowStockItems = isReportsTab
    ? products.flatMap((product) => {
        if (productHasSizes(product)) {
          return product.sizes
            .filter((size) => Number(size.stock) <= 3)
            .map((size) => ({
              label: `${product.name} (${size.label})`,
              stock: Number(size.stock),
            }));
        }

        return Number(product.stock ?? 10) <= 3
          ? [{ label: product.name, stock: Number(product.stock ?? 10) }]
          : [];
      })
    : [];

  const newOrdersCount = orders.filter(
    (order) => order.status === "جديد"
  ).length;

  const visibleOrders =
    ordersFilter === "الكل"
      ? orders
      : orders.filter((order) => order.status === ordersFilter);

  const storeHref =
    window.location.pathname.replace(/\/+$/, "") === "/admin" ? "/" : "#";

  const toastLayer = (
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "20px",
          left: 0,
          right: 0,
          zIndex: 2000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          padding: "0 16px",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            onClick={() =>
              setToasts((current) =>
                current.filter((item) => item.id !== toast.id)
              )
            }
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              maxWidth: "460px",
              padding: "12px 18px",
              background: "#1b1a15",
              color: "#f7f2e8",
              borderRight: `4px solid ${
                toast.kind === "success"
                  ? "#5fae7a"
                  : toast.kind === "error"
                    ? "#d9684b"
                    : "#c9a45c"
              }`,
              border: "1px solid #494131",
              borderRightWidth: "4px",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.5)",
              fontSize: "15px",
              lineHeight: 1.6,
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
  );

  const adminLoginSection = (
        <section className="admin-panel">
          <h2>تسجيل دخول المدير</h2>

          {authLoading ? (
            <p>جارٍ التحقق من تسجيل الدخول...</p>
          ) : (
            <form onSubmit={handleAdminLogin}>
              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  required
                  autoComplete="username"
                  style={adminInputStyle}
                  placeholder="أدخل بريد المدير"
                />
              </label>

              <label>
                كلمة المرور
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  style={adminInputStyle}
                  placeholder="أدخل كلمة المرور"
                />
              </label>

              <button type="submit" className="admin-button">
                تسجيل الدخول
              </button>
            </form>
          )}
        </section>
  );

  const adminSection = (
          <section
            style={{
              padding: "35px 7%",
              background: "#1b1a15",
              borderBottom: "2px solid #c9a45c",
            }}
          >
            <div className="section-heading">
              <span className="eyebrow">ADMINISTRATION</span>
              <h2>
                إدارة <span>المنتجات</span>
              </h2>
              <p>أضف منتجات متجرك وعدّل بياناتها بسهولة.</p>

              <button
                type="button"
                className="admin-button"
                onClick={handleAdminLogout}
              >
                تسجيل الخروج
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
                margin: "0 0 25px",
              }}
            >
              {[
                ["products", "المنتجات"],
                [
                  "orders",
                  newOrdersCount > 0
                    ? `الطلبات (${newOrdersCount} جديد)`
                    : "الطلبات",
                ],
                ["shipping", "الشحن والكوبونات"],
                ["invoices", "الفواتير"],
                ["reports", "التقارير"],
                ["site", "الموقع والبنرات"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={adminTab === key ? "category active" : "category"}
                  onClick={() => setAdminTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {adminTab === "products" && (
              <>
            <form
              onSubmit={saveProduct}
              style={{
                maxWidth: "700px",
                margin: "0 auto 35px",
                display: "grid",
                gap: "14px",
              }}
            >
              <label>
                اسم العطر
                <input
                  required
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="مثال: عطر النابع الملكي"
                  style={adminInputStyle}
                />
              </label>

              {productSizes.length === 0 && (
              <label>
                السعر بالريال السعودي
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                  placeholder="مثال: 180"
                  style={adminInputStyle}
                />
              </label>
              )}

              <label>
                نسبة الخصم (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={productDiscount}
                  onChange={(event) => setProductDiscount(event.target.value)}
                  placeholder="0 يعني بدون خصم"
                  style={adminInputStyle}
                />
                <small style={{ display: "block", color: "#aaa59a", marginTop: "5px" }}>
                  اكتب 10 لخصم 10٪، أو اتركها 0 بدون عرض. يطبق الخصم على جميع الأحجام.
                </small>
              </label>

              <label>
                التصنيف
                <select
                  value={productCategory}
                  onChange={(event) => setProductCategory(event.target.value)}
                  style={adminInputStyle}
                >
                  {categories
                    .filter((category) => category !== "الكل")
                    .map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                وصف العطر
                <textarea
                  value={productDescription}
                  onChange={(event) =>
                    setProductDescription(event.target.value)
                  }
                  placeholder="اكتب وصفًا مختصرًا للعطر"
                  rows={3}
                  style={adminInputStyle}
                />
              </label>

              <div style={{ border: "1px dashed #494131", padding: "14px" }}>
                <strong style={{ color: "#e8d29b" }}>
                  الأحجام (اختياري)
                </strong>

                <p
                  style={{
                    color: "#aaa59a",
                    margin: "6px 0 12px",
                    fontSize: "14px",
                  }}
                >
                  إن أضفت أحجامًا فسيُستخدم سعر ومخزون كل حجم بدل السعر
                  والمخزون العام.
                </p>

                {productSizes.map((row, index) => (
                  <div
                    key={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.2fr 1fr 1fr auto",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <input
                      value={row.label}
                      onChange={(event) =>
                        updateSizeRow(index, "label", event.target.value)
                      }
                      placeholder="مثال: 50 مل"
                      style={{ ...adminInputStyle, marginTop: 0 }}
                    />

                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.price}
                      onChange={(event) =>
                        updateSizeRow(index, "price", event.target.value)
                      }
                      placeholder="السعر"
                      style={{ ...adminInputStyle, marginTop: 0 }}
                    />

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={row.stock}
                      onChange={(event) =>
                        updateSizeRow(index, "stock", event.target.value)
                      }
                      placeholder="المخزون"
                      style={{ ...adminInputStyle, marginTop: 0 }}
                    />

                    <button
                      type="button"
                      className="add-button"
                      onClick={() => removeSizeRow(index)}
                    >
                      حذف
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="add-button"
                  onClick={addSizeRow}
                >
                  ＋ إضافة حجم
                </button>
              </div>

              <label>
                صورة المنتج
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      setProductImageFile(file);
                      setProductImagePreview(URL.createObjectURL(file));
                    }
                  }}
                  style={adminInputStyle}
                />
              </label>

              {productImagePreview && (
                <div style={{ textAlign: "center" }}>
                  <p style={{ marginBottom: "10px", color: "#FFD700" }}>
                    معاينة صورة المنتج
                  </p>

                  <img
                    src={productImagePreview}
                    alt="معاينة المنتج"
                    style={{
                      width: "160px",
                      height: "160px",
                      objectFit: "contain",
                      border: "1px solid #494131",
                      borderRadius: "8px",
                    }}
                  />
                </div>
              )}

              {productSizes.length === 0 && (
              <label>
                الكمية المتوفرة في المخزون
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={productStock}
                  onChange={(event) => setProductStock(event.target.value)}
                  style={adminInputStyle}
                />
              </label>
              )}

              <button
                type="submit"
                className="checkout-button"
                disabled={savingProduct}
              >
                {savingProduct
                  ? "جارٍ الحفظ..."
                  : editingId !== null
                    ? "حفظ التعديلات"
                    : "＋ إضافة المنتج"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  className="add-button"
                  onClick={clearProductForm}
                >
                  إلغاء التعديل
                </button>
              )}
            </form>

            <h3
              style={{
                color: "#e8d29b",
                textAlign: "center",
              }}
            >
              المنتجات الحالية ({products.length})
            </h3>

            <div
              style={{
                maxWidth: "900px",
                margin: "20px auto",
              }}
            >
              {products.map((product) => (
                <div
                  key={product.id}
                  style={{
                    padding: "16px",
                    marginBottom: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    border: "1px solid #494131",
                    background: "#10100e",
                  }}
                >
                  <div>
                    <strong style={{ color: "#e8d29b" }}>{product.name}</strong>

                    <p style={{ color: "#c9a45c", margin: "5px 0" }}>
                      السعر الأساسي: {formatPrice(product.price)} ر.س
                      {Number(product.discountPercent) > 0 && (
                        <> — الخصم: {formatPrice(product.discountPercent)}٪ — السعر بعد الخصم: {formatPrice(getUnitPrice(product, ""))} ر.س</>
                      )}
                    </p>

                    <p style={{ color: "#aaa59a", margin: "5px 0" }}>
                      التصنيف: {product.category}
                    </p>

                    <p style={{ color: "#aaa59a", margin: "5px 0" }}>
                      المخزون: {product.stock ?? 10} قطعة
                    </p>

                    {productHasSizes(product) && (
                      <p style={{ color: "#aaa59a", margin: "5px 0" }}>
                        الأحجام:{" "}
                        {product.sizes
                          .map(
                            (size) =>
                              `${size.label} (${formatPrice(size.price)} ر.س / ${size.stock})`
                          )
                          .join(" • ")}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="add-button"
                      onClick={() => editProduct(product)}
                    >
                      تعديل
                    </button>

                    <button
                      type="button"
                      className="add-button"
                      onClick={() => deleteProduct(product.id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}

              {products.length === 0 && !productsLoading && (
                <p className="empty-message">
                  لا توجد منتجات في قاعدة البيانات حتى الآن.
                </p>
              )}
            </div>

              </>
            )}

            {adminTab === "orders" && (
              <>
            <h3
              style={{
                color: "#e8d29b",
                textAlign: "center",
                marginTop: "50px",
              }}
            >
              الطلبات ({orders.length})
              {newOrdersCount > 0 && (
                <span
                  style={{
                    marginRight: "10px",
                    padding: "2px 10px",
                    background: "#c9a45c",
                    color: "#10100e",
                    borderRadius: "12px",
                    fontSize: "14px",
                  }}
                >
                  {newOrdersCount} جديد
                </span>
              )}
            </h3>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
                margin: "15px 0",
              }}
            >
              {["الكل", ...ORDER_STATUSES].map((status) => (
                <button
                  type="button"
                  key={status}
                  className={
                    ordersFilter === status ? "category active" : "category"
                  }
                  onClick={() => setOrdersFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>

            <div
              style={{
                maxWidth: "900px",
                margin: "20px auto",
              }}
            >
              {visibleOrders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    padding: "16px",
                    marginBottom: "12px",
                    border:
                      order.status === "جديد"
                        ? "1px solid #c9a45c"
                        : "1px solid #494131",
                    background: "#10100e",
                    color: "#f7f2e8",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <strong style={{ color: "#e8d29b" }}>
                      {order.orderNumber}
                    </strong>

                    <span style={{ color: "#aaa59a", fontSize: "14px" }}>
                      {order.createdAt?.toDate
                        ? order.createdAt
                            .toDate()
                            .toLocaleString("ar-SA")
                        : "الآن"}
                    </span>
                  </div>

                  <p style={{ margin: "8px 0 4px" }}>
                    {order.customerName} —{" "}
                    <a
                      href={`https://wa.me/${order.customerPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#c9a45c" }}
                    >
                      {order.customerPhone}
                    </a>
                  </p>

                  <p style={{ margin: "4px 0", color: "#aaa59a" }}>
                    العنوان: {order.customerAddress}
                  </p>

                  <p style={{ margin: "4px 0", color: "#aaa59a" }}>
                    الدفع: {order.paymentMethod}
                  </p>

                  {getOrderIssues(order).length > 0 && (
                    <div
                      style={{
                        margin: "10px 0",
                        padding: "10px 12px",
                        border: "1px solid #b3541e",
                        background: "#2a1a12",
                        color: "#ffb48a",
                        fontSize: "14px",
                      }}
                    >
                      <strong>⚠ تحقق من هذا الطلب قبل تجهيزه:</strong>
                      <ul style={{ margin: "6px 0 0", paddingRight: "20px" }}>
                        {getOrderIssues(order).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <ul style={{ margin: "10px 0", paddingRight: "20px" }}>
                    {(order.items || []).map((item, index) => (
                      <li key={`${item.productId}-${index}`}>
                        {item.name}
                        {item.size ? ` (${item.size})` : ""} × {item.quantity} ={" "}
                        {formatPrice(item.price * item.quantity)} ر.س
                      </li>
                    ))}
                  </ul>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div>
                      {order.subtotal !== undefined && (
                        <div
                          style={{
                            color: "#aaa59a",
                            fontSize: "13px",
                            lineHeight: 1.8,
                            marginBottom: "4px",
                          }}
                        >
                          <div>المجموع: {formatPrice(order.subtotal)} ر.س</div>

                          {Number(order.discount) > 0 && (
                            <div style={{ color: "#7fd39a" }}>
                              خصم الكوبون ({order.couponCode}): -
                              {formatPrice(order.discount)} ر.س
                            </div>
                          )}

                          <div>
                            الشحن{order.city ? ` إلى ${order.city}` : ""}:{" "}
                            {Number(order.shippingFee) > 0
                              ? `${formatPrice(order.shippingFee)} ر.س`
                              : "مجاني"}
                          </div>
                        </div>
                      )}

                      <strong style={{ color: "#e8d29b" }}>
                        الإجمالي: {formatPrice(order.total)} ر.س
                      </strong>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <select
                        value={order.status}
                        onChange={(event) =>
                          changeOrderStatus(order, event.target.value)
                        }
                        style={{ ...adminInputStyle, marginTop: 0, width: "auto" }}
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="add-button"
                        disabled={issuingInvoiceId === order.id}
                        onClick={() => openInvoice(order)}
                      >
                        {issuingInvoiceId === order.id
                          ? "جارٍ الإصدار..."
                          : order.invoiceNumber
                            ? `🧾 ${order.invoiceNumber}`
                            : "🧾 إصدار فاتورة"}
                      </button>

                      <button
                        type="button"
                        className="add-button"
                        onClick={() => deleteOrder(order)}
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <small style={{ color: "#aaa59a" }}>
                    {order.stockDeducted
                      ? "✓ تم خصم المخزون"
                      : "لم يُخصم المخزون بعد"}
                  </small>
                </div>
              ))}

              {visibleOrders.length === 0 && (
                <p className="empty-message">لا توجد طلبات.</p>
              )}
            </div>
              </>
            )}

            {adminTab === "shipping" && (
              <div style={{ maxWidth: "760px", margin: "0 auto", color: "#f7f2e8" }}>
                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>رسوم الشحن</h3>

                <form
                  onSubmit={saveShippingSettings}
                  style={{ display: "grid", gap: "14px", marginBottom: "50px" }}
                >
                  <label>
                    رسوم الشحن الافتراضية (ر.س) — اكتب 0 للشحن المجاني
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={shipDefaultFee}
                      onChange={(event) => setShipDefaultFee(event.target.value)}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    شحن مجاني للطلبات التي تبلغ (ر.س) أو أكثر — اكتب 0 لتعطيله
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={shipFreeOver}
                      onChange={(event) => setShipFreeOver(event.target.value)}
                      style={adminInputStyle}
                    />
                  </label>

                  <div style={{ border: "1px dashed #494131", padding: "14px" }}>
                    <strong style={{ color: "#e8d29b" }}>
                      الأسعار حسب المدينة (اختياري)
                    </strong>

                    <p style={{ color: "#aaa59a", margin: "6px 0 12px", fontSize: "14px" }}>
                      إن أضفت مدنًا فسيختار العميل مدينته من القائمة وتُطبَّق رسومها.
                      وإن تركتها فارغة تُطبَّق الرسوم الافتراضية على الجميع.
                    </p>

                    {shipCityRows.map((row, index) => (
                      <div
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 1fr auto",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        <input
                          value={row.name}
                          onChange={(event) =>
                            setShipCityRows((current) =>
                              current.map((entry, rowIndex) =>
                                rowIndex === index
                                  ? { ...entry, name: event.target.value }
                                  : entry
                              )
                            )
                          }
                          placeholder="اسم المدينة"
                          style={{ ...adminInputStyle, marginTop: 0 }}
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.fee}
                          onChange={(event) =>
                            setShipCityRows((current) =>
                              current.map((entry, rowIndex) =>
                                rowIndex === index
                                  ? { ...entry, fee: event.target.value }
                                  : entry
                              )
                            )
                          }
                          placeholder="الرسوم"
                          style={{ ...adminInputStyle, marginTop: 0 }}
                        />

                        <button
                          type="button"
                          className="add-button"
                          onClick={() =>
                            setShipCityRows((current) =>
                              current.filter((entry, rowIndex) => rowIndex !== index)
                            )
                          }
                        >
                          حذف
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="add-button"
                      onClick={() =>
                        setShipCityRows((current) => [
                          ...current,
                          { name: "", fee: "0" },
                        ])
                      }
                    >
                      ＋ إضافة مدينة
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="checkout-button"
                    disabled={savingShipping}
                  >
                    {savingShipping ? "جارٍ الحفظ..." : "حفظ إعدادات الشحن"}
                  </button>
                </form>

                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>
                  أكواد الخصم ({couponsList.length})
                </h3>

                <form
                  onSubmit={saveCoupon}
                  style={{ display: "grid", gap: "14px", marginBottom: "30px" }}
                >
                  <label>
                    الكود (أحرف أو أرقام بدون مسافات)
                    <input
                      value={couponCodeInput}
                      onChange={(event) =>
                        setCouponCodeInput(event.target.value.toUpperCase())
                      }
                      disabled={editingCouponCode !== null}
                      maxLength={20}
                      placeholder="مثال: WELCOME10"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <label>
                      نوع الخصم
                      <select
                        value={couponType}
                        onChange={(event) => setCouponType(event.target.value)}
                        style={adminInputStyle}
                      >
                        <option value="percent">نسبة مئوية (%)</option>
                        <option value="fixed">مبلغ ثابت (ر.س)</option>
                      </select>
                    </label>

                    <label>
                      {couponType === "percent" ? "نسبة الخصم (%)" : "قيمة الخصم (ر.س)"}
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={couponValue}
                        onChange={(event) => setCouponValue(event.target.value)}
                        style={adminInputStyle}
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <label>
                      الحد الأدنى للطلب (اختياري)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={couponMinOrder}
                        onChange={(event) => setCouponMinOrder(event.target.value)}
                        placeholder="بدون حد أدنى"
                        style={adminInputStyle}
                      />
                    </label>

                    {couponType === "percent" && (
                      <label>
                        أقصى مبلغ خصم (اختياري)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={couponMaxDiscount}
                          onChange={(event) =>
                            setCouponMaxDiscount(event.target.value)
                          }
                          placeholder="بدون حد أقصى"
                          style={adminInputStyle}
                        />
                      </label>
                    )}

                    <label>
                      تاريخ الانتهاء (اختياري)
                      <input
                        type="date"
                        value={couponExpiresOn}
                        onChange={(event) => setCouponExpiresOn(event.target.value)}
                        dir="ltr"
                        style={adminInputStyle}
                      />
                    </label>

                    <label>
                      عدد مرات الاستخدام (اختياري)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={couponUsageLimit}
                        onChange={(event) => setCouponUsageLimit(event.target.value)}
                        placeholder="غير محدود"
                        style={adminInputStyle}
                      />
                    </label>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={couponActive}
                      onChange={(event) => setCouponActive(event.target.checked)}
                    />
                    الكوبون مفعّل
                  </label>

                  <button
                    type="submit"
                    className="checkout-button"
                    disabled={savingCoupon}
                  >
                    {savingCoupon
                      ? "جارٍ الحفظ..."
                      : editingCouponCode !== null
                        ? "حفظ التعديلات"
                        : "＋ إضافة الكوبون"}
                  </button>

                  {editingCouponCode !== null && (
                    <button
                      type="button"
                      className="add-button"
                      onClick={clearCouponForm}
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </form>

                <p style={{ color: "#aaa59a", fontSize: "13px", margin: "0 0 14px" }}>
                  يُحتسب عدد الاستخدام عند نقل الطلب إلى "قيد التجهيز" أو ما بعده،
                  ويُعاد عند الإلغاء أو الرجوع إلى "جديد".
                </p>

                {couponsList.map((coupon) => {
                  const expired =
                    coupon.expiresOn &&
                    new Date(`${coupon.expiresOn}T23:59:59`) < new Date();
                  const limit = Number(coupon.usageLimit) || 0;
                  const used = Number(coupon.usedCount) || 0;
                  const exhausted = limit > 0 && used >= limit;
                  const status =
                    coupon.active === false
                      ? "متوقف"
                      : expired
                        ? "منتهي"
                        : exhausted
                          ? "مستنفد"
                          : "فعّال";

                  return (
                    <div
                      key={coupon.code}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                        padding: "14px 16px",
                        marginBottom: "10px",
                        border: "1px solid #494131",
                        background: "#10100e",
                        opacity: status === "فعّال" ? 1 : 0.6,
                      }}
                    >
                      <div>
                        <strong dir="ltr" style={{ color: "#e8d29b" }}>
                          {coupon.code}
                        </strong>{" "}
                        <span
                          style={{
                            marginRight: "8px",
                            padding: "2px 8px",
                            fontSize: "12px",
                            background: status === "فعّال" ? "#2f5d3f" : "#5d2f2f",
                          }}
                        >
                          {status}
                        </span>

                        <div style={{ color: "#f7f2e8", margin: "4px 0" }}>
                          {coupon.type === "fixed"
                            ? `خصم ${formatPrice(coupon.value)} ر.س`
                            : `خصم ${formatPrice(coupon.value)}٪${
                                Number(coupon.maxDiscount) > 0
                                  ? ` (حتى ${formatPrice(coupon.maxDiscount)} ر.س)`
                                  : ""
                              }`}
                        </div>

                        <div style={{ color: "#aaa59a", fontSize: "13px" }}>
                          {Number(coupon.minOrder) > 0
                            ? `الحد الأدنى ${formatPrice(coupon.minOrder)} ر.س • `
                            : ""}
                          {coupon.expiresOn ? `ينتهي ${coupon.expiresOn} • ` : ""}
                          الاستخدام: {used}
                          {limit > 0 ? ` / ${limit}` : " (غير محدود)"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="add-button"
                          onClick={() => editCoupon(coupon)}
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          className="add-button"
                          onClick={() => toggleCoupon(coupon)}
                        >
                          {coupon.active === false ? "تفعيل" : "إيقاف"}
                        </button>

                        <button
                          type="button"
                          className="add-button"
                          onClick={() => deleteCoupon(coupon)}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}

                {couponsList.length === 0 && (
                  <p className="empty-message">لا توجد أكواد خصم بعد.</p>
                )}
              </div>
            )}

            {adminTab === "invoices" && (
              <div style={{ maxWidth: "900px", margin: "0 auto", color: "#f7f2e8" }}>
                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>
                  الفواتير ({issuedInvoices.length})
                </h3>

                <input
                  type="search"
                  value={invoiceSearch}
                  onChange={(event) => setInvoiceSearch(event.target.value)}
                  placeholder="ابحث برقم الفاتورة أو الطلب أو اسم العميل أو الجوال"
                  style={adminInputStyle}
                />

                <p style={{ color: "#aaa59a", fontSize: "14px", margin: "10px 0 18px" }}>
                  {filteredInvoices.length} فاتورة • إجمالي قيمتها{" "}
                  {formatMoney(
                    filteredInvoices.reduce(
                      (sum, order) => sum + (Number(order.total) || 0),
                      0
                    )
                  )}{" "}
                  ر.س
                </p>

                {filteredInvoices.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                      padding: "14px 16px",
                      marginBottom: "10px",
                      border: "1px solid #494131",
                      background: "#10100e",
                    }}
                  >
                    <div>
                      <strong dir="ltr" style={{ color: "#e8d29b" }}>
                        {order.invoiceNumber}
                      </strong>
                      <div style={{ margin: "4px 0", color: "#f7f2e8" }}>
                        {order.customerName}
                      </div>
                      <div style={{ color: "#aaa59a", fontSize: "13px" }}>
                        {formatLongDate(toDateSafe(order.invoiceDate))} • طلب{" "}
                        <span dir="ltr">{order.orderNumber}</span> • {order.status}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <strong style={{ color: "#e8d29b" }}>
                        {formatMoney(order.total)} ر.س
                      </strong>

                      <button
                        type="button"
                        className="add-button"
                        onClick={() => setInvoiceOrderId(order.id)}
                      >
                        🖨️ عرض وطباعة
                      </button>
                    </div>
                  </div>
                ))}

                {filteredInvoices.length === 0 && (
                  <p className="empty-message">
                    {issuedInvoices.length === 0
                      ? "لم تُصدر أي فاتورة بعد. أصدر الفاتورة من الطلبات الموجودة أدناه."
                      : "لا توجد فواتير تطابق بحثك."}
                  </p>
                )}

                <h3 style={{ color: "#e8d29b", textAlign: "center", marginTop: "40px" }}>
                  طلبات بلا فاتورة ({ordersWithoutInvoice.length})
                </h3>

                {ordersWithoutInvoice.slice(0, 20).map((order) => (
                  <div
                    key={order.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                      padding: "12px 16px",
                      marginBottom: "8px",
                      border: "1px solid #494131",
                      background: "#10100e",
                    }}
                  >
                    <div>
                      <strong dir="ltr" style={{ color: "#e8d29b" }}>
                        {order.orderNumber}
                      </strong>
                      <span style={{ margin: "0 10px" }}>{order.customerName}</span>
                      <span style={{ color: "#aaa59a", fontSize: "13px" }}>
                        {order.status} • {formatMoney(order.total)} ر.س
                      </span>
                    </div>

                    <button
                      type="button"
                      className="add-button"
                      disabled={issuingInvoiceId === order.id}
                      onClick={() => openInvoice(order)}
                    >
                      {issuingInvoiceId === order.id ? "جارٍ الإصدار..." : "🧾 إصدار فاتورة"}
                    </button>
                  </div>
                ))}

                {ordersWithoutInvoice.length === 0 && (
                  <p className="empty-message">كل الطلبات لها فواتير.</p>
                )}
              </div>
            )}

            {adminTab === "reports" && report && overview && (
              <div style={{ maxWidth: "1000px", margin: "0 auto", color: "#f7f2e8" }}>
                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>نظرة عامة</h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <StatCard
                    label="مبيعات اليوم"
                    value={`${formatMoney(overview.today)} ر.س`}
                    sub={`${overview.todayCount} طلب`}
                  />
                  <StatCard
                    label="مبيعات هذا الشهر"
                    value={`${formatMoney(overview.month)} ر.س`}
                    sub={`${overview.monthCount} طلب`}
                  />
                  <StatCard
                    label="طلبات جديدة بانتظارك"
                    value={newOrdersCount}
                    sub="لم تُعالج بعد"
                    tone={newOrdersCount > 0 ? "#ffb48a" : undefined}
                  />
                  <StatCard
                    label="مخزون منخفض"
                    value={lowStockItems.length}
                    sub="3 قطع أو أقل"
                    tone={lowStockItems.length > 0 ? "#ffb48a" : undefined}
                  />
                </div>

                <h3 style={{ color: "#e8d29b", textAlign: "center", marginTop: "40px" }}>
                  تقرير المبيعات الشهري
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                    alignItems: "end",
                  }}
                >
                  <label>
                    الشهر
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(event) =>
                        setReportMonth(event.target.value || currentMonthKey())
                      }
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    أساس احتساب المبيعات
                    <select
                      value={reportMode}
                      onChange={(event) => setReportMode(event.target.value)}
                      style={adminInputStyle}
                    >
                      {SALE_MODES.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="add-button"
                      onClick={() => setReportPrintOpen(true)}
                    >
                      🖨️ طباعة التقرير
                    </button>

                    <button
                      type="button"
                      className="add-button"
                      disabled={report.monthOrders.length === 0}
                      onClick={() =>
                        exportOrdersCsv(report.monthOrders, report.monthKey)
                      }
                    >
                      ⬇ تصدير الطلبات (Excel)
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "12px",
                    marginTop: "20px",
                  }}
                >
                  <StatCard
                    label={`إجمالي مبيعات ${monthLabel(report.monthKey)}`}
                    value={`${formatMoney(report.total)} ر.س`}
                  />
                  <StatCard label="عدد الطلبات" value={report.count} />
                  <StatCard
                    label="متوسط قيمة الطلب"
                    value={`${formatMoney(report.average)} ر.س`}
                  />
                  <StatCard label="القطع المباعة" value={report.itemsSold} />
                  <StatCard
                    label="خصومات الكوبونات"
                    value={`${formatMoney(report.discountsTotal)} ر.س`}
                  />
                  <StatCard
                    label="رسوم الشحن المحصّلة"
                    value={`${formatMoney(report.shippingTotal)} ر.س`}
                  />
                  <StatCard
                    label="مقارنة بالشهر السابق"
                    value={
                      report.change === null
                        ? "—"
                        : `${report.change >= 0 ? "▲ +" : "▼ "}${report.change.toFixed(1)}٪`
                    }
                    sub={`الشهر السابق: ${formatMoney(report.prevTotal)} ر.س`}
                    tone={
                      report.change === null
                        ? undefined
                        : report.change >= 0
                          ? "#7fd39a"
                          : "#ff9b80"
                    }
                  />
                </div>

                <ReportPanel title="المبيعات اليومية (ر.س)">
                  <SimpleBars
                    values={report.daily.map((day) => day.total)}
                    labels={report.daily.map((day) => String(day.day))}
                  />
                </ReportPanel>

                <ReportPanel title={`المبيعات الشهرية خلال ${report.year} (ر.س)`}>
                  <SimpleBars
                    values={report.yearTotals}
                    labels={ARABIC_MONTHS.map((name) => name.slice(0, 4))}
                    height={110}
                  />
                </ReportPanel>

                <ReportPanel title="أكثر المنتجات مبيعًا">
                  {report.products.length === 0 ? (
                    <p style={{ color: "#aaa59a", margin: 0 }}>
                      لا توجد مبيعات في هذا الشهر.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "#aaa59a", fontSize: "13px" }}>
                            <th style={{ textAlign: "right", padding: "6px" }}>المنتج</th>
                            <th style={{ textAlign: "right", padding: "6px" }}>الكمية</th>
                            <th style={{ textAlign: "right", padding: "6px" }}>الإيراد</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.products.slice(0, 10).map((product) => (
                            <tr key={product.label} style={{ borderTop: "1px solid #2b281f" }}>
                              <td style={{ padding: "8px 6px" }}>{product.label}</td>
                              <td style={{ padding: "8px 6px" }}>{product.quantity}</td>
                              <td style={{ padding: "8px 6px", color: "#e8d29b" }}>
                                {formatMoney(product.revenue)} ر.س
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ReportPanel>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "0 20px",
                  }}
                >
                  <ReportPanel title="طرق الدفع">
                    {report.payments.length === 0 ? (
                      <p style={{ color: "#aaa59a", margin: 0 }}>لا توجد بيانات.</p>
                    ) : (
                      report.payments.map((payment) => (
                        <div
                          key={payment.method}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "6px 0",
                            borderTop: "1px solid #2b281f",
                          }}
                        >
                          <span>
                            {payment.method} ({payment.count})
                          </span>
                          <strong style={{ color: "#e8d29b" }}>
                            {formatMoney(payment.total)} ر.س
                          </strong>
                        </div>
                      ))
                    )}
                  </ReportPanel>

                  <ReportPanel title="حالات طلبات الشهر">
                    {report.statuses.length === 0 ? (
                      <p style={{ color: "#aaa59a", margin: 0 }}>لا توجد طلبات.</p>
                    ) : (
                      report.statuses.map((entry) => (
                        <div
                          key={entry.status}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "6px 0",
                            borderTop: "1px solid #2b281f",
                          }}
                        >
                          <span>{entry.status}</span>
                          <strong style={{ color: "#e8d29b" }}>{entry.count}</strong>
                        </div>
                      ))
                    )}
                  </ReportPanel>
                </div>

                <ReportPanel title={`تنبيهات المخزون (${lowStockItems.length})`}>
                  {lowStockItems.length === 0 ? (
                    <p style={{ color: "#aaa59a", margin: 0 }}>
                      لا توجد منتجات منخفضة المخزون.
                    </p>
                  ) : (
                    lowStockItems.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          borderTop: "1px solid #2b281f",
                        }}
                      >
                        <span>{item.label}</span>
                        <strong style={{ color: item.stock <= 0 ? "#ff9b80" : "#ffb48a" }}>
                          {item.stock <= 0 ? "نفد" : `${item.stock} قطعة`}
                        </strong>
                      </div>
                    ))
                  )}
                </ReportPanel>
              </div>
            )}

            {adminTab === "site" && (
              <div style={{ maxWidth: "760px", margin: "0 auto" }}>
                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>
                  إعدادات الموقع
                </h3>

                <form
                  onSubmit={saveSiteSettings}
                  style={{ display: "grid", gap: "14px", marginBottom: "50px" }}
                >
                  <label>
                    شعار الموقع
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (file) {
                          setLogoFile(file);
                          setLogoPreview(URL.createObjectURL(file));
                        }
                      }}
                      style={adminInputStyle}
                    />
                  </label>

                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "#aaa59a", margin: "0 0 10px" }}>
                      معاينة الشعار (يُفضّل صورة شفافة PNG)
                    </p>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 20px",
                        border: "1px solid #494131",
                        background: "#10100e",
                      }}
                    >
                      <BrandMark logoUrl={logoPreview} />
                      <strong style={{ color: "#e8d29b" }}>{siteStoreName || site.storeName}</strong>
                    </div>

                    {site.logoUrl && (
                      <div style={{ marginTop: "10px" }}>
                        <button
                          type="button"
                          className="add-button"
                          onClick={removeLogo}
                        >
                          الرجوع للشعار الافتراضي
                        </button>
                      </div>
                    )}
                  </div>

                  <label>
                    اسم المتجر بالعربي
                    <input
                      value={siteStoreName}
                      onChange={(event) => setSiteStoreName(event.target.value)}
                      maxLength={40}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    اسم المتجر بالإنجليزي (يظهر تحت الاسم العربي)
                    <input
                      value={siteStoreNameEn}
                      onChange={(event) =>
                        setSiteStoreNameEn(event.target.value)
                      }
                      maxLength={60}
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    الشريط العلوي (اتركه فارغًا لإخفائه)
                    <input
                      value={siteAnnouncement}
                      onChange={(event) =>
                        setSiteAnnouncement(event.target.value)
                      }
                      maxLength={120}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    عنوان النبذة
                    <input
                      value={siteAboutTitle}
                      onChange={(event) => setSiteAboutTitle(event.target.value)}
                      maxLength={60}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    الجزء المميز من العنوان (يظهر بلون ذهبي)
                    <input
                      value={siteAboutHighlight}
                      onChange={(event) =>
                        setSiteAboutHighlight(event.target.value)
                      }
                      maxLength={60}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    نص النبذة عن الموقع
                    <textarea
                      value={siteAboutText}
                      onChange={(event) => setSiteAboutText(event.target.value)}
                      rows={6}
                      maxLength={2000}
                      style={adminInputStyle}
                    />
                  </label>

                  <h3
                    style={{
                      color: "#e8d29b",
                      textAlign: "center",
                      margin: "20px 0 0",
                    }}
                  >
                    التواصل والحسابات
                  </h3>

                  <label>
                    رقم واتساب لاستقبال الطلبات
                    <input
                      type="tel"
                      value={siteWhatsapp}
                      onChange={(event) => setSiteWhatsapp(event.target.value)}
                      placeholder="0501234567"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    رابط إنستغرام (اختياري)
                    <input
                      value={siteInstagram}
                      onChange={(event) => setSiteInstagram(event.target.value)}
                      placeholder="https://instagram.com/اسم_الحساب"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    رابط تيك توك (اختياري)
                    <input
                      value={siteTiktok}
                      onChange={(event) => setSiteTiktok(event.target.value)}
                      placeholder="https://tiktok.com/@اسم_الحساب"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    رابط سناب شات (اختياري)
                    <input
                      value={siteSnapchat}
                      onChange={(event) => setSiteSnapchat(event.target.value)}
                      placeholder="https://snapchat.com/add/اسم_الحساب"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    رابط X / تويتر (اختياري)
                    <input
                      value={siteTwitter}
                      onChange={(event) => setSiteTwitter(event.target.value)}
                      placeholder="https://x.com/اسم_الحساب"
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <button
                    type="submit"
                    className="checkout-button"
                    disabled={savingSite}
                  >
                    {savingSite ? "جارٍ الحفظ..." : "حفظ إعدادات الموقع"}
                  </button>
                </form>

                <h3 style={{ color: "#e8d29b", textAlign: "center" }}>
                  البنرات ({sortedBanners.length})
                </h3>

                <form
                  onSubmit={addBanner}
                  style={{ display: "grid", gap: "14px", marginBottom: "30px" }}
                >
                  <label>
                    صورة البنر (المقاس المفضل 1600×600)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (file) {
                          setBannerFile(file);
                          setBannerPreview(URL.createObjectURL(file));
                        }
                      }}
                      style={adminInputStyle}
                    />
                  </label>

                  {bannerPreview && (
                    <img
                      src={bannerPreview}
                      alt="معاينة البنر"
                      style={{
                        width: "100%",
                        maxHeight: "200px",
                        objectFit: "cover",
                        border: "1px solid #494131",
                      }}
                    />
                  )}

                  <label>
                    عنوان البنر (اختياري)
                    <input
                      value={bannerTitle}
                      onChange={(event) => setBannerTitle(event.target.value)}
                      maxLength={80}
                      placeholder="مثال: خصم 20% على عطور العود"
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    نص فرعي (اختياري)
                    <input
                      value={bannerSubtitle}
                      onChange={(event) => setBannerSubtitle(event.target.value)}
                      maxLength={140}
                      style={adminInputStyle}
                    />
                  </label>

                  <label>
                    رابط عند الضغط على البنر (اختياري)
                    <input
                      value={bannerLink}
                      onChange={(event) => setBannerLink(event.target.value)}
                      placeholder="#products أو https://..."
                      dir="ltr"
                      style={adminInputStyle}
                    />
                  </label>

                  <button
                    type="submit"
                    className="checkout-button"
                    disabled={savingBanner}
                  >
                    {savingBanner ? "جارٍ الرفع..." : "＋ إضافة البنر"}
                  </button>
                </form>

                {sortedBanners.map((banner, index) => (
                  <div
                    key={banner.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                      padding: "12px",
                      marginBottom: "10px",
                      border: "1px solid #494131",
                      background: "#10100e",
                      opacity: banner.active === false ? 0.55 : 1,
                    }}
                  >
                    <img
                      src={banner.image}
                      alt={banner.title || "بنر"}
                      style={{
                        width: "140px",
                        height: "56px",
                        objectFit: "cover",
                      }}
                    />

                    <div style={{ flex: 1, minWidth: "140px", color: "#f7f2e8" }}>
                      <strong>{banner.title || "بدون عنوان"}</strong>
                      <div style={{ color: "#aaa59a", fontSize: "13px" }}>
                        {banner.active === false ? "مخفي" : "ظاهر"}
                        {banner.link ? ` • ${banner.link}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="add-button"
                        disabled={index === 0}
                        onClick={() => moveBanner(index, -1)}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        className="add-button"
                        disabled={index === sortedBanners.length - 1}
                        onClick={() => moveBanner(index, 1)}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        className="add-button"
                        onClick={() => toggleBanner(banner)}
                      >
                        {banner.active === false ? "إظهار" : "إخفاء"}
                      </button>

                      <button
                        type="button"
                        className="add-button"
                        onClick={() => deleteBanner(banner)}
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}

                {sortedBanners.length === 0 && (
                  <p className="empty-message">لا توجد بنرات بعد.</p>
                )}
              </div>
            )}
          </section>
  );

  const printLayers = (
    <>
      {invoiceOrder && (
        <PrintPortal
          title={
            invoiceOrder.invoiceNumber
              ? `فاتورة ${invoiceOrder.invoiceNumber}`
              : "جارٍ إصدار الفاتورة..."
          }
          onClose={() => setInvoiceOrderId(null)}
        >
          {invoiceOrder.invoiceNumber ? (
            <InvoiceSheet order={invoiceOrder} site={site} printedAt={new Date()} />
          ) : (
            <p style={{ color: "#fff" }}>جارٍ إصدار الفاتورة...</p>
          )}
        </PrintPortal>
      )}

      {reportPrintOpen && report && (
        <PrintPortal
          title={`تقرير مبيعات ${monthLabel(report.monthKey)}`}
          onClose={() => setReportPrintOpen(false)}
        >
          <ReportSheet
            report={report}
            modeLabel={modeLabel}
            site={site}
            printedAt={new Date()}
          />
        </PrintPortal>
      )}
    </>
  );

  // ===== صفحة الإدارة (منفصلة عن المتجر) =====
  if (isAdminRoute) {
    return (
      <div className="store" dir="rtl">
        {toastLayer}

        <header className="header">
          <a className="brand" href={storeHref}>
            <BrandMark logoUrl={site.logoUrl} />
            <span>
              <strong>{site.storeName}</strong>
              <small>لوحة الإدارة</small>
            </span>
          </a>

          <a className="cart-button" href={storeHref}>
            ← العودة إلى المتجر
          </a>
        </header>

        <main>{isAdmin ? adminSection : adminLoginSection}</main>

        {printLayers}
      </div>
    );
  }

  // ===== المتجر (للعملاء) =====
  return (
    <div className="store" dir="rtl">
      {toastLayer}

      {site.announcement && (
        <div className="announcement">{site.announcement}</div>
      )}

      <header className="header">
        <a className="brand" href="#home">
          <BrandMark logoUrl={site.logoUrl} />
          <span>
            <strong>{site.storeName}</strong>
            <small>{site.storeNameEn}</small>
          </span>
        </a>

        <nav className="navigation">
          <a href="#home">الرئيسية</a>
          <a href="#products">العطور</a>
          <a href="#about">عن النابع</a>
        </nav>

        <a className="cart-button" href="#cart">
          🛍️ السلة ({cart.reduce((sum, item) => sum + item.quantity, 0)})
        </a>

      </header>

      <main>

        <BannerSlider banners={activeBanners} />

        <section className="hero" id="home">
          <div className="hero-content">
            <span className="eyebrow">عطور مختارة بعناية</span>

            <h1>
              عطرك يحكي
              <br />
              <span>حكايتك</span>
            </h1>

            <p>
              اكتشف عالمًا من الروائح الاستثنائية، حيث تلتقي الأصالة بالفخامة في
              كل قطرة.
            </p>

            <a href="#products" className="primary-button">
              اكتشف مجموعتنا <span>←</span>
            </a>

            <div className="hero-note">
              <span>✦</span> تفاصيل تصنع الفرق
              <span>✦</span> عطور تترك أثرًا
            </div>
          </div>

          <div className="hero-art" aria-label="عطر فاخر">
            <div className="art-circle"></div>

            <div className="perfume-bottle">
              <div className="bottle-cap"></div>
              <div className="bottle-neck"></div>

              <div className="bottle-body">
                <span className="bottle-logo">ن</span>
                <span className="bottle-name">النابع</span>
                <span className="bottle-subtitle">LUXURY PERFUME</span>
              </div>
            </div>

            <div className="art-label">THE ART OF PERFUMERY</div>
          </div>
        </section>

        <section className="benefits">
          <div>
            <span>✧</span>
            <p>عطور مختارة</p>
          </div>

          <div>
            <span>♧</span>
            <p>العود والبخور</p>
          </div>

          <div>
            <span>◇</span>
            <p>تجربة تسوق سهلة</p>
          </div>

          <div>
            <span>♡</span>
            <p>خدمة عبر واتساب</p>
          </div>
        </section>

        <section className="products-section" id="products">
          <div className="section-heading">
            <span className="eyebrow">اكتشف مجموعتنا</span>
            <h2>
              اختيارات <span>النابع</span>
            </h2>
            <p>روائح مميزة لكل لحظة تستحق أن تُخلّد.</p>
          </div>

          <div className="search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="ابحث عن عطرك المفضل..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="category-list">
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={
                  activeCategory === category ? "category active" : "category"
                }
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {productsLoading ? (
            <p className="empty-message">جارٍ تحميل المنتجات...</p>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product) => (
                <article
                  className="product-card"
                  key={product.id}
                  style={{ display: "flex", flexDirection: "column", height: "100%" }}
                >
                  <div className="product-image" style={{ position: "relative" }}>
                    <span className="product-tag">اختيار النابع</span>
                    {Number(product.discountPercent) > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: "12px",
                          left: "12px",
                          zIndex: 2,
                          background: "#a52a2a",
                          color: "#fff",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          fontWeight: "bold",
                          fontSize: "13px",
                        }}
                      >
                        خصم {formatPrice(product.discountPercent)}٪
                      </span>
                    )}

                    <img
                      src={product.image || "/images/nabea-royal.jpg"}
                      alt={product.name || "عطر النابع"}
                      className="product-photo"
                      style={{
                        width: "100%",
                        height: "220px",
                        objectFit: "contain",
                        display: "block",
                      }}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/images/nabea-royal.jpg";
                      }}
                    />

                    <span className="image-caption">AL NABEA</span>
                  </div>

                  <div
                    className="product-info"
                    style={{ display: "flex", flexDirection: "column", flex: 1 }}
                  >
                    <span className="product-category">{product.category}</span>

                    <h3
                      style={{
                        lineHeight: 1.45,
                        minHeight: "2.9em",
                        margin: "6px 0",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {product.name}
                    </h3>

                    <div style={{ minHeight: "58px", margin: "4px 0 14px" }}>
                      <div style={{ minHeight: "22px", fontSize: "14px", color: "#aaa59a" }}>
                        {Number(product.discountPercent) > 0 ? (
                          <del>{formatPrice(product.price)} ر.س</del>
                        ) : (
                          "\u00a0"
                        )}
                      </div>

                      <strong>
                        {productHasSizes(product) && <small>ابتداءً من </small>}
                        <span
                          style={{
                            color:
                              Number(product.discountPercent) > 0
                                ? "#e8d29b"
                                : "inherit",
                          }}
                        >
                          {formatPrice(getUnitPrice(product, ""))} <small>ر.س</small>
                        </span>
                      </strong>
                    </div>

                    <div
                      style={{
                        marginTop: "auto",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        className="add-button"
                        onClick={() => openProductDetails(product)}
                        style={{
                          background: "transparent",
                          border: "1px solid #c9a45c",
                          color: "#e8d29b",
                          width: "100%",
                        }}
                      >
                        التفاصيل
                      </button>

                      <button
                        type="button"
                        className="add-button"
                        style={{ width: "100%" }}
                        onClick={() => {
                          if (productHasSizes(product)) {
                            openProductDetails(product);
                          } else {
                            addToCart(product);
                          }
                        }}
                        disabled={Number(product.stock ?? 10) <= 0}
                      >
                        {Number(product.stock ?? 10) <= 0
                          ? "نفد المخزون"
                          : productHasSizes(product)
                            ? "اختر الحجم"
                            : "+ أضف للسلة"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!productsLoading && filteredProducts.length === 0 && (
            <p className="empty-message">لا توجد منتجات تطابق بحثك.</p>
          )}
        </section>

        <section className="cart-section" id="cart">
          <div className="section-heading">
            <span className="eyebrow">اختياراتك المميزة</span>
            <h2>
              سلة <span>المشتريات</span>
            </h2>
          </div>

          {cart.length === 0 ? (
            <p className="empty-message">
              سلتك فارغة حاليًا. اختر عطرك المفضل من مجموعتنا.
            </p>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => (
                  <div className="cart-item" key={item.key}>
                    <div>
                      <strong>
                        {item.name}
                        {item.size ? ` — ${item.size}` : ""}
                      </strong>
                      <p>{formatPrice(item.price)} ريال للقطعة</p>
                    </div>

                    <div className="quantity-controls">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.key, -1)}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        onClick={() => changeQuantity(item.key, 1)}
                      >
                        +
                      </button>
                    </div>

                    <strong>{formatPrice(Number(item.price) * item.quantity)} ر.س</strong>
                  </div>
                ))}
              </div>

              <div style={{ maxWidth: "600px", margin: "20px auto 0" }}>
                {appliedCoupon ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                      padding: "10px 14px",
                      border: `1px solid ${couponResult?.valid ? "#5fae7a" : "#d9684b"}`,
                      background: "#10100e",
                      color: "#f7f2e8",
                    }}
                  >
                    <span>
                      🏷️ الكوبون <strong dir="ltr">{appliedCoupon.code}</strong>{" "}
                      {couponResult?.valid ? (
                        <span style={{ color: "#7fd39a" }}>
                          مفعّل (-{formatPrice(couponDiscount)} ر.س)
                        </span>
                      ) : (
                        <span style={{ color: "#ff9b80" }}>
                          {couponResult?.message}
                        </span>
                      )}
                    </span>

                    <button
                      type="button"
                      className="add-button"
                      onClick={() => setAppliedCoupon(null)}
                    >
                      إزالة
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyCoupon();
                        }
                      }}
                      placeholder="هل لديك كود خصم؟"
                      dir="ltr"
                      maxLength={20}
                      style={{ ...adminInputStyle, marginTop: 0, flex: 1 }}
                    />

                    <button
                      type="button"
                      className="add-button"
                      disabled={checkingCoupon}
                      onClick={applyCoupon}
                    >
                      {checkingCoupon ? "..." : "تطبيق"}
                    </button>
                  </div>
                )}

                <div
                  style={{
                    margin: "16px 0 4px",
                    display: "grid",
                    gap: "6px",
                    color: "#aaa59a",
                    fontSize: "15px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>المجموع</span>
                    <span>{formatPrice(cartSubtotal)} ر.س</span>
                  </div>

                  {couponDiscount > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#7fd39a",
                      }}
                    >
                      <span>خصم الكوبون</span>
                      <span>-{formatPrice(couponDiscount)} ر.س</span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      الشحن
                      {shippingCities.length > 0 && !customerCity
                        ? " (اختر المدينة)"
                        : ""}
                    </span>
                    <span>
                      {cartShipping > 0
                        ? `${formatPrice(cartShipping)} ر.س`
                        : "مجاني"}
                    </span>
                  </div>

                  {freeShippingGap > 0 && (
                    <small style={{ color: "#e8d29b" }}>
                      أضف منتجات بقيمة {formatPrice(freeShippingGap)} ر.س للحصول على
                      شحن مجاني 🚚
                    </small>
                  )}
                </div>
              </div>

              <div className="cart-total">
                <span>الإجمالي</span>
                <strong>{formatPrice(grandTotal)} ر.س</strong>
              </div>

              <div
                style={{
                  maxWidth: "600px",
                  margin: "25px auto",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <label>
                  الاسم
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    autoComplete="name"
                    placeholder="اسمك الكريم"
                    style={adminInputStyle}
                  />
                </label>

                <label>
                  رقم الجوال
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    autoComplete="tel"
                    placeholder="05xxxxxxxx"
                    style={adminInputStyle}
                  />
                </label>

                {shippingCities.length > 0 && (
                  <label>
                    المدينة
                    <select
                      value={customerCity}
                      onChange={(event) => setCustomerCity(event.target.value)}
                      style={adminInputStyle}
                    >
                      <option value="">اختر المدينة</option>
                      {shippingCities.map((entry) => (
                        <option key={entry.name} value={entry.name}>
                          {entry.name} —{" "}
                          {Number(entry.fee) > 0
                            ? `${formatPrice(entry.fee)} ر.س`
                            : "شحن مجاني"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  عنوان التوصيل
                  <textarea
                    value={customerAddress}
                    onChange={(event) =>
                      setCustomerAddress(event.target.value)
                    }
                    autoComplete="street-address"
                    rows={3}
                    placeholder="المدينة، الحي، الشارع"
                    style={adminInputStyle}
                  />
                </label>

                <label>
                  طريقة الدفع
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    style={adminInputStyle}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                className="checkout-button"
                onClick={checkout}
                disabled={placingOrder}
              >
                {placingOrder
                  ? "جارٍ إرسال الطلب..."
                  : "تأكيد الطلب وإرساله عبر واتساب"}
              </button>
            </>
          )}
        </section>

        <section className="about-section" id="about">
          <span className="eyebrow">قصتنا في العطور</span>

          <h2>
            {site.aboutTitle} <span>{site.aboutHighlight}</span>
          </h2>

          <p style={{ whiteSpace: "pre-line" }}>{site.aboutText}</p>
        </section>
      </main>

      {selectedProduct && (
        <div
          onClick={closeProductDetails}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.78)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "92vh",
              overflowY: "auto",
              boxSizing: "border-box",
              padding: "28px",
              background: "#1b1a15",
              border: "1px solid #c9a45c",
              color: "#f7f2e8",
              display: "grid",
              gap: "24px",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <button
              type="button"
              onClick={closeProductDetails}
              aria-label="إغلاق"
              style={{
                position: "absolute",
                top: "8px",
                left: "14px",
                background: "none",
                border: "none",
                color: "#e8d29b",
                fontSize: "30px",
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <img
              src={selectedProduct.image || "/images/nabea-royal.jpg"}
              alt={selectedProduct.name || "عطر النابع"}
              style={{
                width: "100%",
                maxHeight: "380px",
                objectFit: "contain",
                background: "#10100e",
              }}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/images/nabea-royal.jpg";
              }}
            />

            <div>
              <span className="product-category">
                {selectedProduct.category}
              </span>

              <h2 style={{ color: "#e8d29b", margin: "8px 0" }}>
                {selectedProduct.name}
              </h2>

              <p style={{ color: "#aaa59a", lineHeight: 1.9 }}>
                {selectedProduct.description || "لا يوجد وصف لهذا العطر."}
              </p>

              {selectedHasSizes && (
                <>
                  <p style={{ margin: "16px 0 8px" }}>اختر الحجم:</p>

                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    {selectedProduct.sizes.map((size) => (
                      <button
                        type="button"
                        key={size.label}
                        className={
                          selectedSize === size.label
                            ? "category active"
                            : "category"
                        }
                        disabled={Number(size.stock) <= 0}
                        onClick={() => setSelectedSize(size.label)}
                        style={{
                          opacity: Number(size.stock) <= 0 ? 0.45 : 1,
                        }}
                      >
                        {size.label}
                        {Number(size.stock) <= 0 ? " (نفد)" : ""}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedProduct && Number(selectedProduct.discountPercent) > 0 && (
                <p style={{ margin: "18px 0 0", color: "#aaa59a" }}>
                  قبل الخصم: <del>{formatPrice(getOriginalUnitPrice(selectedProduct, selectedSize))} ر.س</del>
                  <span style={{ color: "#e8d29b", marginRight: "10px", fontWeight: "bold" }}>
                    خصم {formatPrice(selectedProduct.discountPercent)}٪
                  </span>
                </p>
              )}

              <p
                style={{
                  color: "#e8d29b",
                  fontSize: "28px",
                  fontWeight: "bold",
                  margin: "8px 0 4px",
                }}
              >
                {formatPrice(detailPrice)} <small>ر.س</small>
              </p>

              <small style={{ color: "#aaa59a" }}>
                {detailStock > 0
                  ? `المتوفر: ${detailStock} قطعة`
                  : "نفد المخزون"}
              </small>

              <button
                type="button"
                className="checkout-button"
                disabled={detailStock <= 0}
                onClick={() => {
                  addToCart(selectedProduct, selectedSize);
                  closeProductDetails();
                }}
                style={{ marginTop: "20px", width: "100%" }}
              >
                {detailStock <= 0 ? "نفد المخزون" : "+ أضف للسلة"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <BrandMark logoUrl={site.logoUrl} />

          <span>
            <strong>{site.storeName}</strong>
            <small>{site.storeNameEn}</small>
          </span>
        </a>

        <p>الفخامة تبدأ من التفاصيل.</p>

        <a
          className="whatsapp-link"
          href={`https://wa.me/${site.whatsapp}`}
          target="_blank"
          rel="noreferrer"
        >
          تواصل معنا عبر واتساب
        </a>

        {socialLinks.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "18px",
              flexWrap: "wrap",
              justifyContent: "center",
              margin: "14px 0",
            }}
          >
            {socialLinks.map(([label, url]) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#c9a45c" }}
              >
                {label}
              </a>
            ))}
          </div>
        )}

        <small>
          © {new Date().getFullYear()} {site.storeName}. جميع الحقوق محفوظة.
        </small>
      </footer>
    </div>
  );
}

export default App;