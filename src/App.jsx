import { useState, useEffect } from "react";
import { db, auth } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  writeBatch,
} from "firebase/firestore";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

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

function App() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState("عطور رجالية");
  const [productDescription, setProductDescription] = useState("");
  const [productStock, setProductStock] = useState("10");
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState("الكل");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("الكل");
  const [search, setSearch] = useState("");

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
        alert("تعذر تحميل المنتجات. تحقق من اتصال Firebase وصلاحيات القراءة.");
      }
    );

    return () => unsubscribe();
  }, []);

  // جلب الطلبات (للمدير فقط)
  useEffect(() => {
    if (!isAdmin) {
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
        alert("تعذر تحميل الطلبات. تحقق من قواعد Firestore.");
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  // البحث والتصنيف
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      activeCategory === "الكل" || product.category === activeCategory;

    const matchesSearch = (product.name || "")
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // إضافة منتج إلى السلة مع مراعاة المخزون
  function addToCart(product) {
    const stock = Number(product.stock ?? 10);

    if (stock <= 0) {
      alert("عذرًا، هذا المنتج غير متوفر حاليًا.");
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === product.id);

      const currentQuantity = existing ? existing.quantity : 0;

      if (currentQuantity >= stock) {
        alert("لا توجد كمية إضافية متاحة من هذا المنتج.");
        return currentCart;
      }

      if (existing) {
        return currentCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...currentCart, { ...product, quantity: 1 }];
    });
  }

  // تغيير كمية المنتج داخل السلة
  function changeQuantity(id, amount) {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== id) return item;

          const newQuantity = item.quantity + amount;

          if (newQuantity > Number(item.stock ?? 10)) {
            alert("الكمية المطلوبة تتجاوز المخزون المتوفر.");
            return item;
          }

          return { ...item, quantity: newQuantity };
        })
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
      alert("سلة المشتريات فارغة!");
      return;
    }

    const name = customerName.trim();
    const phone = normalizePhone(customerPhone);
    const address = customerAddress.trim();

    if (name.length < 2) {
      alert("يرجى إدخال اسمك.");
      return;
    }

    if (phone.length < 11 || phone.length > 15) {
      alert("يرجى إدخال رقم جوال صحيح.");
      return;
    }

    if (address.length < 5) {
      alert("يرجى إدخال عنوان التوصيل.");
      return;
    }

    // نعتمد على الأسعار والمخزون الحاليين من قاعدة البيانات لا من السلة
    const items = [];

    for (const cartItem of cart) {
      const live = products.find((product) => product.id === cartItem.id);

      if (!live) {
        alert(`المنتج "${cartItem.name}" لم يعد متوفرًا. تم حذفه من السلة.`);
        setCart((current) =>
          current.filter((item) => item.id !== cartItem.id)
        );
        return;
      }

      if (cartItem.quantity > Number(live.stock ?? 10)) {
        alert(`الكمية المطلوبة من "${live.name}" تتجاوز المخزون المتوفر.`);
        return;
      }

      items.push({
        productId: live.id,
        name: live.name,
        price: Number(live.price),
        quantity: cartItem.quantity,
      });
    }

    const orderTotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const orderNumber = generateOrderNumber();

    // نفتح نافذة واتساب قبل العمليات غير المتزامنة لتجنب حظر المتصفح لها
    const whatsappWindow = window.open("about:blank", "_blank");

    setPlacingOrder(true);

    try {
      await addDoc(collection(db, "orders"), {
        orderNumber,
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        paymentMethod,
        items,
        total: orderTotal,
        status: "جديد",
        stockDeducted: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("خطأ في حفظ الطلب:", error);

      if (whatsappWindow) whatsappWindow.close();

      alert("تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.");
      setPlacingOrder(false);
      return;
    }

    const orderDetails = items
      .map(
        (item) =>
          `• ${item.name} × ${item.quantity} = ${formatPrice(
            item.price * item.quantity
          )} ريال`
      )
      .join("\n");

    const message =
      `السلام عليكم، أريد تأكيد طلبي من متجر النابع للعطور\n` +
      `رقم الطلب: ${orderNumber}\n\n` +
      `${orderDetails}\n\n` +
      `الإجمالي: ${formatPrice(orderTotal)} ريال\n\n` +
      `الاسم: ${name}\n` +
      `الجوال: ${customerPhone.trim()}\n` +
      `العنوان: ${address}\n` +
      `طريقة الدفع: ${paymentMethod}`;

    const whatsappUrl = `https://wa.me/966501369866?text=${encodeURIComponent(
      message
    )}`;

    if (whatsappWindow) {
      whatsappWindow.location.href = whatsappUrl;
    } else {
      window.location.href = whatsappUrl;
    }

    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setPaymentMethod(PAYMENT_METHODS[0]);
    setPlacingOrder(false);

    alert(`تم تسجيل طلبك برقم ${orderNumber}. شكرًا لك!`);
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
        alert("هذا الحساب غير مصرح له بإدارة المتجر.");
        return;
      }

      setIsAdmin(true);
      setAdminMode(true);
      setAdminPassword("");

      alert("تم تسجيل الدخول بنجاح.");
    } catch (error) {
      console.error("خطأ تسجيل الدخول:", error);

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        alert("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      } else {
        alert("رمز الخطأ: " + error.code + " | التفاصيل: " + error.message);
      }
    }
  }

  // تسجيل الخروج
  async function handleAdminLogout() {
    try {
      await signOut(auth);

      setIsAdmin(false);
      setAdminMode(false);
      setAdminEmail("");
      setAdminPassword("");
      clearProductForm();

      alert("تم تسجيل الخروج بنجاح.");
    } catch (error) {
      console.error("خطأ تسجيل الخروج:", error);
      alert("تعذر تسجيل الخروج. حاول مرة أخرى.");
    }
  }

  // حفظ منتج جديد أو تعديل منتج موجود
  async function saveProduct(event) {
    event.preventDefault();

    if (!isAdmin) {
      alert("يجب تسجيل الدخول بحساب المدير أولًا.");
      return;
    }

    const price = Number(productPrice);
    const stock = Number(productStock);

    if (!productName.trim()) {
      alert("يرجى إدخال اسم المنتج.");
      return;
    }

    if (
      productPrice.trim() === "" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      alert("يرجى إدخال سعر صحيح أكبر من صفر.");
      return;
    }

    if (
      productStock.trim() === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      alert("يرجى إدخال كمية صحيحة من الأعداد الصحيحة.");
      return;
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
        alert("يرجى اختيار صورة للمنتج.");
        return;
      }

      const productData = {
        name: productName.trim(),
        price,
        category: productCategory,
        description: productDescription.trim(),
        stock,
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

      alert(
        wasEditing ? "تم تحديث المنتج بنجاح." : "تمت إضافة المنتج بنجاح."
      );
    } catch (error) {
      console.error("خطأ في حفظ المنتج:", error);
      alert("تعذر حفظ المنتج: " + (error.message || "خطأ غير معروف"));
    } finally {
      setSavingProduct(false);
    }
  }

  // تحميل بيانات المنتج إلى النموذج للتعديل
  function editProduct(product) {
    if (!isAdmin) {
      alert("غير مصرح لك بتعديل المنتجات.");
      return;
    }

    setEditingId(product.id);
    setProductName(product.name || "");
    setProductPrice(String(product.price ?? ""));
    setProductCategory(product.category || "عطور رجالية");
    setProductDescription(product.description || "");
    setProductStock(String(product.stock ?? 10));

    setProductImageFile(null);
    setProductImagePreview(product.image || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // حذف منتج من Firebase والسلة
  async function deleteProduct(id) {
    if (!isAdmin) {
      alert("غير مصرح لك بحذف المنتجات.");
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

      alert("تم حذف المنتج بنجاح.");
    } catch (error) {
      console.error("خطأ في حذف المنتج:", error);
      alert("تعذر حذف المنتج. تحقق من صلاحيات Firebase.");
    }
  }

  // إعادة تعيين نموذج المنتج
  function clearProductForm() {
    setProductName("");
    setProductPrice("");
    setProductCategory("عطور رجالية");
    setProductDescription("");
    setProductStock("10");
    setEditingId(null);
    setProductImageFile(null);
    setProductImagePreview("");
  }

  // تغيير حالة الطلب مع خصم المخزون أو إعادته تلقائيًا
  async function changeOrderStatus(order, newStatus) {
    if (!isAdmin) {
      alert("غير مصرح لك بإدارة الطلبات.");
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
        for (const item of order.items || []) {
          const product = products.find((p) => p.id === item.productId);

          // المنتج محذوف: نتجاوز تعديل مخزونه
          if (!product) continue;

          if (
            shouldDeduct &&
            Number(product.stock ?? 10) < item.quantity
          ) {
            const proceed = window.confirm(
              `مخزون "${product.name}" (${product.stock ?? 10}) أقل من الكمية المطلوبة (${item.quantity}). هل تريد المتابعة؟`
            );

            if (!proceed) return;
          }

          batch.update(doc(db, "products", item.productId), {
            stock: increment(shouldDeduct ? -item.quantity : item.quantity),
          });
        }

        updates.stockDeducted = shouldDeduct;
      }

      batch.update(doc(db, "orders", order.id), updates);

      await batch.commit();
    } catch (error) {
      console.error("خطأ في تحديث الطلب:", error);
      alert("تعذر تحديث الطلب. تحقق من صلاحيات Firebase.");
    }
  }

  // حذف طلب
  async function deleteOrder(order) {
    if (!isAdmin) {
      alert("غير مصرح لك بحذف الطلبات.");
      return;
    }

    const confirmed = window.confirm(
      order.stockDeducted
        ? "هذا الطلب خُصم مخزونه. حذفه لن يعيد المخزون. هل تريد المتابعة؟"
        : "هل أنت متأكد من حذف هذا الطلب؟"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "orders", order.id));
    } catch (error) {
      console.error("خطأ في حذف الطلب:", error);
      alert("تعذر حذف الطلب. تحقق من صلاحيات Firebase.");
    }
  }

  const newOrdersCount = orders.filter(
    (order) => order.status === "جديد"
  ).length;

  const visibleOrders =
    ordersFilter === "الكل"
      ? orders
      : orders.filter((order) => order.status === ordersFilter);

  return (
    <div className="store" dir="rtl">
      <div className="announcement">✦ أهلاً بكم في عالم النابع للعطور ✦</div>

      <header className="header">
        <a className="brand" href="#home">
          <span className="brand-symbol">ن</span>
          <span>
            <strong>النابع</strong>
            <small>AL NABEA PERFUMES</small>
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

        <button
          type="button"
          className="admin-button"
          onClick={() => setAdminMode((current) => !current)}
        >
          {adminMode ? "إغلاق الإدارة" : "⚙️ إدارة المتجر"}
        </button>
      </header>

      {adminMode && !isAdmin && (
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
      )}

      <main>
        {adminMode && isAdmin && (
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
                      السعر: {product.price} ر.س
                    </p>

                    <p style={{ color: "#aaa59a", margin: "5px 0" }}>
                      التصنيف: {product.category}
                    </p>

                    <p style={{ color: "#aaa59a", margin: "5px 0" }}>
                      المخزون: {product.stock ?? 10} قطعة
                    </p>
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

                  <ul style={{ margin: "10px 0", paddingRight: "20px" }}>
                    {(order.items || []).map((item, index) => (
                      <li key={`${item.productId}-${index}`}>
                        {item.name} × {item.quantity} ={" "}
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
                    <strong style={{ color: "#e8d29b" }}>
                      الإجمالي: {formatPrice(order.total)} ر.س
                    </strong>

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
          </section>
        )}

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
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    <span className="product-tag">اختيار النابع</span>

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

                  <div className="product-info">
                    <span className="product-category">{product.category}</span>

                    <h3>{product.name}</h3>

                    <p>{product.description}</p>

                    <div className="product-footer">
                      <strong>
                        {product.price} <small>ر.س</small>
                      </strong>

                      <button
                        type="button"
                        className="add-button"
                        onClick={() => addToCart(product)}
                        disabled={Number(product.stock ?? 10) <= 0}
                      >
                        {Number(product.stock ?? 10) <= 0
                          ? "نفد المخزون"
                          : "+ أضف للسلة"}
                      </button>
                    </div>

                    <small>المتوفر: {product.stock ?? 10} قطعة</small>
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
                  <div className="cart-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.price} ريال للقطعة</p>
                    </div>

                    <div className="quantity-controls">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.id, -1)}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        onClick={() => changeQuantity(item.id, 1)}
                      >
                        +
                      </button>
                    </div>

                    <strong>{Number(item.price) * item.quantity} ر.س</strong>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <span>الإجمالي</span>
                <strong>{total} ر.س</strong>
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
            النابع... <span>أثرٌ لا يُنسى</span>
          </h2>

          <p>
            نؤمن أن العطر أكثر من مجرد رائحة؛ إنه ذكرى وهوية وتفاصيل صغيرة تصنع
            حضورًا لا يُنسى.
          </p>
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-symbol">ن</span>

          <span>
            <strong>النابع</strong>
            <small>AL NABEA PERFUMES</small>
          </span>
        </a>

        <p>الفخامة تبدأ من التفاصيل.</p>

        <a
          className="whatsapp-link"
          href="https://wa.me/966501369866"
          target="_blank"
          rel="noreferrer"
        >
          تواصل معنا عبر واتساب
        </a>

        <small>
          © {new Date().getFullYear()} النابع للعطور. جميع الحقوق محفوظة.
        </small>
      </footer>
    </div>
  );
}

export default App;