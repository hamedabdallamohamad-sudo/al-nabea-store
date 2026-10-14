
import { useState, useEffect } from "react";
import { db, auth } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
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
  const [productCategory, setProductCategory] =
    useState("عطور رجالية");
  const [productDescription, setProductDescription] = useState("");
  const [productStock, setProductStock] = useState("10");
  const [editingId, setEditingId] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);

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

  // البحث والتصنيف
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      activeCategory === "الكل" ||
      product.category === activeCategory;

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
      const existing = currentCart.find(
        (item) => item.id === product.id
      );

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

  // تجهيز الطلب عبر واتساب
  function checkout() {
    if (cart.length === 0) {
      alert("سلة المشتريات فارغة!");
      return;
    }

    const orderDetails = cart
      .map(
        (item) =>
          `• ${item.name} × ${item.quantity} = ${
            Number(item.price) * item.quantity
          } ريال`
      )
      .join("\n");

    const message =
      `السلام عليكم، أريد طلب المنتجات التالية من متجر النابع للعطور:\n\n` +
      `${orderDetails}\n\n` +
      `الإجمالي: ${total} ريال\n\n` +
      `الاسم:\nالعنوان:\nطريقة الدفع:`;

    const whatsappUrl =
      `https://wa.me/966501369866?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
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

    ```javascript
const productData = {
  name: productName.trim(),
  price,
  category: productCategory,
  description: productDescription.trim(),
  stock,
  icon: "✨",
  image: "/images/nabea-royal.jpg",
};
```


    setSavingProduct(true);

    try {
      if (editingId !== null) {
        await updateDoc(
          doc(db, "products", editingId),
          productData
        );
      } else {
        await addDoc(collection(db, "products"), productData);
      }

      clearProductForm();

      alert(
        editingId !== null
          ? "تم تحديث المنتج بنجاح."
          : "تمت إضافة المنتج بنجاح."
      );
    } catch (error) {
      console.error("خطأ في حفظ المنتج:", error);
      alert("تعذر حفظ المنتج. تحقق من اتصال Firebase وصلاحيات الكتابة.");
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // حذف منتج من Firebase والسلة
  async function deleteProduct(id) {
    if (!isAdmin) {
      alert("غير مصرح لك بحذف المنتجات.");
      return;
    }

    const confirmed = window.confirm(
      "هل أنت متأكد من حذف هذا المنتج؟"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "products", id));

      setCart((current) =>
        current.filter((item) => item.id !== id)
      );

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
  }

  return (
    <div className="store" dir="rtl">
      <div className="announcement">
        ✦ أهلاً بكم في عالم النابع للعطور ✦
      </div>

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
          🛍️ السلة (
          {cart.reduce((sum, item) => sum + item.quantity, 0)})
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
                  onChange={(event) =>
                    setAdminEmail(event.target.value)
                  }
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
                  onChange={(event) =>
                    setAdminPassword(event.target.value)
                  }
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
                  onChange={(event) =>
                    setProductName(event.target.value)
                  }
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
                  onChange={(event) =>
                    setProductPrice(event.target.value)
                  }
                  placeholder="مثال: 180"
                  style={adminInputStyle}
                />
              </label>

              <label>
                التصنيف
                <select
                  value={productCategory}
                  onChange={(event) =>
                    setProductCategory(event.target.value)
                  }
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
                  rows="3"
                  style={adminInputStyle}
                />
              </label>

              <label>
                الكمية المتوفرة في المخزون
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={productStock}
                  onChange={(event) =>
                    setProductStock(event.target.value)
                  }
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
                    <strong style={{ color: "#e8d29b" }}>
                      {product.name}
                    </strong>

                    <p
                      style={{
                        color: "#c9a45c",
                        margin: "5px 0",
                      }}
                    >
                      السعر: {product.price} ر.س
                    </p>

                    <p
                      style={{
                        color: "#aaa59a",
                        margin: "5px 0",
                      }}
                    >
                      التصنيف: {product.category}
                    </p>

                    <p
                      style={{
                        color: "#aaa59a",
                        margin: "5px 0",
                      }}
                    >
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
              اكتشف عالمًا من الروائح الاستثنائية،
              حيث تلتقي الأصالة بالفخامة في كل قطرة.
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
                <span className="bottle-subtitle">
                  LUXURY PERFUME
                </span>
              </div>
            </div>

            <div className="art-label">
              THE ART OF PERFUMERY
            </div>
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
                  activeCategory === category
                    ? "category active"
                    : "category"
                }
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {productsLoading ? (
            <p className="empty-message">
              جارٍ تحميل المنتجات...
            </p>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    <span className="product-tag">
                      اختيار النابع
                    </span>

                    

<img
  src="/images/nabea-royal.jpg"
  alt="عطر النابع الملكي"
  className="product-photo"
  style={{
    width: "100%",
    height: "220px",
    objectFit: "contain",
    display: "block",
  }}
/>




                    <span className="image-caption">
                      AL NABEA
                    </span>
                  </div>

                  <div className="product-info">
                    <span className="product-category">
                      {product.category}
                    </span>

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

                    <small>
                      المتوفر: {product.stock ?? 10} قطعة
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!productsLoading && filteredProducts.length === 0 && (
            <p className="empty-message">
              لا توجد منتجات تطابق بحثك.
            </p>
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

                    <strong>
                      {Number(item.price) * item.quantity} ر.س
                    </strong>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <span>الإجمالي</span>
                <strong>{total} ر.س</strong>
              </div>

              <button
                type="button"
                className="checkout-button"
                onClick={checkout}
              >
                إتمام الطلب عبر واتساب
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
            نؤمن أن العطر أكثر من مجرد رائحة؛ إنه ذكرى وهوية
            وتفاصيل صغيرة تصنع حضورًا لا يُنسى.
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
