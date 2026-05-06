let cart = [];
let currentCategory = 'starter';
let currentTable = null;
let sessionId = null;
let menuData = null;
let isProcessingOrder = false;

// DOM Elements
const menuContainer = document.getElementById('menu-container');
const tabBtns = document.querySelectorAll('.tab-btn');
const cartCount = document.getElementById('bar-cart-count');
const cartTotalBar = document.getElementById('bar-cart-total');
const bottomBar = document.getElementById('bottom-bar');
const cartModal = document.getElementById('cart-modal');
const closeCart = document.getElementById('close-cart');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotal = document.getElementById('cart-total');
const placeOrderBtn = document.getElementById('place-order-btn');
const tableNoInput = document.getElementById('welcome-table-no');
const menuSearch = document.getElementById('menu-search');
let storeSettings = { storeName: 'DesignE' };

// Initialize App
function init() {
    checkLicense();
    setupListeners();
    checkSession();
    updateRequestBillVisibility();
    initTabIndicator();
    loadStoreSettings();
    loadCategories(); // New: Load categories first
    watchMenu();      // New: Real-time menu updates
    watchOffers();    // New: Real-time offers updates
}

function loadCategories() {
    db.ref('categories').orderByChild('order').on('value', snapshot => {
        const categories = snapshot.val();
        if (!categories) return;

        const tabsWrapper = document.querySelector('.tabs');
        const indicator = document.getElementById('tab-indicator');
        tabsWrapper.innerHTML = '';
        tabsWrapper.appendChild(indicator);

        Object.entries(categories).forEach(([id, cat], index) => {
            const btn = document.createElement('button');
            btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
            btn.dataset.category = id;
            btn.innerText = cat.name;
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateTabIndicator(btn);
                currentCategory = id;
                renderMenu(menuData);
            };
            tabsWrapper.appendChild(btn);
            if (index === 0) {
                currentCategory = id;
                setTimeout(() => updateTabIndicator(btn), 100);
            }
        });
    });
}

function loadStoreSettings() {
    db.ref('settings').on('value', snapshot => {
        if (snapshot.exists()) {
            storeSettings = { ...storeSettings, ...snapshot.val() };
            const name = storeSettings.storeName || 'DesignE';
            
            // Update Title
            document.title = `${name} | Digital Menu`;
            
            // Update Logo/Header
            const logoEl = document.querySelector('.logo');
            if (logoEl) logoEl.innerText = name;

            // Update Welcome Modal
            const brandSpan = document.querySelector('#welcome-modal .primary-brand-name');
            if (brandSpan) brandSpan.innerText = name;
        }
    });
}

function watchMenu() {
    renderSkeletons();
    db.ref('menu').on('value', snapshot => {
        menuData = snapshot.val();
        renderMenu(menuData);
    }, err => {
        console.error("Failed to watch menu:", err);
        menuContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Menu is currently unavailable. Please check back later.</p>';
    });
}

function watchOffers() {
    const offersSection = document.getElementById('offers-section');
    db.ref('offers').on('value', snapshot => {
        const data = snapshot.val();
        if (!data) {
            if (offersSection) offersSection.style.display = 'none';
            return;
        }
        renderOffers(data);
    }, err => {
        console.error("Failed to watch offers:", err);
        if (offersSection) offersSection.style.display = 'none';
    });
}

function renderOffers(offers) {
    const offersSection = document.getElementById('offers-section');
    const offersContainer = document.getElementById('offers-container');
    const activeOffers = Object.entries(offers).filter(([id, o]) => o.active !== false);

    if (activeOffers.length === 0) {
        offersSection.style.display = 'none';
        return;
    }

    offersSection.style.display = 'block';
    offersContainer.innerHTML = '';

    activeOffers.forEach(([id, offer]) => {
        const offerCard = document.createElement('div');
        offerCard.className = 'offer-card';
        offerCard.style.backgroundImage = `url('${offer.image || 'https://images.unsplash.com/photo-1476224483470-4f981f360a1e?w=800'}')`;
        offerCard.innerHTML = `
            ${offer.tag ? `<div class="offer-tag">${offer.tag}</div>` : ''}
            <div class="offer-content">
                <h3 class="offer-title">${offer.title}</h3>
                <p class="offer-desc">${offer.description}</p>
                <div class="offer-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                    <span class="offer-price" style="font-weight: 800; color: white; font-size: 1.1rem;">₹${offer.price || 0}</span>
                    <button class="offer-add-btn" onclick="addToCart('${id}', '${offer.title}', ${offer.price || 0})">ADD +</button>
                </div>
            </div>
        `;
        offersContainer.appendChild(offerCard);
    });

    const indicators = document.querySelector('.scroll-indicators');
    if (indicators) {
        indicators.innerHTML = activeOffers.map((_, idx) => `<div class="dot ${idx === 0 ? 'active' : ''}"></div>`).join('');
        offersContainer.addEventListener('scroll', () => {
            const index = Math.round(offersContainer.scrollLeft / offersContainer.offsetWidth);
            const dots = indicators.querySelectorAll('.dot');
            dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        });
    }
}

function renderMenu(items) {
    if (!items) {
        renderSkeletons();
        return;
    }

    const searchTerm = (menuSearch && menuSearch.value) ? menuSearch.value.toLowerCase().trim() : '';
    
    const filteredItems = Object.entries(items).filter(([id, item]) => {
        const matchesCategory = item.category === currentCategory;
        const matchesSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) || 
            item.description.toLowerCase().includes(searchTerm);
        
        return item.available !== false && (searchTerm ? matchesSearch : matchesCategory);
    });

    if (filteredItems.length === 0) {
        menuContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; opacity: 0.6;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                <p style="font-weight: 600;">${searchTerm ? `No items found for "${searchTerm}"` : 'No items found in this category yet.'}</p>
            </div>
        `;
        return;
    }

    // Optimization: Batch DOM updates using DocumentFragment
    const fragment = document.createDocumentFragment();
    filteredItems.forEach(([id, item]) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'menu-item glass';
        let actionsHtml = '';

        if (item.variants && item.variants.length > 0) {
            const chipsHtml = item.variants.map((v, idx) => `
                <button class="variant-chip ${idx === 0 ? 'active' : ''}" data-price="${v.price}" data-variant="${v.name}" onclick="selectVariant(this, '${id}')">
                    ${v.name}
                </button>
            `).join('');
            actionsHtml = `<div class="variant-chips" id="chips-${id}">${chipsHtml}</div>
                           <button class="add-btn" onclick="addSelectedVariantToCart('${id}', '${item.name}')">Add to Cart</button>`;
        } else {
            actionsHtml = `<button class="add-btn" onclick="addToCart('${id}', '${item.name}', ${item.price})">Add to Cart</button>`;
        }

        itemEl.innerHTML = `
            <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}" alt="${item.name}" class="item-img" loading="lazy">
            <div class="item-info">
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    ${item.dietary ? `<span class="${item.dietary}-badge">${item.dietary === 'nonveg' ? 'Non-Veg' : item.dietary.charAt(0).toUpperCase() + item.dietary.slice(1)}</span>` : ''}
                    <span class="item-name">${item.name}</span>
                </div>
                <span class="item-price" id="price-${id}">${item.variants && item.variants.length > 0 ? '₹' + item.variants[0].price : '₹' + item.price}</span>
            </div>
            <p class="item-desc">${item.description}</p>
            <div class="item-actions">${actionsHtml}</div>
        `;
        fragment.appendChild(itemEl);
    });

    menuContainer.innerHTML = '';
    menuContainer.appendChild(fragment);
}

function renderSkeletons() {
    menuContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const skeletonEl = document.createElement('div');
        skeletonEl.className = 'menu-item glass';
        skeletonEl.innerHTML = `
            <div class="skeleton skeleton-img"></div>
            <div class="item-info">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-price"></div>
            </div>
            <div class="skeleton skeleton-desc"></div>
            <div class="skeleton skeleton-btn"></div>
        `;
        menuContainer.appendChild(skeletonEl);
    }
}

function initTabIndicator() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) updateTabIndicator(activeTab);
    window.addEventListener('resize', () => {
        const currentActive = document.querySelector('.tab-btn.active');
        if (currentActive) updateTabIndicator(currentActive);
    });
}

function updateTabIndicator(btn) {
    const indicator = document.getElementById('tab-indicator');
    if (indicator) {
        indicator.style.width = `${btn.offsetWidth}px`;
        indicator.style.left = `${btn.offsetLeft}px`;
    }
}

window.selectVariant = (chip, id) => {
    const container = document.getElementById(`chips-${id}`);
    container.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    document.getElementById(`price-${id}`).innerText = `₹${chip.dataset.price}`;
};

window.addSelectedVariantToCart = (id, baseName) => {
    const activeChip = document.querySelector(`#chips-${id} .variant-chip.active`);
    if (activeChip) {
        const variantName = activeChip.dataset.variant;
        const variantPrice = parseFloat(activeChip.dataset.price);
        addToCart(id, `${baseName} (${variantName})`, variantPrice, variantName);
    }
};

function setupListeners() {
    // Removed tabBtns.forEach loop as it is now handled by loadCategories() dynamically
    
    const triggerAndCart = [document.getElementById('bar-cart-trigger'), document.getElementById('bar-open-cart-btn')];
    triggerAndCart.forEach(el => {
        if (el) el.addEventListener('click', () => {
            renderCart();
            updateRequestBillVisibility();
            cartModal.classList.add('active');
        });
    });

    if (closeCart) closeCart.addEventListener('click', () => cartModal.classList.remove('active'));
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', placeOrder);

    const reqBillBtn = document.getElementById('request-bill-btn');
    if (reqBillBtn) reqBillBtn.addEventListener('click', openBillSummary);
    
    const barReqBillBtn = document.getElementById('bar-request-bill-btn');
    if (barReqBillBtn) barReqBillBtn.addEventListener('click', openBillSummary);

    const closeBillSummary = document.getElementById('close-bill-summary');
    if (closeBillSummary) closeBillSummary.addEventListener('click', () => document.getElementById('bill-summary-modal').classList.remove('active'));

    const confirmBillBtn = document.getElementById('confirm-bill-btn');
    if (confirmBillBtn) confirmBillBtn.addEventListener('click', requestBill);
    
    const startOrderBtnAct = document.getElementById('start-order-btn');
    if (startOrderBtnAct) startOrderBtnAct.addEventListener('click', handleTableSelection);
    
    if (menuSearch) {
        menuSearch.addEventListener('input', () => {
            if (menuSearch.value.trim().length > 0) {
                // If searching, we might want to hide categories or just filter within current
                // For now, let's filter globally if searching, but show current category if empty
                renderMenu(menuData);
            } else {
                renderMenu(menuData);
            }
        });
    }
}

function checkSession() {
    const storedTable = localStorage.getItem('caferesto_table');
    const storedSession = localStorage.getItem('caferesto_session');
    const storedPhone = localStorage.getItem('caferesto_phone');
    const storedName = localStorage.getItem('caferesto_name');

    if (storedTable && storedSession) {
        document.getElementById('welcome-modal').classList.remove('active');
        
        db.ref('tables/table_' + storedTable).once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.status === 'occupied' && data.sessionId === storedSession) {
                currentTable = storedTable;
                sessionId = storedSession;
                window.customerPhone = storedPhone;
                window.customerName = storedName;
                if (bottomBar) bottomBar.classList.add('active');
                updateRequestBillVisibility();
                watchSessionStatus();
            } else {
                localStorage.clear();
                document.getElementById('welcome-modal').classList.add('active');
            }
        });
    } else {
        document.getElementById('welcome-modal').classList.add('active');
        if (bottomBar) bottomBar.classList.remove('active');
    }
}

// Optimization: Static listener to prevent memory leaks from multiple .on() calls
let sessionStatusListenerAttached = false;

function updateRequestBillVisibility() {
    const btnModal = document.getElementById('request-bill-btn');
    const btnBar = document.getElementById('bar-request-bill-btn');

    if (sessionId && !sessionStatusListenerAttached) {
        sessionStatusListenerAttached = true;
        db.ref('sessions/' + sessionId).on('value', snapshot => {
            const data = snapshot.val();
            const showBtn = data && data.items && data.items.length > 0;
            const isBillRequested = data && data.status === 'bill_requested';

            [btnModal, btnBar].forEach(btn => {
                if (btn) {
                    btn.style.display = showBtn ? 'block' : 'none';
                    if (isBillRequested) {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-check"></i> BILL REQUESTED';
                        btn.style.opacity = '0.7';
                    } else {
                        btn.disabled = false;
                        btn.innerHTML = btn === btnBar ? '<i class="fas fa-file-invoice-dollar"></i> BILL' : 'REQUEST BILL';
                        btn.style.opacity = '1';
                    }
                }
            });
        });
    }
}

function handleTableSelection() {
    const input = document.getElementById('welcome-table-no');
    const phoneInput = document.getElementById('welcome-phone');
    const nameInput = document.getElementById('welcome-name');
    const errorMsg = document.getElementById('table-error');
    const startBtn = document.getElementById('start-order-btn');

    const tableNo = parseInt(input.value).toString();
    const phone = phoneInput.value;
    const name = nameInput.value;

    const originalText = startBtn.innerHTML;

    function showTableError(msg) {
        errorMsg.innerText = msg;
        errorMsg.style.display = 'block';
        startBtn.disabled = false;
        startBtn.innerHTML = originalText;
    }

    if (!name || name.trim().length < 2) { showTableError("Please enter your name"); return; }
    if (!tableNo || tableNo < 1) { showTableError("Please enter a valid table number"); return; }
    if (!phone || phone.trim().length < 10) { showTableError("Please enter a valid 10-digit number"); return; }

    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> VERIFYING...';

    db.ref('settings/tableLimit').once('value').then(limitSnapshot => {
        const maxTables = parseInt(limitSnapshot.val()) || 20;
        if (parseInt(tableNo) > maxTables) {
            showTableError(`Invalid Table Number. Max is ${maxTables}.`);
            return;
        }

        const tableRef = db.ref('tables/table_' + tableNo);
        tableRef.once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.status === 'occupied' && data.sessionId !== localStorage.getItem('caferesto_session')) {
                showTableError(`Table ${tableNo} is already occupied.`);
                startBtn.disabled = false;
                startBtn.innerHTML = originalText;
            } else {
                const newSessionId = (data && data.sessionId) ? data.sessionId : Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const sessionInit = {
                    tableNo, customerName: name, customerPhone: phone,
                    status: 'active', startTime: Date.now(), total: 0, subtotal: 0, items: []
                };

                db.ref('sessions/' + newSessionId).set(sessionInit).then(() => {
                    tableRef.update({
                        status: 'occupied', sessionId: newSessionId,
                        timestamp: Date.now(), customerName: name, customerPhone: phone
                    }).then(() => {
                        currentTable = tableNo; sessionId = newSessionId;
                        window.customerPhone = phone; window.customerName = name;
                        localStorage.setItem('caferesto_table', currentTable);
                        localStorage.setItem('caferesto_session', sessionId);
                        localStorage.setItem('caferesto_phone', phone);
                        localStorage.setItem('caferesto_name', name);
                        document.getElementById('welcome-modal').classList.remove('active');
                        if (bottomBar) bottomBar.classList.add('active');
                        watchSessionStatus();
                    });
                });
            }
        });
    });
}

function watchSessionStatus() {
    if (!currentTable || !sessionId) return;
    const tableRef = db.ref('tables/table_' + currentTable);
    tableRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data || data.status !== 'occupied' || data.sessionId !== sessionId) {
            tableRef.off();
            showToast('Session ended. Refreshing...', 'info');
            localStorage.clear();
            setTimeout(() => window.location.reload(), 1500);
        }
    });
}

window.addToCart = (id, displayName, price, variant = null) => {
    const cartId = variant ? `${id}-${variant}` : id;
    const existing = cart.find(item => item.cartId === cartId);
    if (existing) existing.quantity += 1;
    else cart.push({ id, cartId, name: displayName, price, quantity: 1, variant });
    updateCartUI();
    showToast(`Added ${displayName}`, 'success');
    // Bounce the cart counter
    if (cartCount) {
        cartCount.classList.remove('bounce');
        void cartCount.offsetWidth; // force reflow
        cartCount.classList.add('bounce');
    }
};

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.className = 'toast'; // reset classes
    if (type) toast.classList.add(type);
    toast.querySelector('span').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showOrderSuccess() {
    const el = document.createElement('div');
    el.className = 'order-success-toast';
    el.innerHTML = '<i class="fas fa-check-circle"></i> Order placed successfully!';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function renderCart() {
    cartItemsList.innerHTML = '';
    let total = 0;
    if (cart.length === 0) {
        cartItemsList.innerHTML = '<p style="text-align: center; opacity: 0.5;">Your cart is empty.</p>';
        cartTotal.innerText = '₹0';
        return;
    }
    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div><div style="font-weight: 700">${item.name}</div><div style="font-size: 0.8rem; opacity: 0.6;">₹${item.price}</div></div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
            </div>
        `;
        cartItemsList.appendChild(itemEl);
    });
    cartTotal.innerText = `₹${total}`;
}

window.updateQty = (index, delta) => {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) cart.splice(index, 1);
    renderCart();
    updateCartUI();
};

function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (cartCount) cartCount.innerText = totalItems;
    if (cartTotalBar) cartTotalBar.innerText = `₹${totalPrice}`;
}

function placeOrder() {
    if (isProcessingOrder || cart.length === 0) return;
    isProcessingOrder = true;
    const originalBtn = placeOrderBtn.innerHTML;
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PLACING...';

    const order = {
        tableNo: currentTable, items: cart, timestamp: Date.now(),
        status: 'pending', sessionId, customerPhone: window.customerPhone,
        comment: document.getElementById('order-comment') ? document.getElementById('order-comment').value.trim() : ""
    };

    db.ref('orders').push(order).then(() => {
        const sessionRef = db.ref('sessions/' + sessionId);
        sessionRef.once('value').then(snapshot => {
            const data = snapshot.val();
            const existingItems = data.items || [];
            cart.forEach(c => {
                const found = existingItems.find(i => i.cartId === c.cartId);
                if (found) found.quantity += c.quantity;
                else existingItems.push(c);
            });
            const newSubtotal = existingItems.reduce((s, i) => s + (i.price * i.quantity), 0);
            let newTotal = newSubtotal;
            if (data.modifiers && Array.isArray(data.modifiers)) {
                data.modifiers.forEach(mod => {
                    const amount = mod.isPercentage ? (newSubtotal * (mod.value / 100)) : mod.value;
                    if (mod.type === 'discount') newTotal -= amount;
                    else newTotal += amount;
                });
            }
            newTotal = Math.max(0, Math.round(newTotal));

            sessionRef.update({
                items: existingItems,
                subtotal: newSubtotal,
                total: newTotal,
                lastOrderTime: Date.now()
            }).then(() => {
                showOrderSuccess();
                cart = [];
                updateCartUI();
                cartModal.classList.remove('active');
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = originalBtn;
                isProcessingOrder = false;
            });
        });
    });
}

function requestBill() {
    if (!sessionId) return;
    const btn = document.getElementById('confirm-bill-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REQUESTING...';

    firebase.database().ref('sessions/' + sessionId).update({ status: 'bill_requested', billRequestedAt: Date.now() })
        .then(() => {
            showToast('Bill requested! 🧾', 'success');
            document.getElementById('bill-summary-modal').classList.remove('active');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }).catch(err => {
            console.error("Bill request failed:", err);
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
}

function openBillSummary() {
    if (!sessionId) return;
    renderBillSummary();
    document.getElementById('bill-summary-modal').classList.add('active');
    // Also close cart modal if open
    cartModal.classList.remove('active');
}

function renderBillSummary() {
    const billItemsList = document.getElementById('bill-items-list');
    const billTotalEl = document.getElementById('bill-summary-total');
    
    billItemsList.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-circle-notch fa-spin"></i></div>';

    db.ref('sessions/' + sessionId).once('value').then(snapshot => {
        const data = snapshot.val();
        if (!data || !data.items || data.items.length === 0) {
            billItemsList.innerHTML = '<p style="text-align: center; opacity: 0.5;">No items ordered yet.</p>';
            billTotalEl.innerText = '₹0';
            return;
        }

        billItemsList.innerHTML = '';
        data.items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'cart-item';
            itemEl.style.padding = '0.8rem 0';
            itemEl.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            itemEl.innerHTML = `
                <div>
                    <div style="font-weight: 700">${item.name}</div>
                    <div style="font-size: 0.8rem; opacity: 0.6;">₹${item.price} x ${item.quantity}</div>
                </div>
                <div style="font-weight: 800; color: white;">₹${item.price * item.quantity}</div>
            `;
            billItemsList.appendChild(itemEl);
        });

        // Add Modifiers if any
        if (data.modifiers && data.modifiers.length > 0) {
            data.modifiers.forEach(mod => {
                const calculatedAmt = mod.isPercentage ? (data.subtotal * (mod.value / 100)) : mod.value;
                const sign = mod.type === 'discount' ? '-' : '+';
                const modEl = document.createElement('div');
                modEl.className = 'cart-item';
                modEl.style.padding = '0.5rem 0';
                modEl.style.fontSize = '0.85rem';
                modEl.style.color = mod.type === 'discount' ? 'var(--accent-starter)' : 'var(--primary)';
                modEl.innerHTML = `
                    <div>${mod.label} ${mod.isPercentage ? `(${mod.value}%)` : ''}</div>
                    <div style="font-weight: 700;">${sign}₹${Math.round(calculatedAmt)}</div>
                `;
                billItemsList.appendChild(modEl);
            });
        }

        billTotalEl.innerText = `₹${data.total || 0}`;
    });
}

window.callWaiter = () => {
    if (!sessionId) return;
    firebase.database().ref('waiter_calls').push({
        tableNo: currentTable, customerName: window.customerName,
        timestamp: Date.now(), status: 'pending', sessionId
    }).then(() => showToast("Waiter called!"));
};

// --- Connection Optimization ---
// Automatically disconnects from Firebase when the tab is hidden to save connections.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log('[Firebase] User Tab hidden. Conserving connections...');
        firebase.database().goOffline();
        if (typeof saasDb !== 'undefined') saasDb.goOffline();
    } else {
        console.log('[Firebase] User Tab active. Restoring connections...');
        firebase.database().goOnline();
        if (typeof saasDb !== 'undefined') saasDb.goOnline();
    }
});

init();
