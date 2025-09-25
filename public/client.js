// public/client.js
// --- Helpers ---
const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const ADMIN_PASSWORD = "admin123";

const API_URL = window.location.origin + '/api';

// --- State Management ---
let state = {
    products: [],
    orders: [],
    coupons: [],
    slides: [],
    features: [],
    content: {},
    cart: {},
    view: 'shop',
    adminAuthed: false,
    notify: null,
    appliedCoupon: null,
    showConfirmModal: false,
    lastTracking: null,
    viewData: { tab: 'dashboard', slideIndex: 0, productId: null }
};

let slideshowInterval;

async function fetchState() {
    try {
        const response = await fetch(`${API_URL}/data`);
        const data = await response.json();
        setState({
            products: data.products,
            orders: data.orders,
            coupons: data.coupons,
            slides: data.slides,
            features: data.features,
            content: data.content,
        });
    } catch (error) {
        console.error('Failed to fetch initial state:', error);
        setState({ notify: 'Error connecting to the server.' });
    }
}

function setState(newState) {
    state = { ...state, ...newState };
    if (newState.viewData) state.viewData = { ...state.viewData, ...newState.viewData };
    
    // Checkout পেজে ডেটা ইনপুট ঠিক রাখার জন্য বিশেষ ব্যবস্থা
    if (state.view === 'checkout') {
        const formData = getCheckoutFormData();
        renderApp();
        setCheckoutFormData(formData);
    } else {
        renderApp();
    }

    if (newState.notify) {
        setTimeout(() => setState({ notify: null }), 3500);
    }
}

// এই দুটি নতুন ফাংশন ফর্মের ডেটা সংরক্ষণ এবং পুনরায় লোড করার জন্য
function getCheckoutFormData() {
    const data = {};
    const formElements = document.querySelectorAll('#checkout-form-container input, #checkout-form-container textarea');
    formElements.forEach(el => {
        data[el.id] = el.value;
    });
    return data;
}

function setCheckoutFormData(data) {
    const formElements = document.querySelectorAll('#checkout-form-container input, #checkout-form-container textarea');
    formElements.forEach(el => {
        if (data[el.id]) {
            el.value = data[el.id];
        }
    });
}


function money(n) { return `৳${(n / 100).toFixed(2)}`; }
function genTracking() { const d = new Date(); return `BROS-${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
function countCartItems(cart) { return Object.values(cart).reduce((s, v) => s + v, 0); }
function calcDiscount(subtotal, coupon) {
    if (!coupon) return 0;
    const value = Number(coupon.value || 0);
    if (coupon.type === 'percent') return Math.round(subtotal * (value / 100));
    return value;
}
function applyCouponByCode(code) {
    if (!code) return false;
    const normalizedCode = code.trim().toUpperCase();
    let c = state.coupons.find(x => x.code.toUpperCase() === normalizedCode);
    if (!c) {
        const cartContainsSpecialProduct = Object.entries(state.cart).some(([pid, qty]) => {
            const p = state.products.find(prod => prod.id === pid);
            return p && p.specialCoupon && p.specialCoupon.toUpperCase() === normalizedCode && qty > 0;
        });
        if (cartContainsSpecialProduct) {
            const fixedReward = 150;
            c = {
                id: `TEMP_${uid()}`,
                code: normalizedCode,
                type: 'fixed',
                value: fixedReward,
                description: `Special ৳${(fixedReward / 100).toFixed(2)} reward!`
            };
        }
    }
    if (!c) {
        setState({ notify: 'Invalid coupon', appliedCoupon: null });
        return false;
    }
    return c;
}

// --- Core Functions ---
function addToCart(id, qty = 1) {
    const product = state.products.find(p => p.id === id);
    if (!product || product.stock <= 0) {
        setState({ notify: 'Out of Stock!' });
        return;
    }

    const nextCart = { ...state.cart };
    const currentQty = nextCart[id] || 0;
    if (currentQty + qty > product.stock) {
        qty = product.stock - currentQty;
        if (qty <= 0) {
             setState({ notify: 'Max stock reached in cart.' });
             return;
        }
    }
    
    nextCart[id] = currentQty + qty;
    setState({ cart: nextCart, notify: 'Added to cart' });
}

function updateCart(id, qty) {
    const product = state.products.find(p => p.id === id);
    if (!product) return; 

    if (qty > product.stock) {
        qty = product.stock;
        setState({ notify: `Quantity capped at stock limit: ${product.stock}` });
    }
    
    const nextCart = { ...state.cart };
    if (qty <= 0) delete nextCart[id];
    else nextCart[id] = qty;
    setState({ cart: nextCart });
}

async function placeOrder(customer) {
    if (Object.keys(state.cart).length === 0) {
        setState({ notify: 'Cart empty' });
        return;
    }

    const items = Object.entries(state.cart).map(([pid, qty]) => {
        const p = state.products.find(pp => pp.id === pid);
        if (!p) return null;
        return { productId: pid, title: p.title, qty, price: p.price };
    }).filter(i => i !== null);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = calcDiscount(subtotal, state.appliedCoupon);
    let total = Math.max(0, subtotal - discount);

    const tracking = genTracking();

    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, customer, coupon: state.appliedCoupon?.code, subtotal, discount, total })
        });
        const order = await response.json();
        if (response.ok) {
            setState({
                orders: [order, ...state.orders],
                cart: {},
                appliedCoupon: null,
                lastTracking: order.tracking,
                showConfirmModal: true,
                view: 'shop',
                notify: 'Order placed — pay on delivery'
            });
            await fetchState();
        } else {
            setState({ notify: order.message || 'Failed to place order' });
        }
    } catch (error) {
        setState({ notify: 'Connection error. Please try again.' });
    }
}

function startSlideshow() {
    if (slideshowInterval) clearInterval(slideshowInterval);
    if (state.slides.length < 2) return;
    slideshowInterval = setInterval(() => {
        const nextIndex = (state.viewData.slideIndex + 1) % state.slides.length;
        state.viewData.slideIndex = nextIndex;
        const heroElement = document.getElementById('hero-section');
        if (heroElement) {
            heroElement.innerHTML = HeroContent(state.slides, nextIndex);
            attachHeroEventListeners();
        }
    }, 4000);
}

function attachHeroEventListeners() {
    document.querySelectorAll('.slide-nav-btn').forEach(btn => {
        btn.onclick = (e) => {
            const index = Number(e.target.dataset.index);
            setState({ viewData: { ...state.viewData, slideIndex: index } });
            if (slideshowInterval) clearInterval(slideshowInterval);
            slideshowInterval = setTimeout(startSlideshow, 4000);
        };
    });
}

// --- HTML Rendering Functions ---
function renderApp() {
    const container = document.getElementById('main-container');
    if (!container) return;
    if (slideshowInterval) clearInterval(slideshowInterval);
    container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', Header(state.cart, state.adminAuthed));
    container.insertAdjacentHTML('beforeend', '<div class="pt-24 md:pt-16" id="main-content-wrapper"></div>');
    const contentWrapper = document.getElementById('main-content-wrapper');
    let mainHTML = '<main class="mt-0">';
    if (state.notify) {
        mainHTML += `<div class="mb-4 p-3 rounded bg-red-900/60 text-red-200">${state.notify}</div>`;
    }
    if (state.view === 'shop') {
        mainHTML += Hero(state.slides, state.viewData.slideIndex);
        mainHTML += `<div class="mt-6">${FeaturesBar(state.features)}</div>`;
        mainHTML += `<div class="mt-6"><h2 class="text-3xl font-bold mb-4 border-b border-red-800 pb-2">Top Products</h2>${Shop(state.products)}</div>`;
        startSlideshow();
    } else if (state.view === 'product-detail' && state.viewData.productId) {
        mainHTML += ProductDetail(state.products, state.viewData.productId);
    } else if (state.view === 'cart') {
        mainHTML += Cart(state.products, state.cart);
    } else if (state.view === 'checkout') {
        mainHTML += Checkout(state.products, state.cart, state.coupons, state.appliedCoupon);
    } else if (state.view === 'admin') {
        mainHTML += Admin(state);
    }
    mainHTML += '</main>';
    contentWrapper.insertAdjacentHTML('beforeend', mainHTML);
    container.insertAdjacentHTML('beforeend', Footer(state.content));
    if (state.showConfirmModal) {
        document.body.insertAdjacentHTML('beforeend', ConfirmationModal(state.lastTracking));
    } else {
        document.querySelectorAll('#confirmation-modal').forEach(el => el.remove());
    }
    attachEventListeners();
    if (state.view === 'shop') attachHeroEventListeners();
}

function Header(cart, adminAuthed) {
    const cartCount = countCartItems(cart);
    const adminButton = adminAuthed ?
        `<button id="admin-logout-btn" class="px-3 py-2 rounded hover:bg-white/5">Logout</button>` : '';
    return `
        <header class="flex items-center justify-between header-fixed">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight">
                    <span class="brosmart-title">BROS</span><span class="text-red-500 brosmart-title">MART</span>
                </h1>
                <p class="text-sm text-red-300">Classical premium — black & red</p>
            </div>
            <nav class="flex gap-3 items-center">
                <button class="nav-btn px-3 py-2 rounded hover:bg-white/5 text-lg" data-view="shop" title="Home">
                    <i class="fas fa-home"></i>
                </button>
                <button class="nav-btn px-3 py-2 rounded hover:bg-white/5 text-lg relative" data-view="cart" title="Cart">
                    <i class="fas fa-shopping-cart"></i> 
                    ${cartCount > 0 ? `<span class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-black transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">${cartCount}</span>` : ''}
                </button>
                ${adminButton}
            </nav>
        </header>
    `;
}

function FeaturesBar(features) {
    return `
        <div class="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            ${features.map(f => `
                <div class="p-4 bg-gray-900 rounded shadow-lg border border-red-800 transition duration-300 hover:bg-gray-800">
                    <i class="fas ${f.icon} text-3xl md:text-4xl text-red-500 mb-2"></i>
                    <h4 class="font-bold text-base md:text-lg text-white">${f.title}</h4>
                    <p class="text-xs text-red-300">${f.subtitle}</p>
                </div>
            `).join('')}
        </div>
    `;
}

function Hero(slides, currentI) {
    return `<div id="hero-section">${HeroContent(slides, currentI)}</div>`;
}

function HeroContent(slides, currentI) {
    if (slides.length === 0) {
        return `<div class="relative rounded overflow-hidden shadow-lg h-56 flex items-center justify-center bg-gray-900/50">
            <p class="text-red-300">No slides available. Add some in Admin Panel.</p>
        </div>`;
    }
    const slide = slides[currentI];
    return `
        <div class="relative rounded overflow-hidden shadow-lg">
            <img src="${slide.image}" alt="${slide.title}" class="w-full h-56 object-cover brightness-75" />
            <div class="absolute inset-0 flex flex-col justify-center items-start p-8">
                <h2 class="text-3xl md:text-5xl font-extrabold">${slide.title}</h2>
                <p class="mt-2 text-red-300">${slide.subtitle}</p>
            </div>
            <div class="absolute left-4 bottom-4 flex gap-2">
                ${slides.map((s, idx) => `
                    <button key="${s.id}" data-index="${idx}" class="slide-nav-btn w-3 h-3 rounded-full ${idx === currentI ? 'bg-red-500' : 'bg-white/40'}"></button>
                `).join('')}
            </div>
        </div>
    `;
}

function Shop(products) {
    return `
        <section class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            ${products.map(p => ProductCard(p)).join('')}
        </section>
    `;
}

function ProductCard(product) {
    const disabled = product.stock <= 0;
    const buttonClass = disabled ? 'opacity-50' : 'bg-red-600 text-black font-semibold';
    
    const specialCouponTag = product.specialCoupon ? 
        `<div class="text-xs font-bold text-yellow-500 mt-1">Special: ${product.specialCoupon}</div>` : '';

    return `
        <div class="bg-gray-900 rounded shadow-lg p-4 flex flex-col border border-red-800 product-card-3d product-detail-link cursor-pointer" data-id="${product.id}">
            <img src="${product.image}" alt="${product.title}" class="h-44 w-full object-cover rounded" />
            <div class="mt-3 flex-1">
                <h3 class="font-semibold text-lg">${product.title}</h3>
                <p class="text-sm text-red-200">${product.description}</p>
            </div>
            <div class="mt-3 flex items-center justify-between">
                <div>
                    <div class="text-xl font-bold text-red-400">${money(product.price)}</div>
                    <div class="text-xs text-red-300">Stock: ${product.stock}</div>
                    ${specialCouponTag}
                </div>
                <div>
                    <button ${disabled ? 'disabled' : ''} class="add-to-cart-btn px-3 py-2 rounded ${buttonClass}" data-id="${product.id}" onclick="event.stopPropagation();">Add</button>
                </div>
            </div>
        </div>
    `;
}

function ProductDetail(products, productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return `<div class="p-6 text-center text-red-300">Product not found.</div>`;
    
    const suggestedProducts = products.filter(p => p.id !== productId).slice(0, 3);
    
    const disabled = product.stock <= 0;
    const buttonClass = disabled ? 'opacity-50' : 'bg-red-600 text-black font-semibold';
    const stockQty = product.stock > 0 ? `<span class="text-green-400">${product.stock} in stock</span>` : `<span class="text-red-500">Out of Stock</span>`;
    
    const specialCouponInfo = product.specialCoupon ? 
        `<div class="text-sm text-yellow-300 mt-2">✨ Use code **${product.specialCoupon}** for a special discount!</div>` : '';


    return `
        <div class="space-y-8 pt-4">
            <button class="nav-btn px-3 py-2 rounded hover:bg-white/5 border border-red-800" data-view="shop"><i class="fas fa-arrow-left mr-2"></i>Back to Shop</button>

            <div class="bg-gray-900 p-6 rounded shadow-lg border border-red-800 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <img src="${product.image}" alt="${product.title}" class="w-full h-auto object-cover rounded-lg shadow-xl" />
                
                <div>
                    <h1 class="text-3xl sm:text-4xl font-extrabold text-red-400 mb-2">${product.title}</h1>
                    <p class="text-base sm:text-lg text-red-200 mb-4">${product.description}</p>
                    
                    <div class="text-4xl sm:text-5xl font-bold text-white my-4">${money(product.price)}</div>
                    
                    <div class="text-base sm:text-lg text-red-300 mb-6">Stock: ${stockQty}</div>
                    
                    <button ${disabled ? 'disabled' : ''} class="add-to-cart-btn px-6 py-3 rounded text-lg ${buttonClass}" data-id="${product.id}">
                        <i class="fas fa-cart-plus mr-2"></i> Add to Cart
                    </button>
                    
                    ${specialCouponInfo}

                    <h3 class="text-xl font-semibold mt-8 mb-3 border-b border-red-800 pb-1">Product Details</h3>
                    <p class="text-base text-gray-300">${product.longDescription || product.description}</p>
                </div>
            </div>

            <div class="mt-12">
                <h2 class="text-3xl font-bold mb-6 border-b border-red-800 pb-2">You Might Also Like</h2>
                <section class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    ${suggestedProducts.map(p => ProductCard(p)).join('')}
                </section>
            </div>
        </div>
    `;
}

function Cart(products, cart) {
    const items = Object.entries(cart).map(([pid, qty]) => {
        const p = products.find(x => x.id === pid);
        if (!p) return null; 
        return { ...p, qty };
    }).filter(item => item !== null);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

    const itemsList = items.length === 0 ?
        `<div class="p-6 bg-gray-900 rounded shadow text-center">Cart is empty</div>` :
        `<div class="bg-gray-900 rounded shadow p-4 border border-red-800">
            <div class="space-y-4">
                ${items.map(it => `
                    <div key="${it.id}" class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <img src="${it.image}" class="h-16 w-full sm:w-24 object-cover rounded" />
                        <div class="flex-1">
                            <div class="font-semibold">${it.title}</div>
                            <div class="text-sm text-red-300">${money(it.price)} each</div>
                        </div>
                        <div class="flex items-center gap-2 mt-2 sm:mt-0">
                            <input type="number" min="0" max="${it.stock}" value="${it.qty}" data-id="${it.id}" class="cart-qty-input w-20 p-1 border rounded bg-black text-white" />
                        </div>
                        <div class="w-full sm:w-28 text-right font-bold">${money(it.price * it.qty)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="mt-6 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
                <div class="text-lg font-semibold">Subtotal: ${money(subtotal)}</div>
                <div><button id="checkout-btn" class="w-full sm:w-auto px-4 py-2 rounded bg-red-600 text-black font-semibold">Checkout</button></div>
            </div>
        </div>`;

    return `
        <div>
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-xl font-semibold">Your Cart</h2>
                <div><button class="nav-btn px-3 py-2 rounded hover:bg-white/5" data-view="shop"><i class="fas fa-arrow-left mr-2"></i>Continue shopping</button></div>
            </div>
            ${itemsList}
        </div>
    `;
}

// Checkout ফাংশন আপডেট করা হয়েছে
function Checkout(products, cart, coupons, appliedCoupon) {
    const items = Object.entries(cart).map(([pid, qty]) => {
        const p = products.find(x => x.id === pid);
        if (!p) return null; 
        return { ...p, qty };
    }).filter(item => item !== null);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = calcDiscount(subtotal, appliedCoupon);
    const total = Math.max(0, subtotal - discount);

    return `
        <div class="max-w-2xl mx-auto">
            <h2 class="text-xl font-semibold mb-4">Checkout</h2>
            <div class="bg-gray-900 rounded shadow p-4 border border-red-800 space-y-4" id="checkout-form-container">
                <div>
                    <label class="block text-sm text-red-200">Name</label>
                    <input id="checkout-name" class="w-full p-2 border rounded bg-black text-white" required />
                </div>
                <div>
                    <label class="block text-sm text-red-200">Email Address</label>
                    <input id="checkout-email" type="email" class="w-full p-2 border rounded bg-black text-white" required />
                </div>
                <div>
                    <label class="block text-sm text-red-200">Phone Number (Must start with +88)</label>
                    <input id="checkout-phone" placeholder="+8801XXXXXXXXX" class="w-full p-2 border rounded bg-black text-white" required />
                </div>
                
                <h3 class="font-semibold text-red-300 pt-2">Shipping Address</h3>
                <div>
                    <label class="block text-sm text-red-200">Street Address</label>
                    <textarea id="checkout-street" class="w-full p-2 border rounded bg-black text-white" required></textarea>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm text-red-200">City</label>
                        <input id="checkout-city" class="w-full p-2 border rounded bg-black text-white" required />
                    </div>
                    <div>
                        <label class="block text-sm text-red-200">Postal Code</label>
                        <input id="checkout-postal" class="w-full p-2 border rounded bg-black text-white" required />
                    </div>
                    <div>
                        <label class="block text-sm text-red-200">Country</label>
                        <input id="checkout-country" value="Bangladesh" class="w-full p-2 border rounded bg-black text-white" required />
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="coupon-code-input" placeholder="Coupon code" class="w-full sm:w-auto p-2 border rounded bg-black text-white" value="${appliedCoupon?.code || ''}" />
                    <button id="apply-coupon-btn" class="px-3 py-2 rounded bg-red-600 text-black font-semibold">Apply</button>
                    ${appliedCoupon ? `<div class="ml-0 sm:ml-2 mt-2 sm:mt-0 text-red-300">Applied: ${appliedCoupon.code}</div>` : ''}
                </div>

                <div class="flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
                    <div>
                        <div class="text-sm text-red-300">Subtotal: ${money(subtotal)}</div>
                        <div class="text-sm text-red-300">Discount: -${money(discount)}</div>
                        <div class="text-lg font-semibold text-red-400">Total: ${money(total)}</div>
                        <div class="text-xs text-red-300">Payment method: Cash on Delivery</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="nav-btn px-3 py-2 rounded border" data-view="cart">Back</button>
                        <button id="place-order-btn" class="px-4 py-2 rounded bg-red-600 text-black font-semibold">Place Order</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
 
function Admin(state) {
    if (!state.adminAuthed) {
        return `
            <div class="max-w-md mx-auto">
                <h2 class="text-xl font-semibold mb-4">Admin login</h2>
                <div class="bg-gray-900 rounded shadow p-4 border border-red-800">
                    <input id="admin-password" placeholder="password" type="password" class="w-full p-2 border rounded bg-black text-white" />
                    <div class="mt-3 flex gap-2">
                        <button id="admin-login-btn" class="px-3 py-2 rounded bg-red-600 text-black">Login</button>
                        <button class="nav-btn px-3 py-2 rounded border" data-view="shop">Back</button>
                    </div>
                </div>
            </div>
        `;
    }
    const currentTab = state.viewData?.tab || 'dashboard';
    const tabContent = {
        'dashboard': DashboardTab(state),
        'products': ProductAdminTab(state.products),
        'orders': OrderAdminTab(state.orders),
        'coupons': CouponAdminTab(state.coupons),
        'slides': SlideshowAdminTab(state.slides),
        'content': ContentAdminTab(state.features, state.content)
    };
    return `
        <div>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-semibold">Admin Dashboard</h2>
                <div class="flex gap-2">
                    <button id="admin-logout-btn-main" class="px-3 py-2 rounded border">Logout</button>
                    <button class="nav-btn px-3 py-2 rounded" data-view="shop">Storefront</button>
                </div>
            </div>
            <div class="bg-gray-900 rounded shadow p-4 border border-red-800">
                <div class="flex flex-wrap gap-2 border-b pb-3 mb-4">
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'dashboard' ? 'font-semibold' : ''}" data-tab="dashboard">Dashboard</button>
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'products' ? 'font-semibold' : ''}" data-tab="products">Products</button>
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'orders' ? 'font-semibold' : ''}" data-tab="orders">Orders</button>
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'coupons' ? 'font-semibold' : ''}" data-tab="coupons">Coupons</button>
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'slides' ? 'font-semibold' : ''}" data-tab="slides">Slideshow</button> 
                    <button class="admin-tab-btn px-3 py-2 ${currentTab === 'content' ? 'font-semibold' : ''}" data-tab="content">Website Content</button> 
                </div>
                ${tabContent[currentTab]}
            </div>
        </div>
    `;
}

function DashboardTab(state) {
    const totalOrders = state.orders.length;
    const pendingOrders = state.orders.filter(o => o.status === 'pending').length;
    const totalProducts = state.products.length;
    const totalCoupons = state.coupons.length;
    const statCard = (title, value, icon, color) => `
        <div class="bg-gray-900 p-4 rounded-lg border border-red-800 flex items-center space-x-4">
            <i class="fas ${icon} text-3xl ${color}"></i>
            <div>
                <div class="text-sm text-red-300">${title}</div>
                <div class="text-2xl font-bold">${value}</div>
            </div>
        </div>
    `;
    return `
        <div class="space-y-6">
            <h3 class="text-xl font-semibold border-b border-red-800 pb-2">Quick Overview</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                ${statCard('Total Products', totalProducts, 'fa-box-open', 'text-yellow-400')}
                ${statCard('Total Orders', totalOrders, 'fa-truck', 'text-red-500')}
                ${statCard('Pending Orders', pendingOrders, 'fa-clock', 'text-yellow-500')}
                ${statCard('Active Coupons', totalCoupons, 'fa-tag', 'text-green-500')}
            </div>
            <h3 class="text-xl font-semibold border-b border-red-800 pb-2 pt-4">Recent Orders (Last 5)</h3>
            <div class="space-y-2">
                ${state.orders.slice(0, 5).length === 0 ? '<p class="text-red-300">No orders placed yet.</p>' :
                    state.orders.slice(0, 5).map(o => `
                        <div class="p-3 bg-gray-800/50 rounded flex items-center justify-between">
                            <div>
                                <div class="font-semibold">${o.customer.name} - ${money(o.total)}</div>
                                <div class="text-xs text-red-300">Tracking: ${o.tracking}</div>
                            </div>
                            <div class="text-sm ${o.status === 'shipped' ? 'text-green-300' : 'text-yellow-300'}">${o.status}</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `;
}

function ContentAdminTab(features, content) {
    return `
        <div class="space-y-8">
            <div class="border p-3 rounded border-red-800 space-y-3">
                <h3 class="font-semibold mb-2">Footer & About Text</h3>
                <div>
                    <label class="block text-sm text-red-200">About/Description Text</label>
                    <textarea id="edit-footer-about" class="w-full p-2 border rounded bg-black text-white">${content.footerAbout}</textarea>
                </div>
                <div>
                    <label class="block text-sm text-red-200">Copyright Text</label>
                    <input id="edit-copyright" value="${content.copyright}" class="w-full p-2 border rounded bg-black text-white" />
                </div>
                <button id="save-content-btn" class="px-3 py-2 rounded bg-green-600 text-black">Save Content</button>
            </div>
            <div class="border p-3 rounded border-red-800 space-y-3">
                <h3 class="font-semibold mb-2">Home Page Features Bar (${features.length}/3)</h3>
                ${features.map(f => `
                    <div class="flex items-center gap-3 border-b border-red-900 pb-2">
                        <i class="fas ${f.icon} text-xl text-red-500 w-8 text-center"></i>
                        <div class="flex-1">
                            <div class="font-semibold">${f.title}</div>
                            <div class="text-sm text-red-300">${f.subtitle}</div>
                        </div>
                        <button class="edit-feature-btn px-3 py-1 rounded border" data-id="${f.id}">Edit</button>
                        <button class="delete-feature-btn px-3 py-1 rounded bg-red-700 text-black" data-id="${f.id}">Delete</button>
                    </div>
                `).join('')}
                ${features.length < 3 ? `
                    <div class="pt-3">
                        <h4 class="font-semibold">Add New Feature</h4>
                        <input id="new-feature-title" placeholder="Title" class="w-full p-2 border rounded bg-black text-white mt-1" />
                        <input id="new-feature-subtitle" placeholder="Subtitle" class="w-full p-2 border rounded bg-black text-white mt-1" />
                        <input id="new-feature-icon" placeholder="Icon Class (e.g. fa-handshake)" class="w-full p-2 border rounded bg-black text-white mt-1" />
                        <button id="add-feature-btn" class="px-3 py-2 rounded bg-red-600 text-black mt-2">Add Feature</button>
                    </div>
                ` : '<div class="text-center text-red-300 pt-3">Maximum 3 features reached.</div>'}
            </div>
            ${state.viewData?.editingFeature ? EditFeatureForm(state.viewData.editingFeature) : ''}
        </div>
    `;
}

function EditFeatureForm(feature) {
    return `
        <div class="mt-4"><h3 class="font-semibold mb-2">Edit Feature: ${feature.title}</h3>
            <div class="border p-3 rounded border-red-800" data-id="${feature.id}">
                <div class="space-y-2">
                    <input id="edit-feature-title-${feature.id}" value="${feature.title}" class="w-full p-2 border rounded bg-black text-white" />
                    <input id="edit-feature-subtitle-${feature.id}" value="${feature.subtitle}" class="w-full p-2 border rounded bg-black text-white" />
                    <input id="edit-feature-icon-${feature.id}" value="${feature.icon}" class="w-full p-2 border rounded bg-black text-white" />
                </div>
                <div class="mt-3 flex gap-2">
                    <button class="save-feature-btn px-3 py-2 rounded bg-green-600 text-black" data-id="${feature.id}">Save</button>
                    <button class="cancel-feature-edit-btn px-3 py-2 rounded border">Cancel</button>
                </div>
            </div>
        </div>
    `;
}

function SlideshowAdminTab(slides) { return `
        <div>
            <h3 class="font-semibold mb-2">Add New Slide</h3>
            <div class="border p-3 rounded border-red-800 space-y-2">
                <input id="slide-title" placeholder="Title" class="w-full p-2 border rounded bg-black text-white" />
                <input id="slide-subtitle" placeholder="Subtitle" class="w-full p-2 border rounded bg-black text-white" />
                <input id="slide-image" placeholder="Image URL (e.g., https://picsum.photos/...)" class="w-full p-2 border rounded bg-black text-white" />
                <div class="mt-2"><button id="add-slide-submit" class="px-3 py-2 rounded bg-red-600 text-black">Add Slide</button></div>
            </div>
            <div class="mt-6">
                <h3 class="font-semibold mb-2">Current Slides (${slides.length})</h3>
                <div class="space-y-3">
                    ${slides.map(s => `
                        <div key="${s.id}" class="flex items-center gap-3 border p-3 rounded border-red-800">
                            <img src="${s.image}" class="h-16 w-24 object-cover rounded" />
                            <div class="flex-1">
                                <div class="font-semibold">${s.title}</div>
                                <div class="text-sm text-red-300">${s.subtitle}</div>
                            </div>
                            <div>
                                <button class="delete-slide-btn px-3 py-1 rounded bg-red-700 text-black" data-id="${s.id}">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `; }

function ProductAdminTab(products) { return `
        <div>
            ${ProductEditor()}
            <div class="mt-4 space-y-3">
                ${products.map(p => `
                    <div key="${p.id}" class="flex items-center gap-3 border p-3 rounded border-red-800">
                        <img src="${p.image}" class="h-16 w-24 object-cover rounded" />
                        <div class="flex-1">
                            <div class="font-semibold">${p.title}</div>
                            <div class="text-sm text-red-300">${money(p.price)} • stock: ${p.stock}</div>
                            ${p.specialCoupon ? `<div class="text-xs text-yellow-500">Special Coupon: ${p.specialCoupon}</div>` : ''}
                        </div>
                        <div class="flex gap-2">
                            <button class="edit-product-btn px-3 py-1 rounded border" data-id="${p.id}">Edit</button>
                            <button class="delete-product-btn px-3 py-1 rounded bg-red-700 text-black" data-id="${p.id}">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${state.viewData?.editingProduct ? EditProductForm(state.viewData.editingProduct) : ''}
        </div>
    `; }

function ProductEditor(product = {}) { return `
        <div class="border p-3 rounded border-red-800">
            <h3 class="font-semibold mb-2">Add new product</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input id="add-title" placeholder="Title" class="p-2 border rounded col-span-2 bg-black text-white" />
                <input id="add-price" placeholder="Price (in cents) e.g. 1999" value="0" class="p-2 border rounded bg-black text-white" />
                <input id="add-stock" placeholder="Stock" value="0" class="p-2 border rounded bg-black text-white" />
                <input id="add-image" placeholder="Image URL (optional)" class="p-2 border rounded md:col-span-3 bg-black text-white" />
                <input id="add-special-coupon" placeholder="Special Coupon Code (optional)" class="p-2 border rounded bg-black text-white" />
                <input id="add-desc" placeholder="Short description" class="p-2 border rounded md:col-span-4 bg-black text-white" />
            </div>
            <div class="mt-2"><button id="add-product-submit" class="px-3 py-2 rounded bg-red-600 text-black">Add product</button></div>
        </div>
    `; }

function EditProductForm(product) { return `
        <div class="mt-4"><h3 class="font-semibold mb-2">Edit product: ${product.title}</h3>
            <div class="border p-3 rounded border-red-800" data-id="${product.id}">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input id="edit-title-${product.id}" value="${product.title}" class="p-2 border rounded col-span-2 bg-black text-white" />
                    <input id="edit-price-${product.id}" value="${product.price}" class="p-2 border rounded bg-black text-white" />
                    <input id="edit-stock-${product.id}" value="${product.stock}" class="p-2 border rounded bg-black text-white" />
                    <input id="edit-image-${product.id}" value="${product.image}" class="p-2 border rounded md:col-span-3 bg-black text-white" />
                    <input id="edit-special-coupon-${product.id}" value="${product.specialCoupon || ''}" placeholder="Special Coupon Code (optional)" class="p-2 border rounded bg-black text-white" />
                    <input id="edit-desc-${product.id}" value="${product.description}" class="p-2 border rounded md:col-span-4 bg-black text-white" />
                </div>
                <div class="mt-2 flex gap-2">
                    <button class="save-product-btn px-3 py-2 rounded bg-green-600 text-black" data-id="${product.id}">Save</button>
                    <button class="cancel-edit-btn px-3 py-2 rounded border">Cancel</button>
                </div>
            </div>
        </div>
    `; }

function OrderAdminTab(orders) { return `
        <div>
            ${orders.length === 0 ? '<div class="p-6 text-center text-red-300">No orders yet</div>' :
                `<div class="space-y-3">
                    ${orders.map(o => `
                        <div key="${o.id}" class="border p-3 rounded border-red-800">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="font-semibold">Order ${o.id}</div>
                                    <div class="text-sm text-red-300">${new Date(o.createdAt).toLocaleString()}</div>
                                    <div class="text-xs text-red-300">Tracking: ${o.tracking}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold text-red-400">${money(o.total)}</div>
                                    <div class="text-sm ${o.status === 'shipped' ? 'text-green-300' : 'text-yellow-300'}">${o.status || 'pending'}</div>
                                </div>
                            </div>
                            <div class="mt-2 text-sm text-red-200">
                                <div><strong>Customer:</strong> ${o.customer?.name} • ${o.customer?.phone}</div>
                                <div><strong>Address:</strong> ${o.customer?.address}</div>
                                <div class="mt-2"><strong>Items:</strong>
                                    <ul class="list-disc pl-5">${o.items.map(it => `<li>${it.title} x ${it.qty} — ${money(it.price * it.qty)}</li>`).join('')}</ul>
                                </div>
                                <div class="mt-3 flex gap-2">
                                    ${o.status !== 'shipped' ? `<button class="mark-shipped-btn px-3 py-1 rounded bg-green-600 text-black" data-id="${o.id}">Mark shipped</button>` : `<div class="px-3 py-1 rounded bg-green-700 text-black">Shipped</div>`}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>`
            }
        </div>
    `; }

function CouponAdminTab(coupons) { return `
        <div>
            ${CouponEditor()}
            <div class="mt-4 space-y-3">
                ${coupons.map(c => `
                    <div key="${c.id}" class="flex items-center gap-3 border p-3 rounded border-red-800">
                        <div class="flex-1">
                            <div class="font-semibold">${c.code} ${c.type === 'percent' ? `<span class="text-red-300">(${c.value}% off)</span>` : `<span class="text-red-300">(${money(c.value)} off)</span>`}</div>
                            <div class="text-sm text-red-300">${c.description}</div>
                        </div>
                        <div><button class="delete-coupon-btn px-3 py-1 rounded bg-red-700 text-black" data-id="${c.id}">Delete</button></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `; }

function CouponEditor() { return `
        <div class="border p-3 rounded border-red-800">
            <h3 class="font-semibold mb-2">Create coupon</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input id="coupon-code" placeholder="Code e.g. WELCOME10" class="p-2 border rounded col-span-2 bg-black text-white" />
                <select id="coupon-type" class="p-2 border rounded bg-black text-white">
                    <option value="percent">Percent %</option>
                    <option value="fixed">Fixed (in cents)</option>
                </select>
                <input id="coupon-value" placeholder="Value" value="10" class="p-2 border rounded bg-black text-white" />
                <input id="coupon-desc" placeholder="Description" class="p-2 border rounded md:col-span-4 bg-black text-white" />
            </div>
            <div class="mt-2"><button id="create-coupon-submit" class="px-3 py-2 rounded bg-red-600 text-black">Create coupon</button></div>
        </div>
    `; }
    
function Footer(content) {
    return `
        <footer class="mt-12 pt-10 border-t border-red-800 text-sm text-gray-400">
            <div class="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 pb-8">
                <div class="col-span-1 sm:col-span-2">
                    <div class="text-xl font-extrabold tracking-tight mb-3">
                        <span class="text-white">BROS</span><span class="text-red-500">MART</span>
                    </div>
                    <p class="text-sm text-red-200">
                        ${content.footerAbout}
                    </p>
                    <p class="mt-4 text-xs text-red-400">${content.copyright}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-white mb-3">SHOP NOW</h4>
                    <ul class="space-y-2">
                        <li><button class="nav-btn p-0 hover:text-red-500" data-view="shop">Shop All</button></li>
                        <li><a class="hover:text-red-500" href="#">Categories</a></li>
                        <li><a class="hover:text-red-500" href="#">My Account</a></li>
                        <li><a class="hover:text-red-500" href="#">Contact Us</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold text-white mb-3">INFORMATION</h4>
                    <ul class="space-y-2">
                        <li><a class="hover:text-red-500" href="#">FAQs</a></li>
                        <li><a class="hover:text-red-500" href="#">Shipping & Returns</a></li>
                        <li><a class="hover:text-red-500" href="#">Privacy Policy</a></li>
                        <li><a class="hover:text-red-500" href="#">Terms of Service</a></li>
                    </ul>
                </div>
                <div class="text-left sm:text-right">
                    <h4 class="font-semibold text-white mb-3">CONNECT</h4>
                    <div class="flex sm:justify-end space-x-4 text-xl">
                        <a class="hover:text-red-500" href="#"><i class="fab fa-facebook-f"></i></a>
                        <a class="hover:text-red-500" href="#"><i class="fab fa-twitter"></i></a>
                        <a class="hover:text-red-500" href="#"><i class="fab fa-instagram"></i></a>
                        <a class="hover:text-red-500" href="#"><i class="fab fa-linkedin-in"></i></a>
                    </div>
                </div>
            </div>
            <div class="text-center py-6">
                <button class="nav-btn px-6 py-3 rounded bg-red-600 text-black font-bold text-lg hover:bg-red-700 transition" data-view="admin">
                    Admin Login
                </button>
            </div>
        </footer>
    `;
}

// এখানে ConfirmationModal ফাংশনটি পরিবর্তন করা হয়েছে
function ConfirmationModal(trackingId) {
    return `
        <div id="confirmation-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div class="bg-white text-black rounded-lg shadow-lg p-6 max-w-md w-full text-center">
                <i class="fas fa-check-circle text-green-500 text-5xl mb-4"></i>
                <h3 class="text-2xl font-bold text-green-600">Order Confirmed!</h3>
                <p class="mt-2">Your order has been successfully placed and verified.</p>
                <p class="mt-3 font-mono text-sm">Tracking ID: <strong>${trackingId}</strong></p>
                <p class="mt-1 text-xs text-gray-600">Please pay on delivery.</p>
                <div class="mt-4 text-right">
                    <button onclick="document.querySelector('#confirmation-modal').remove();" class="px-4 py-2 rounded bg-red-600 text-black font-semibold">OK</button>
                </div>
            </div>
        </div>
    `;
}

// --- Event Listener Attachment and Handlers ---
function attachEventListeners() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = (e) => {
            const target = e.target.closest('[data-view]');
            if (target) {
                const newView = target.dataset.view;
                let viewDataUpdate = { productId: null, editingFeature: null, editingProduct: null };
                if (newView === 'admin') {
                    viewDataUpdate.tab = 'dashboard';
                } else {
                    viewDataUpdate.tab = state.viewData.tab || 'products';
                }
                setState({ view: newView, viewData: { ...state.viewData, ...viewDataUpdate } });
            }
        };
    });
    
    document.querySelectorAll('.product-detail-link').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.add-to-cart-btn')) return; 
            const id = card.dataset.id;
            setState({ view: 'product-detail', viewData: { ...state.viewData, productId: id } });
        };
    });

    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.onclick = (e) => addToCart(e.target.dataset.id, 1);
    });

    document.querySelectorAll('.cart-qty-input').forEach(input => {
        input.onchange = (e) => {
            const qty = Number(e.target.value);
            if (isNaN(qty) || qty < 0) return;
            updateCart(e.target.dataset.id, qty);
        };
    });

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) checkoutBtn.onclick = () => setState({ view: 'checkout' });

    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) {
        applyCouponBtn.onclick = () => {
            const code = document.getElementById('coupon-code-input').value;
            const coupon = applyCouponByCode(code);
            
            // Fixed: Store form data before re-rendering
            const formData = {
                'checkout-name': document.getElementById('checkout-name').value,
                'checkout-email': document.getElementById('checkout-email').value,
                'checkout-phone': document.getElementById('checkout-phone').value,
                'checkout-street': document.getElementById('checkout-street').value,
                'checkout-city': document.getElementById('checkout-city').value,
                'checkout-postal': document.getElementById('checkout-postal').value,
                'checkout-country': document.getElementById('checkout-country').value,
            };

            if (coupon) {
                setState({ appliedCoupon: coupon, notify: `Applied ${coupon.code}` });
            } else {
                setState({ appliedCoupon: null, notify: 'Invalid coupon' });
            }

            // Fixed: Re-apply form data after state update and re-render
            setTimeout(() => {
                const formElements = document.querySelectorAll('#checkout-form-container input, #checkout-form-container textarea');
                formElements.forEach(el => {
                    if (formData[el.id]) {
                        el.value = formData[el.id];
                    }
                });
            }, 50); // A short delay to allow for the re-render
        };
    }

    const placeOrderBtn = document.getElementById('place-order-btn');
    if (placeOrderBtn) {
        placeOrderBtn.onclick = () => {
            const name = document.getElementById('checkout-name').value;
            const email = document.getElementById('checkout-email').value; // Updated
            const phone = document.getElementById('checkout-phone').value;
            const street = document.getElementById('checkout-street').value;
            const city = document.getElementById('checkout-city').value;
            const postal = document.getElementById('checkout-postal').value;
            const country = document.getElementById('checkout-country').value;
            
            if (!name || !email || !phone || !street || !city || !postal || !country) {
                alert('Please fill out all the required fields.');
                return;
            }
            if (!email.includes('@')) {
                alert('Please provide a valid email address.');
                return;
            }
            if (!phone || !phone.startsWith('+88')) {
                alert('Phone Number must start with +88 (e.g., +8801XXXXXXXXX).');
                return;
            }

            const customer = {
                name,
                email,
                phone,
                address: `${street}, ${city}, ${postal}, ${country}`
            };

            placeOrder(customer);
        };
    }
    
    document.getElementById('admin-logout-btn-main')?.addEventListener('click', () => setState({ adminAuthed: false }));
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => setState({ adminAuthed: false }));
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.onclick = (e) => setState({ viewData: { ...state.viewData, tab: e.target.dataset.tab, editingFeature: null } });
    });

    const saveContentBtn = document.getElementById('save-content-btn');
    if(saveContentBtn) {
        saveContentBtn.onclick = async () => {
            const footerAbout = document.getElementById('edit-footer-about').value;
            const copyright = document.getElementById('edit-copyright').value;
            try {
                await fetch(`${API_URL}/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ footerAbout, copyright })
                });
                await fetchState();
                setState({ notify: 'Website content saved!' });
            } catch (error) {
                setState({ notify: 'Failed to save content' });
            }
        };
    }

    const addFeatureBtn = document.getElementById('add-feature-btn');
    if (addFeatureBtn) {
        addFeatureBtn.onclick = async () => {
            const title = document.getElementById('new-feature-title').value;
            const subtitle = document.getElementById('new-feature-subtitle').value;
            const icon = document.getElementById('new-feature-icon').value;
            if (!title || !icon || state.features.length >= 3) { alert('Provide title and icon class, or max limit reached.'); return; }
            try {
                await fetch(`${API_URL}/features`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, subtitle, icon })
                });
                await fetchState();
                setState({ notify: `Feature ${title} added!` });
            } catch (error) {
                setState({ notify: 'Failed to add feature' });
            }
        };
    }
    
    document.querySelectorAll('.edit-feature-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.dataset.id;
            const featureToEdit = state.features.find(f => f.id === id);
            setState({ viewData: { ...state.viewData, editingFeature: featureToEdit } });
        };
    });

    document.querySelectorAll('.cancel-feature-edit-btn').forEach(btn => {
        btn.onclick = () => setState({ viewData: { ...state.viewData, editingFeature: null } });
    });

    document.querySelectorAll('.save-feature-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            const patch = {
                title: document.getElementById(`edit-feature-title-${id}`).value,
                subtitle: document.getElementById(`edit-feature-subtitle-${id}`).value,
                icon: document.getElementById(`edit-feature-icon-${id}`).value,
            };
            try {
                await fetch(`${API_URL}/features/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch)
                });
                await fetchState();
                setState({ viewData: { ...state.viewData, editingFeature: null }, notify: `Feature ${patch.title} saved!` });
            } catch (error) {
                setState({ notify: 'Failed to save feature' });
            }
        };
    });

    document.querySelectorAll('.delete-feature-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            if (!confirm('Delete this feature?')) return;
            try {
                await fetch(`${API_URL}/features/${id}`, { method: 'DELETE' });
                await fetchState();
                setState({ notify: 'Feature deleted' });
            } catch (error) {
                setState({ notify: 'Failed to delete feature' });
            }
        };
    });

    const addSlideSubmit = document.getElementById('add-slide-submit');
    if (addSlideSubmit) {
        addSlideSubmit.onclick = async () => {
            const title = document.getElementById('slide-title').value;
            const subtitle = document.getElementById('slide-subtitle').value;
            const image = document.getElementById('slide-image').value;
            if (!title || !image) { alert('Provide title and image URL'); return; }
            try {
                await fetch(`${API_URL}/slides`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, subtitle, image })
                });
                await fetchState();
                setState({ notify: `Slide ${title} added!` });
            } catch (error) {
                setState({ notify: 'Failed to add slide' });
            }
        };
    }
    
    document.querySelectorAll('.delete-slide-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            if (!confirm('Delete this slide?')) return;
            try {
                await fetch(`${API_URL}/slides/${id}`, { method: 'DELETE' });
                await fetchState();
                setState({ notify: 'Slide deleted' });
            } catch (error) {
                setState({ notify: 'Failed to delete slide' });
            }
        };
    });

    const addProductSubmit = document.getElementById('add-product-submit');
    if (addProductSubmit) {
        addProductSubmit.onclick = async () => {
            const title = document.getElementById('add-title').value;
            const price = Number(document.getElementById('add-price').value);
            const stock = Number(document.getElementById('add-stock').value);
            const image = document.getElementById('add-image').value;
            const desc = document.getElementById('add-desc').value;
            const specialCoupon = document.getElementById('add-special-coupon').value || null;
            if (!title || isNaN(price) || price <= 0) { alert('Provide valid title and price'); return; }
            const newProduct = {
                title, price, stock,
                image: image || `https://picsum.photos/seed/${encodeURIComponent(title)}/800/600`,
                description: desc,
                specialCoupon: specialCoupon.trim() || null 
            };
            try {
                await fetch(`${API_URL}/products`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newProduct)
                });
                await fetchState();
                setState({ notify: `Product ${title} added!` });
            } catch (error) {
                setState({ notify: 'Failed to add product' });
            }
        };
    }
    
    document.querySelectorAll('.edit-product-btn').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.dataset.id;
            const productToEdit = state.products.find(p => p.id === id);
            setState({ viewData: { ...state.viewData, editingProduct: productToEdit } });
        };
    });

    document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
        btn.onclick = () => setState({ viewData: { ...state.viewData, editingProduct: null } });
    });
    
    document.querySelectorAll('.save-product-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            const newPrice = Number(document.getElementById(`edit-price-${id}`).value);
            const newStock = Number(document.getElementById(`edit-stock-${id}`).value);
            if (isNaN(newPrice) || newPrice <= 0 || isNaN(newStock)) {
                alert('Price and Stock must be valid numbers.');
                return;
            }
            const patch = {
                title: document.getElementById(`edit-title-${id}`).value,
                price: newPrice,
                stock: newStock,
                image: document.getElementById(`edit-image-${id}`).value,
                description: document.getElementById(`edit-desc-${id}`).value,
                specialCoupon: document.getElementById(`edit-special-coupon-${id}`).value.trim() || null
            };
            try {
                await fetch(`${API_URL}/products/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch)
                });
                await fetchState();
                setState({ viewData: { ...state.viewData, editingProduct: null }, notify: `Product ${patch.title} saved!` });
            } catch (error) {
                setState({ notify: 'Failed to save product' });
            }
        };
    });
    
    document.querySelectorAll('.delete-product-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            if (!confirm('Delete product?')) return;
            try {
                await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
                await fetchState();
                setState({ notify: 'Product deleted' });
            } catch (error) {
                setState({ notify: 'Failed to delete product' });
            }
        };
    });
    
    document.querySelectorAll('.mark-shipped-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            try {
                await fetch(`${API_URL}/orders/${id}/shipped`, { method: 'PUT' });
                await fetchState();
                setState({ orders: state.orders.map(o => o.id === id ? { ...o, status: 'shipped' } : o), notify: `Order ${id} marked shipped` });
            } catch (error) {
                setState({ notify: 'Failed to update order status' });
            }
        };
    });

    const createCouponSubmit = document.getElementById('create-coupon-submit');
    if (createCouponSubmit) {
        createCouponSubmit.onclick = async () => {
            const code = document.getElementById('coupon-code').value.toUpperCase();
            const type = document.getElementById('coupon-type').value;
            const value = Number(document.getElementById('coupon-value').value);
            const desc = document.getElementById('coupon-desc').value;
            if (!code || isNaN(value) || value <= 0) { alert('Provide valid code and value'); return; }
            const newCoupon = { code, type, value, description: desc };
            try {
                await fetch(`${API_URL}/coupons`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newCoupon)
                });
                await fetchState();
                setState({ notify: `Coupon ${code} created` });
            } catch (error) {
                setState({ notify: 'Failed to create coupon' });
            }
        };
    }
    
    document.querySelectorAll('.delete-coupon-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            if (!confirm('Delete coupon?')) return;
            try {
                await fetch(`${API_URL}/coupons/${id}`, { method: 'DELETE' });
                await fetchState();
                setState({ notify: 'Coupon deleted' });
            } catch (error) {
                setState({ notify: 'Failed to delete coupon' });
            }
        };
    });
    
    const titleElements = document.querySelectorAll('.brosmart-title');
    titleElements.forEach(el => {
        el.onmouseover = () => {
            el.style.transform = 'rotateX(5deg) scale(1.05)';
        };
        el.onmouseout = () => {
            el.style.transform = 'rotateX(0deg) scale(1)';
        };
    });
}

// Initial fetch to load state
window.onload = fetchState;
